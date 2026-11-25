const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const Medicine = require("../models/Medicine");
const MedicinePrice = require("../models/MedicinePrice");
const { protect, authorize } = require("../middleware/authMiddleware");
const { scoreMedicineMatch } = require("../services/fuzzySearch");
const { fetchOpenFdaDrugs, fetchNihRxTerms } = require("../services/liveDataService");
const { recordAudit } = require("../services/auditService");

// Get medicines with fast server-side pagination, search, category & sort - Public API
router.get("/", async (req, res) => {
    try {
        const {
            q = "",
            category = "",
            editorialStatus = "",
            sort = "default",
            page = "1",
            limit = "24"
        } = req.query;

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 24));

        const filter = {};
        if (category && category !== "all") {
            filter.category = String(category);
        }
        if (editorialStatus && editorialStatus !== "all") {
            filter.editorialStatus = String(editorialStatus);
        }

        const categories = await Medicine.distinct("category");

        let suggestion = null;
        let items = [];
        let total = 0;

        if (typeof q === "string" && q.trim()) {
            const query = q.trim();
            const safeRegex = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const directMatches = await Medicine.find({
                ...filter,
                $or: [
                    { name: { $regex: safeRegex, $options: "i" } },
                    { genericName: { $regex: safeRegex, $options: "i" } },
                    { manufacturer: { $regex: safeRegex, $options: "i" } },
                    { category: { $regex: safeRegex, $options: "i" } },
                    { aliases: { $regex: safeRegex, $options: "i" } }
                ]
            }).lean();

            if (directMatches.length > 0) {
                items = directMatches;
            } else {
                // Spelling-tolerance / bilingual fuzzy fallback across catalog
                const all = await Medicine.find(filter).lean();
                const scored = all
                    .map((m) => ({ m, score: scoreMedicineMatch(m, query) }))
                    .filter((x) => x.score >= 0.55)
                    .sort((a, b) => b.score - a.score);
                if (scored.length > 0) {
                    suggestion = scored[0].m.name;
                    items = scored.map((x) => ({ ...x.m, matchScore: x.score }));
                }
            }

            if (sort === "low") items.sort((a, b) => a.mrp - b.mrp);
            else if (sort === "high") items.sort((a, b) => b.mrp - a.mrp);
            else if (sort === "name") items.sort((a, b) => a.name.localeCompare(b.name));

            total = items.length;
            items = items.slice((pageNum - 1) * limitNum, pageNum * limitNum);
        } else {
            const sortObj =
                sort === "low"
                    ? { mrp: 1 }
                    : sort === "high"
                        ? { mrp: -1 }
                        : sort === "name"
                            ? { name: 1 }
                            : { createdAt: -1 };

            total = await Medicine.countDocuments(filter);
            items = await Medicine.find(filter)
                .sort(sortObj)
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .lean();
        }

        res.status(200).json({
            success: true,
            count: items.length,
            total,
            page: pageNum,
            totalPages: Math.max(1, Math.ceil(total / limitNum)),
            categories: categories.filter(Boolean).sort(),
            suggestion,
            data: items
        });
    } catch {
        res.status(500).json({
            success: false,
            message: "Failed to fetch medicines."
        });
    }
});

// Live External API Lookup (OpenFDA Drug NDC + NIH ClinicalTables RxTerms)
router.get("/live-lookup", async (req, res) => {
    try {
        const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
        if (!q || q.length > 100) {
            return res.status(400).json({ success: false, message: "Enter a medicine name to look up live." });
        }

        const [fdaResults, nihResults] = await Promise.all([
            fetchOpenFdaDrugs({ query: q, limit: 8 }),
            fetchNihRxTerms(q)
        ]);

        res.status(200).json({
            success: true,
            query: q,
            fdaCount: fdaResults.length,
            nihCount: nihResults.length,
            fdaResults,
            nihResults,
            fetchedAt: new Date().toISOString()
        });
    } catch {
        res.status(500).json({ success: false, message: "Live external lookup failed." });
    }
});

// Fast Autocomplete with spelling tolerance - Public API
router.get("/autocomplete", async (req, res) => {
    try {
        const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
        if (!q || q.length > 100) {
            return res.status(200).json({ success: true, suggestions: [] });
        }

        const safeRegex = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const direct = await Medicine.find({
            $or: [
                { name: { $regex: safeRegex, $options: "i" } },
                { genericName: { $regex: safeRegex, $options: "i" } },
                { aliases: { $regex: safeRegex, $options: "i" } }
            ]
        })
            .limit(8)
            .lean();

        if (direct.length > 0) {
            return res.status(200).json({
                success: true,
                suggestions: direct.map((m) => ({
                    _id: m._id,
                    name: m.name,
                    genericName: m.genericName,
                    category: m.category,
                    mrp: m.mrp,
                    isDemo: Boolean(m.isDemo),
                    fuzzyMatch: false
                }))
            });
        }

        // Fuzzy fallback
        const all = await Medicine.find().limit(1000).lean();
        const suggestions = all
            .map((m) => ({ m, score: scoreMedicineMatch(m, q) }))
            .filter((x) => x.score >= 0.55)
            .sort((a, b) => b.score - a.score)
            .slice(0, 8)
            .map(({ m, score }) => ({
                _id: m._id,
                name: m.name,
                genericName: m.genericName,
                category: m.category,
                mrp: m.mrp,
                isDemo: Boolean(m.isDemo),
                fuzzyMatch: score < 0.85
            }));

        res.status(200).json({ success: true, suggestions });
    } catch {
        res.status(500).json({ success: false, message: "Autocomplete failed." });
    }
});

