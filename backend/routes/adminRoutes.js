const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const User = require("../models/User");
const Pharmacy = require("../models/Pharmacy");
const Medicine = require("../models/Medicine");
const DemoOrder = require("../models/DemoOrder");
const SupportTicket = require("../models/SupportTicket");
const AuditEvent = require("../models/AuditEvent");
const SourceRecord = require("../models/SourceRecord");
const FeatureFlag = require("../models/FeatureFlag");
const PrivacyRequest = require("../models/PrivacyRequest");
const Notification = require("../models/Notification");
const PaymentTransaction = require("../models/PaymentTransaction");
const { protect, authorize } = require("../middleware/authMiddleware");
const { recordAudit } = require("../services/auditService");
const { fetchOpenFdaDrugs } = require("../services/liveDataService");
const eventBus = require("../services/eventBus");

router.use(protect, authorize("admin"));

// Admin Dashboard Overview & Pseudonymous Aggregated Analytics
router.get("/overview", async (req, res) => {
    try {
        const [
            totalUsers,
            totalPharmacies,
            verifiedPharmacies,
            pendingPharmacies,
            totalMedicines,
            totalOrders,
            deliveredOrders,
            openTickets,
            pendingPrivacy,
            failedSources
        ] = await Promise.all([
            User.countDocuments(),
            Pharmacy.countDocuments(),
            Pharmacy.countDocuments({ isVerified: true }),
            Pharmacy.countDocuments({ isVerified: false, owner: { $ne: null } }),
            Medicine.countDocuments(),
            DemoOrder.countDocuments(),
            DemoOrder.countDocuments({ status: "delivered" }),
            SupportTicket.countDocuments({ status: { $in: ["open", "in_review"] } }),
            PrivacyRequest.countDocuments({ status: "pending" }),
            SourceRecord.countDocuments({ status: { $in: ["failed", "dead_letter"] } })
        ]);

        const [totalTickets, resolvedTickets, allOrders, allPayments] = await Promise.all([
            SupportTicket.countDocuments(),
            SupportTicket.countDocuments({ status: "resolved" }),
            DemoOrder.find().select("status paymentStatus costBreakdown.totalAmount").lean(),
            PaymentTransaction.find().select("status method costBreakdown.totalAmount refundAmount").lean()
        ]);

        const statusBreakdown = {};
        let grossOrderValue = 0;
        for (const o of allOrders) {
            statusBreakdown[o.status] = (statusBreakdown[o.status] || 0) + 1;
            if (o.status !== "cancelled") {
                grossOrderValue += o.costBreakdown?.totalAmount || 0;
            }
        }

        const paymentBreakdown = {};
        let capturedRevenue = 0;
        let refundedAmount = 0;
        for (const p of allPayments) {
            paymentBreakdown[p.method] = (paymentBreakdown[p.method] || 0) + 1;
            if (p.status === "captured") capturedRevenue += p.costBreakdown?.totalAmount || 0;
            if (p.status === "refunded") refundedAmount += p.refundAmount || p.costBreakdown?.totalAmount || 0;
        }

        res.status(200).json({
            success: true,
            kpis: {
                totalUsers,
                totalPharmacies,
                verifiedPharmacies,
                pendingPharmacies,
                totalMedicines,
                totalOrders,
                deliveredOrders,
                openTickets,
                pendingPrivacy,
                failedSources,
                grossOrderValue,
                capturedRevenue,
                refundedAmount,
                totalTransactions: allPayments.length
            },
            analytics: {
                orderCompletionRate:
                    totalOrders > 0 ? Math.round((deliveredOrders / totalOrders) * 100) : 0,
                supportResolutionRate:
                    totalTickets > 0 ? Math.round((resolvedTickets / totalTickets) * 100) : 100,
                statusBreakdown,
                paymentBreakdown,
                dataFreshnessNote: "All pilot catalog and operational records timestamped.",
                deliveryEventLatencyTarget: "< 3 seconds via SSE"
            }
        });
    } catch {
        res.status(500).json({ success: false, message: "Failed to load admin overview." });
    }
});

// User Management
router.get("/users", async (req, res) => {
    try {
        const users = await User.find().select("-password").sort({ createdAt: -1 }).lean();
        res.status(200).json({ success: true, data: users });
    } catch {
        res.status(500).json({ success: false, message: "Failed to load users." });
    }
});

router.patch("/users/:id", async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid user ID." });
        }
        const { isActive, role, isVerified, suspensionReason = "" } = req.body || {};
        const updates = {};
        if (typeof isActive === "boolean") {
            updates.isActive = isActive;
            updates.suspensionReason = isActive ? "" : String(suspensionReason).trim();
            if (!isActive) updates.$inc = { sessionVersion: 1 };
        }
        if (["customer", "pharmacy_owner", "pharmacy", "admin"].includes(role)) updates.role = role;
        if (typeof isVerified === "boolean") updates.isVerified = isVerified;

        const { $inc, ...$set } = updates;
        const updateDoc = $inc ? { $set, $inc } : { $set };

        const user = await User.findByIdAndUpdate(req.params.id, updateDoc, { new: true }).select("-password");
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        await recordAudit({
            req,
            action: "admin.user_updated",
            domain: "admin",
            targetType: "User",
            targetId: user._id,
            summary: `Updated user ${user.email} (active=${user.isActive}, role=${user.role})`
        });

        res.status(200).json({ success: true, data: user });
    } catch {
        res.status(500).json({ success: false, message: "Failed to update user." });
    }
});

