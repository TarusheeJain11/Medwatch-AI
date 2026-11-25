const express = require("express");
const router = express.Router();

const User = require("../models/User");
const DemoOrder = require("../models/DemoOrder");
const SupportTicket = require("../models/SupportTicket");
const Notification = require("../models/Notification");
const PrivacyRequest = require("../models/PrivacyRequest");
const { COOKIE_NAME, protect } = require("../middleware/authMiddleware");
const { recordAudit } = require("../services/auditService");

// DPDP Act Data Export (JSON)
router.get("/export", protect, async (req, res) => {
    try {
        const [user, orders, tickets, notifications] = await Promise.all([
            User.findById(req.user._id).select("-password -mfaCodeHint -passwordResetTokenHash").lean(),
            DemoOrder.find({ customer: req.user._id }).lean(),
            SupportTicket.find({ user: req.user._id }).lean(),
            Notification.find({ recipient: req.user._id }).lean()
        ]);

        await PrivacyRequest.create({
            user: req.user._id,
            requestType: "export",
            status: "completed",
            processedAt: new Date()
        });

        await recordAudit({
            req,
            action: "privacy.data_exported",
            domain: "privacy",
            targetType: "User",
            targetId: req.user._id,
            summary: "User downloaded DPDP personal data export"
        });

        res.status(200).json({
            success: true,
            exportedAt: new Date().toISOString(),
            retentionPolicy: "Demo operational records retained 90 days unless deleted earlier.",
            data: { user, orders, tickets, notifications }
        });
    } catch {
        res.status(500).json({ success: false, message: "Failed to generate data export." });
    }
});

// Submit Privacy Request (Deletion / Rectification)
router.post("/request", protect, async (req, res) => {
    try {
        const { requestType = "rectification", reason = "" } = req.body || {};
        if (!["export", "deletion", "rectification"].includes(requestType)) {
            return res.status(400).json({ success: false, message: "Invalid privacy request type." });
        }

        const pr = await PrivacyRequest.create({
            user: req.user._id,
            requestType,
            status: "pending",
            reason: String(reason).trim().slice(0, 500)
        });

        await recordAudit({
            req,
            action: "privacy.request_submitted",
            domain: "privacy",
            targetType: "PrivacyRequest",
            targetId: pr._id,
            summary: `Submitted DPDP ${requestType} request`
        });

        res.status(201).json({
            success: true,
            message: "Privacy request logged for review.",
            data: pr
        });
    } catch {
        res.status(500).json({ success: false, message: "Failed to submit privacy request." });
    }
});

// Self-service account deactivation / anonymization (DPDP erasure)
router.post("/delete-account", protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });
        if (user.role === "admin") {
            return res.status(400).json({
                success: false,
                message: "Admin accounts require peer governance review before deletion."
            });
        }

        user.isActive = false;
        user.suspensionReason = "User requested DPDP account deletion/deactivation";
        user.sessionVersion = (user.sessionVersion || 1) + 1;
        await user.save();

        await PrivacyRequest.create({
            user: user._id,
            requestType: "deletion",
            status: "completed",
            reason: "Self-service DPDP deactivation",
            processedAt: new Date()
        });

        await recordAudit({
            req,
            action: "privacy.account_deactivated",
            domain: "privacy",
            targetType: "User",
            targetId: user._id,
            summary: "User completed self-service DPDP account deactivation"
        });

        res.clearCookie(COOKIE_NAME, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/"
        });

        res.status(200).json({
            success: true,
            message: "Your account has been deactivated and sessions cleared."
        });
    } catch {
        res.status(500).json({ success: false, message: "Account deletion failed." });
    }
});

module.exports = router;