// Legacy Search endpoint - Public API
router.get("/search", async (req, res) => {
    try {
        const { name } = req.query;
        if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
            return res.status(400).json({ success: false, message: "Valid medicine name is required." });
        }

        const safeRegex = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        let matches = await Medicine.find({
            $or: [
                { name: { $regex: safeRegex, $options: "i" } },
                { genericName: { $regex: safeRegex, $options: "i" } }
            ]
        })
            .limit(40)
            .lean();

        if (matches.length === 0) {
            const all = await Medicine.find().limit(1000).lean();
            matches = all
                .map((m) => ({ m, score: scoreMedicineMatch(m, name.trim()) }))
                .filter((x) => x.score >= 0.55)
                .sort((a, b) => b.score - a.score)
                .slice(0, 20)
                .map((x) => x.m);
        }

        res.status(200).json({ success: true, count: matches.length, data: matches });
    } catch {
        res.status(500).json({ success: false, message: "Medicine search failed." });
    }
});

// Get single medicine detail + pharmacy prices
router.get("/:id", async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid medicine ID." });
        }
        const medicine = await Medicine.findById(req.params.id).lean();
        if (!medicine) {
            return res.status(404).json({ success: false, message: "Medicine not found." });
        }

        const prices = await MedicinePrice.find({ medicine: medicine._id })
            .populate({
                path: "pharmacy",
                match: { $or: [{ isVerified: true }, { owner: null }] },
                select: "-owner -posSandboxKey -staff -suppliers"
            })
            .sort({ sellingPrice: 1 })
            .lean();

        res.status(200).json({
            success: true,
            data: medicine,
            prices: prices.filter((p) => p.pharmacy)
        });
    } catch {
        res.status(500).json({ success: false, message: "Failed to load medicine details." });
    }
});

// Add a new medicine - Admin only
router.post("/", protect, authorize("admin"), async (req, res) => {
    try {
        const {
            name,
            genericName = "",
            manufacturer = "Verified Catalog Source",
            mrp,
            category = "General Catalog",
            dosage = "Not specified",
            description = "Educational catalog entry.",
            sourceCitation = "MedWatch Editorial Review",
            aliases = []
        } = req.body || {};

        if (typeof name !== "string" || !name.trim() || typeof mrp !== "number" || mrp < 0) {
            return res.status(400).json({ success: false, message: "Valid name and non-negative MRP are required." });
        }

        const existing = await Medicine.findOne({
            name: { $regex: `^${name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" }
        });
        if (existing) {
            return res.status(409).json({ success: false, message: "Duplicate catalog entry detected with the same name." });
        }

        const savedMedicine = await Medicine.create({
            name: name.trim(),
            genericName: genericName.trim() || name.trim(),
            manufacturer: manufacturer.trim(),
            mrp,
            category: category.trim(),
            dosage: dosage.trim(),
            description: description.trim(),
            sourceCitation: sourceCitation.trim(),
            sourceLastVerifiedAt: new Date(),
            editorialStatus: "verified",
            aliases: Array.isArray(aliases) ? aliases : [],
            isDemo: false
        });

        await recordAudit({
            req,
            action: "catalog.medicine_created",
            domain: "catalog",
            targetType: "Medicine",
            targetId: savedMedicine._id,
            summary: `Added catalog record ${savedMedicine.name}`
        });

        res.status(201).json({ success: true, message: "Medicine added successfully!", data: savedMedicine });
    } catch {
        res.status(400).json({ success: false, message: "Failed to add medicine." });
    }
});

// Editorial update - Admin only
router.patch("/:id", protect, authorize("admin"), async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid medicine ID." });
        }

        const allowed = [
            "name", "genericName", "manufacturer", "mrp", "category",
            "dosage", "description", "sourceCitation", "editorialStatus", "warnings", "storageInfo"
        ];
        const updates = { sourceLastVerifiedAt: new Date() };
        for (const key of allowed) {
            if (req.body?.[key] !== undefined) updates[key] = req.body[key];
        }

        const updated = await Medicine.findByIdAndUpdate(
            req.params.id,
            { $set: updates },
            { new: true, runValidators: true }
        );
        if (!updated) {
            return res.status(404).json({ success: false, message: "Medicine not found." });
        }

        await recordAudit({
            req,
            action: "catalog.medicine_updated",
            domain: "catalog",
            targetType: "Medicine",
            targetId: updated._id,
            summary: `Updated editorial metadata for ${updated.name}`
        });

        res.status(200).json({ success: true, message: "Catalog record updated.", data: updated });
    } catch {
        res.status(400).json({ success: false, message: "Failed to update medicine." });
    }
});

module.exports = router;