// Support & Correction Ticket Triage
router.get("/tickets", async (req, res) => {
    try {
        const tickets = await SupportTicket.find()
            .populate("user", "name email role")
            .populate("relatedMedicine", "name")
            .populate("relatedPharmacy", "name")
            .sort({ createdAt: -1 })
            .lean();
        res.status(200).json({ success: true, data: tickets });
    } catch {
        res.status(500).json({ success: false, message: "Failed to load tickets." });
    }
});

router.patch("/tickets/:id", async (req, res) => {
    try {
        const { status, resolutionNote = "" } = req.body || {};
        if (!["open", "in_review", "resolved", "dismissed"].includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid ticket status." });
        }
        const ticket = await SupportTicket.findByIdAndUpdate(
            req.params.id,
            {
                $set: {
                    status,
                    resolutionNote: String(resolutionNote).trim(),
                    resolvedBy: req.user._id,
                    resolvedAt: status === "resolved" || status === "dismissed" ? new Date() : null
                }
            },
            { new: true }
        );
        if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found." });

        if (ticket.user) {
            await Notification.create({
                recipient: ticket.user,
                title: `Ticket ${ticket.ticketNumber} ${status}`,
                message: resolutionNote || `Your ${ticket.type} ticket is now ${status}.`,
                category: "system",
                link: "/help"
            });
        }

        await recordAudit({
            req,
            action: "admin.ticket_updated",
            domain: "admin",
            targetType: "SupportTicket",
            targetId: ticket._id,
            summary: `Ticket ${ticket.ticketNumber} marked ${status}`
        });

        res.status(200).json({ success: true, data: ticket });
    } catch {
        res.status(500).json({ success: false, message: "Failed to update ticket." });
    }
});

// Audit Trail
router.get("/audit", async (req, res) => {
    try {
        const logs = await AuditEvent.find()
            .populate("actor", "name email role")
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();
        res.status(200).json({ success: true, data: logs });
    } catch {
        res.status(500).json({ success: false, message: "Failed to fetch audit log." });
    }
});

// Live OpenFDA Sync Endpoint
router.post("/sources/sync-live", async (req, res) => {
    try {
        const skip = Math.floor(Math.random() * 500);
        const liveMeds = await fetchOpenFdaDrugs({ limit: 50, skip });
        let inserted = 0;
        for (const m of liveMeds) {
            const exists = await Medicine.exists({ name: m.name });
            if (!exists) {
                await Medicine.create(m);
                inserted++;
            }
        }
        const source = await SourceRecord.findOneAndUpdate(
            { sourceName: "OpenFDA Drug NDC Live Feed" },
            {
                $set: {
                    sourceType: "catalog_feed",
                    status: "synced",
                    recordsProcessed: liveMeds.length,
                    lastSyncedAt: new Date(),
                    provenanceNote: `Live OpenFDA fetch: ${liveMeds.length} checked, ${inserted} new records added.`
                }
            },
            { new: true, upsert: true }
        );
        await recordAudit({
            req,
            action: "admin.openfda_live_sync",
            domain: "catalog",
            summary: `Synced ${inserted} new medicines from OpenFDA live API`
        });
        res.status(200).json({ success: true, inserted, fetched: liveMeds.length, source });
    } catch {
        res.status(500).json({ success: false, message: "OpenFDA live sync failed." });
    }
});

// Source Ingestion, Retry & Dead-Letter Queue
router.get("/sources", async (req, res) => {
    try {
        const sources = await SourceRecord.find().sort({ updatedAt: -1 }).lean();
        res.status(200).json({ success: true, data: sources });
    } catch {
        res.status(500).json({ success: false, message: "Failed to load sources." });
    }
});

router.post("/sources/:id/sync", async (req, res) => {
    try {
        const { simulateFailure = false } = req.body || {};
        const source = await SourceRecord.findById(req.params.id);
        if (!source) return res.status(404).json({ success: false, message: "Source not found." });

        if (simulateFailure) {
            source.retryCount += 1;
            source.status = source.retryCount >= 3 ? "dead_letter" : "failed";
            source.errorMessage = "Simulated upstream timeout during pilot sync.";
            source.nextRetryAt = new Date(Date.now() + Math.pow(2, source.retryCount) * 30000);
        } else {
            source.status = "synced";
            source.errorMessage = "";
            source.retryCount = 0;
            source.lastSyncedAt = new Date();
            source.nextRetryAt = null;
        }
        await source.save();

        await recordAudit({
            req,
            action: `admin.source_${source.status}`,
            domain: "admin",
            targetType: "SourceRecord",
            targetId: source._id,
            summary: `Source ${source.sourceName} sync -> ${source.status}`
        });

        res.status(200).json({ success: true, data: source });
    } catch {
        res.status(500).json({ success: false, message: "Source sync failed." });
    }
});

