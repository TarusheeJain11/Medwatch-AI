const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const SupportTicket = require("../models/SupportTicket");
const Notification = require("../models/Notification");
const { protect, optionalAuth } = require("../middleware/authMiddleware");
const { recordAudit } = require("../services/auditService");
const eventBus = require("../services/eventBus");

// Create support ticket, correction, feedback, or dispute (guest-accessible!)
router.post("/", optionalAuth, async (req, res) => {
    try {
        const {
            type = "support",
            subject,
            description,
            proposedCorrection = "",
            contactEmail = "",
            relatedMedicine = null,
            relatedPharmacy = null,
            relatedOrder = null
        } = req.body || {};

        if (!["support", "correction", "feedback", "dispute"].includes(type)) {
            return res.status(400).json({ success: false, message: "Invalid ticket type." });
        }

        if (typeof subject !== "string" || !subject.trim() || typeof description !== "string" || !description.trim()) {
            return res.status(400).json({ success: false, message: "Subject and description are required." });
        }

        const ticket = await SupportTicket.create({
            ticketNumber: `MW-${type.slice(0, 3).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
            type,
            user: req.user?._id || null,
            contactEmail: req.user?.email || String(contactEmail).trim().toLowerCase(),
            relatedMedicine: relatedMedicine || null,
            relatedPharmacy: relatedPharmacy || null,
            relatedOrder: relatedOrder || null,
            subject: subject.trim().slice(0, 160),
            description: description.trim().slice(0, 2000),
            proposedCorrection: String(proposedCorrection).trim().slice(0, 1000)
        });

        await recordAudit({
            req,
            action: `support.${type}_submitted`,
            domain: "system",
            targetType: "SupportTicket",
            targetId: ticket._id,
            summary: `Submitted ${type} ticket ${ticket.ticketNumber}`
        });

        eventBus.publish({
            type: "support.ticket_created",
            payload: { ticketNumber: ticket.ticketNumber, type: ticket.type },
            audience: { roles: ["admin"] }
        });

        res.status(201).json({
            success: true,
            message: `Thank you! Ticket ${ticket.ticketNumber} has been logged.`,
            data: ticket
        });
    } catch {
        res.status(500).json({ success: false, message: "Failed to submit ticket." });
    }
});

// Get logged-in user's tickets
router.get("/my", protect, async (req, res) => {
    try {
        const tickets = await SupportTicket.find({ user: req.user._id })
            .populate("relatedMedicine", "name")
            .populate("relatedPharmacy", "name")
            .sort({ createdAt: -1 })
            .lean();
        res.status(200).json({ success: true, count: tickets.length, data: tickets });
    } catch {
        res.status(500).json({ success: false, message: "Failed to load your tickets." });
    }
});

// Notification Center
router.get("/notifications", protect, async (req, res) => {
    try {
        const notifications = await Notification.find({
            $or: [
                { recipient: req.user._id },
                { roleTarget: "all" },
                { roleTarget: req.user.role }
            ]
        })
            .sort({ createdAt: -1 })
            .limit(40)
            .lean();

        res.status(200).json({
            success: true,
            unreadCount: notifications.filter((n) => !n.isRead).length,
            data: notifications
        });
    } catch {
        res.status(500).json({ success: false, message: "Failed to load notifications." });
    }
});

router.patch("/notifications/:id/read", protect, async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            {
                _id: req.params.id,
                $or: [{ recipient: req.user._id }, { roleTarget: { $in: ["all", req.user.role] } }]
            },
            { $set: { isRead: true } },
            { new: true }
        );
        if (!notification) return res.status(404).json({ success: false, message: "Notification not found." });
        res.status(200).json({ success: true, data: notification });
    } catch {
        res.status(500).json({ success: false, message: "Failed to mark notification read." });
    }
});

router.post("/notifications/read-all", protect, async (req, res) => {
    try {
        await Notification.updateMany(
            { recipient: req.user._id, isRead: false },
            { $set: { isRead: true } }
        );
        res.status(200).json({ success: true, message: "All personal notifications marked as read." });
    } catch {
        res.status(500).json({ success: false, message: "Failed to update notifications." });
    }
});

module.exports = router;
