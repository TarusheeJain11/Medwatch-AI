const express = require("express");
const router = express.Router();

const Pharmacy = require("../models/Pharmacy");
const KnowledgeDoc = require("../models/KnowledgeDoc");
const { protect, authorize, optionalAuth, isPharmacyOwnerRole } = require("../middleware/authMiddleware");
const {
    runRagAssistant,
    analyzeOperationalIntelligence,
    runAiEvaluationSuite
} = require("../services/aiService");
const { recordAudit } = require("../services/auditService");

// Educational RAG Assistant - Public/Guest friendly with strict clinical & injection guardrails
router.post("/ask", optionalAuth, async (req, res) => {
    try {
        const { query = "", language = "en" } = req.body || {};
        if (typeof query !== "string" || query.length > 500) {
            return res.status(400).json({
                success: false,
                message: "Query must be text up to 500 characters."
            });
        }

        const result = await runRagAssistant({ query, language });

        await recordAudit({
            req,
            action: result.abstained ? "ai.abstained" : "ai.answered",
            domain: "ai",
            summary: `AI query processed (${result.reason})`
        });

        res.status(200).json({ success: true, ...result });
    } catch {
        res.status(500).json({ success: false, message: "AI assistant unavailable." });
    }
});

// Reviewed Knowledge Base Documents
router.get("/knowledge", async (req, res) => {
    try {
        const docs = await KnowledgeDoc.find({ isReviewed: true }).sort({ category: 1 }).lean();
        res.status(200).json({ success: true, data: docs });
    } catch {
        res.status(500).json({ success: false, message: "Failed to load knowledge documents." });
    }
});

// Partner & Admin Intelligence: Duplicates, Expiry Risk, Low Stock, Price Anomalies
router.get("/partner-insights", protect, authorize("pharmacy", "admin"), async (req, res) => {
    try {
        let pharmacyIds = null;
        if (isPharmacyOwnerRole(req.user.role)) {
            const owned = await Pharmacy.find({ owner: req.user._id }).select("_id");
            pharmacyIds = owned.map((p) => p._id);
        }
        const report = await analyzeOperationalIntelligence(pharmacyIds);
        res.status(200).json({ success: true, data: report });
    } catch {
        res.status(500).json({ success: false, message: "Failed to run operational intelligence." });
    }
});

// Simulated OCR-like Non-Sensitive Label Metadata Extractor (requires human confirmation before saving)
router.post("/ocr-extract", protect, authorize("pharmacy", "admin"), async (req, res) => {
    try {
        const { labelText = "" } = req.body || {};
        if (typeof labelText !== "string" || !labelText.trim()) {
            return res.status(400).json({ success: false, message: "Paste packaging/invoice text to parse." });
        }

        const batchMatch = labelText.match(/batch[:\s#-]*([A-Z0-9-]{3,20})/i);
        const expiryMatch = labelText.match(/exp(?:iry)?[:\s-]*(\d{4}-\d{2}-\d{2}|\d{2}\/\d{4})/i);
        const mrpMatch = labelText.match(/(?:mrp|price|rs\.?|₹)[:\s]*(\d+(?:\.\d{1,2})?)/i);
        const qtyMatch = labelText.match(/(?:qty|stock|units)[:\s]*(\d+)/i);

        res.status(200).json({
            success: true,
            requiresHumanConfirmation: true,
            extracted: {
                batchNumber: batchMatch ? batchMatch[1].toUpperCase() : "REVIEW-NEEDED",
                expiryDate: expiryMatch ? expiryMatch[1] : "",
                suggestedPrice: mrpMatch ? Number(mrpMatch[1]) : null,
                stockQuantity: qtyMatch ? Number(qtyMatch[1]) : null
            },
            note: "Human verification required before saving extracted fields to inventory."
        });
    } catch {
        res.status(500).json({ success: false, message: "Metadata extraction failed." });
    }
});

// Admin AI Evaluation Suite
router.post("/evaluate", protect, authorize("admin"), async (req, res) => {
    try {
        const report = await runAiEvaluationSuite();
        await recordAudit({
            req,
            action: "ai.evaluation_run",
            domain: "ai",
            summary: `Ran AI evaluation suite (${report.passed}/${report.total} passed)`
        });
        res.status(200).json({ success: true, data: report });
    } catch {
        res.status(500).json({ success: false, message: "AI evaluation failed." });
    }
});

module.exports = router;