// Feature Flags
router.get("/feature-flags", async (req, res) => {
    try {
        const flags = await FeatureFlag.find().sort({ key: 1 }).lean();
        res.status(200).json({ success: true, data: flags });
    } catch {
        res.status(500).json({ success: false, message: "Failed to fetch feature flags." });
    }
});

router.patch("/feature-flags/:key", async (req, res) => {
    try {
        const { enabled, rolloutStage } = req.body || {};
        if (req.params.key === "regulated_checkout" && enabled === true) {
            return res.status(403).json({
                success: false,
                message: "Regulated checkout cannot be enabled without legal & clinical sign-off."
            });
        }
        const updates = { updatedBy: req.user._id };
        if (typeof enabled === "boolean") updates.enabled = enabled;
        if (["pilot", "staging", "disabled"].includes(rolloutStage)) updates.rolloutStage = rolloutStage;

        const flag = await FeatureFlag.findOneAndUpdate(
            { key: req.params.key },
            { $set: updates },
            { new: true }
        );
        if (!flag) return res.status(404).json({ success: false, message: "Feature flag not found." });

        await recordAudit({
            req,
            action: "admin.feature_flag_updated",
            domain: "admin",
            targetType: "FeatureFlag",
            targetId: flag.key,
            summary: `Flag ${flag.key} -> enabled=${flag.enabled}`
        });

        eventBus.publish({
            type: "system.flags_updated",
            payload: { key: flag.key, enabled: flag.enabled },
            audience: { public: true }
        });

        res.status(200).json({ success: true, data: flag });
    } catch {
        res.status(500).json({ success: false, message: "Failed to update feature flag." });
    }
});

// Privacy Requests
router.get("/privacy-requests", async (req, res) => {
    try {
        const reqs = await PrivacyRequest.find()
            .populate("user", "name email role")
            .sort({ createdAt: -1 })
            .lean();
        res.status(200).json({ success: true, data: reqs });
    } catch {
        res.status(500).json({ success: false, message: "Failed to fetch privacy requests." });
    }
});

router.patch("/privacy-requests/:id", async (req, res) => {
    try {
        const { status } = req.body || {};
        if (!["pending", "completed", "rejected"].includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid status." });
        }
        const pr = await PrivacyRequest.findByIdAndUpdate(
            req.params.id,
            { $set: { status, processedAt: new Date(), processedBy: req.user._id } },
            { new: true }
        );
        if (!pr) return res.status(404).json({ success: false, message: "Request not found." });

        await recordAudit({
            req,
            action: "admin.privacy_request_processed",
            domain: "privacy",
            targetType: "PrivacyRequest",
            targetId: pr._id,
            summary: `Privacy request ${pr.requestType} marked ${status}`
        });

        res.status(200).json({ success: true, data: pr });
    } catch {
        res.status(500).json({ success: false, message: "Failed to update privacy request." });
    }
});

// Broadcast Notification
router.post("/notifications/broadcast", async (req, res) => {
    try {
        const { title, message, roleTarget = "all", category = "system" } = req.body || {};
        if (!title?.trim() || !message?.trim()) {
            return res.status(400).json({ success: false, message: "Title and message required." });
        }
        const notif = await Notification.create({
            recipient: null,
            roleTarget,
            title: title.trim(),
            message: message.trim(),
            category
        });
        eventBus.publish({
            type: "notification.broadcast",
            payload: { title: notif.title, message: notif.message, roleTarget },
            audience: roleTarget === "all" ? { public: true } : { roles: [roleTarget] }
        });
        res.status(201).json({ success: true, data: notif });
    } catch {
        res.status(500).json({ success: false, message: "Failed to broadcast notification." });
    }
});

// Restricted CSV Analytics Report Export
router.get("/export-report", async (req, res) => {
    try {
        const orders = await DemoOrder.find().select("orderNumber status paymentStatus costBreakdown createdAt").lean();
        const header = "orderNumber,status,paymentStatus,totalAmountINR,createdAt";
        const rows = orders.map(
            (o) => `${o.orderNumber},${o.status},${o.paymentStatus},${o.costBreakdown?.totalAmount || 0},${o.createdAt?.toISOString()}`
        );

        await recordAudit({
            req,
            action: "admin.report_exported",
            domain: "admin",
            summary: `Exported restricted order summary CSV (${orders.length} rows)`
        });

        res.set("Content-Type", "text/csv; charset=utf-8");
        res.set("Content-Disposition", "attachment; filename=medwatch-demo-orders-report.csv");
        res.status(200).send([header, ...rows].join("\n"));
    } catch {
        res.status(500).json({ success: false, message: "Export failed." });
    }
});

module.exports = router;
