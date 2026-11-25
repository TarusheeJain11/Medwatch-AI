const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");
const router = express.Router();

const DemoProduct = require("../models/DemoProduct");
const DemoOrder = require("../models/DemoOrder");
const Pharmacy = require("../models/Pharmacy");
const TrackingSession = require("../models/TrackingSession");
const Notification = require("../models/Notification");
const SupportTicket = require("../models/SupportTicket");
const { protect, authorize, isPharmacyOwnerRole } = require("../middleware/authMiddleware");
const { recordAudit } = require("../services/auditService");
const { fetchOsrmRouteWaypoints } = require("../services/liveDataService");
const { resolveProductImage } = require("../services/mediaResolver");
const { scheduleAutoLiveOrder, clearOrderTimers } = require("../services/liveOrderEngine");
const eventBus = require("../services/eventBus");

const ALLOWED_TRANSITIONS = {
    draft: ["submitted", "cancelled"],
    submitted: ["accepted", "cancelled", "failed"],
    accepted: ["preparing", "cancelled", "delayed", "failed"],
    preparing: ["dispatched", "delayed", "cancelled", "failed"],
    dispatched: ["delivered", "delayed", "rescheduled", "failed", "returned"],
    delayed: ["preparing", "dispatched", "rescheduled", "delivered", "cancelled", "failed"],
    rescheduled: ["dispatched", "delivered", "cancelled", "failed"],
    delivered: ["returned"],
    cancelled: [],
    failed: ["rescheduled"],
    returned: []
};

const PARTNER_ONLY_STATUSES = new Set([
    "accepted", "preparing", "dispatched", "delivered", "delayed", "rescheduled", "failed", "returned"
]);

const buildFallbackWaypoints = (pharmacy, serviceArea) => {
    const baseLat = pharmacy.lat || 31.3260;
    const baseLng = pharmacy.lng || 75.5762;
    return [
        { lat: baseLat, lng: baseLng, label: `Picked up from ${pharmacy.name}`, etaMinutes: 20 },
        { lat: baseLat + 0.004, lng: baseLng + 0.005, label: "Passing Main City Chowk", etaMinutes: 14 },
        { lat: baseLat + 0.008, lng: baseLng + 0.010, label: `Entering ${serviceArea}`, etaMinutes: 7 },
        { lat: baseLat + 0.012, lng: baseLng + 0.014, label: `Arrived at ${serviceArea}`, etaMinutes: 0 }
    ];
};

// Store & Care Products with fast server-side pagination, search & category filter
router.get("/demo-products", async (req, res) => {
    try {
        const {
            q = "",
            category = "",
            sort = "popular",
            page = "1",
            limit = "24"
        } = req.query;

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 24));

        const filter = { inStock: true };
        if (category && category !== "all") {
            filter.category = String(category);
        }
        if (typeof q === "string" && q.trim()) {
            const safe = q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            filter.$or = [
                { name: { $regex: safe, $options: "i" } },
                { brand: { $regex: safe, $options: "i" } },
                { category: { $regex: safe, $options: "i" } }
            ];
        }

        const sortObj =
            sort === "low"
                ? { unitPrice: 1 }
                : sort === "high"
                    ? { unitPrice: -1 }
                    : { rating: -1, unitPrice: 1 };

        const [total, categories, products] = await Promise.all([
            DemoProduct.countDocuments(filter),
            DemoProduct.distinct("category"),
            DemoProduct.find(filter)
                .sort(sortObj)
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .lean()
        ]);

        res.status(200).json({
            success: true,
            count: products.length,
            total,
            page: pageNum,
            totalPages: Math.max(1, Math.ceil(total / limitNum)),
            categories: categories.filter(Boolean).sort(),
            policy: {
                isNonMedicalOnly: true,
                serviceFee: 25,
                taxRatePercent: 5,
                cancellationPolicy: "Free cancellation anytime before the courier is dispatched."
            },
            data: products.map((p) => ({
                ...p,
                imageUrl: p.imageUrl || resolveProductImage(p)
            }))
        });
    } catch {
        res.status(500).json({ success: false, message: "Failed to load products." });
    }
});

// Create Live-Tracked Order with Idempotency Key + Real OSRM Street Route
router.post("/", protect, async (req, res) => {
    try {
        const {
            pharmacyId,
            items = [],
            serviceArea = "Model Town",
            idempotencyKey,
            submitImmediately = true
        } = req.body || {};

        if (!idempotencyKey || typeof idempotencyKey !== "string" || idempotencyKey.length > 100) {
            return res.status(400).json({
                success: false,
                message: "Idempotency key is required to prevent duplicate orders."
            });
        }

        const existingOrder = await DemoOrder.findOne({
            customer: req.user._id,
            idempotencyKey: idempotencyKey.trim()
        })
            .populate("pharmacy", "name city address")
            .lean();

        if (existingOrder) {
            return res.status(200).json({
                success: true,
                deduplicated: true,
                message: "Duplicate submission prevented; returning existing order.",
                data: existingOrder
            });
        }

        if (!mongoose.isValidObjectId(pharmacyId)) {
            return res.status(400).json({ success: false, message: "Select a dispatching pharmacy." });
        }

        const pharmacy = await Pharmacy.findOne({
            _id: pharmacyId,
            $or: [{ isVerified: true }, { owner: null }]
        });
        if (!pharmacy) {
            return res.status(404).json({ success: false, message: "Selected pharmacy is not available." });
        }

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: "Your cart is empty. Add at least one item." });
        }

        const productIds = items.map((i) => i.productId).filter((id) => mongoose.isValidObjectId(id));
        const dbProducts = await DemoProduct.find({ _id: { $in: productIds }, inStock: true }).lean();
        const productMap = new Map(dbProducts.map((p) => [String(p._id), p]));

        const normalizedItems = [];
        let subtotal = 0;

        for (const reqItem of items) {
            const prod = productMap.get(String(reqItem.productId));
            const qty = Number(reqItem.quantity);
            if (!prod) return res.status(400).json({ success: false, message: "Invalid product in cart." });
            if (!Number.isInteger(qty) || qty < 1 || qty > (prod.maxQuantity || 10)) {
                return res.status(400).json({
                    success: false,
                    message: `Quantity for ${prod.name} must be between 1 and ${prod.maxQuantity || 10}.`
                });
            }
            const lineTotal = prod.unitPrice * qty;
            subtotal += lineTotal;
            normalizedItems.push({
                product: prod._id,
                sku: prod.sku,
                name: prod.name,
                quantity: qty,
                unitPrice: prod.unitPrice,
                lineTotal
            });
        }

        const serviceFee = 25;
        const taxAmount = Math.round(subtotal * 0.05);
        const totalAmount = subtotal + serviceFee + taxAmount;
        const initialStatus = submitImmediately ? "submitted" : "draft";
        const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
        const cleanArea = String(serviceArea).trim().slice(0, 120) || "Central Sector";

        const order = await DemoOrder.create({
            orderNumber: `MW-${suffix}`,
            idempotencyKey: idempotencyKey.trim(),
            customer: req.user._id,
            pharmacy: pharmacy._id,
            items: normalizedItems,
            costBreakdown: { subtotal, serviceFee, taxAmount, totalAmount },
            serviceArea: cleanArea,
            status: initialStatus,
            paymentStatus: submitImmediately ? "paid_sandbox" : "pending",
            receiptNumber: `RCPT-${suffix}`,
            timeline: [
                {
                    status: initialStatus,
                    note: submitImmediately
                        ? "Order placed and sent to pharmacy for real-time confirmation (Sandbox payment)."
                        : "Order saved as draft.",
                    actorId: req.user._id,
                    actorRole: req.user.role
                }
            ],
            isNonMedicalDemo: true,
            isDemo: false
        });

        // Compute real road route via OpenStreetMap OSRM (fallback if offline)
        const fromLat = pharmacy.lat || 31.3260;
        const fromLng = pharmacy.lng || 75.5762;
        const osrmRoute = await fetchOsrmRouteWaypoints({
            fromLat,
            fromLng,
            toLat: fromLat + 0.015,
            toLng: fromLng + 0.018,
            pharmacyName: pharmacy.name,
            serviceArea: cleanArea
        });

        const waypoints = osrmRoute?.waypoints || buildFallbackWaypoints(pharmacy, cleanArea);
        const etaMinutes = osrmRoute?.totalMinutes || 18;

        await TrackingSession.create({
            order: order._id,
            customer: req.user._id,
            pharmacy: pharmacy._id,
            status: "active",
            currentCoords: { lat: waypoints[0].lat, lng: waypoints[0].lng, label: waypoints[0].label },
            routeWaypoints: waypoints,
            routeGeometry: osrmRoute?.routeGeometry || waypoints.map((w) => ({ lat: w.lat, lng: w.lng })),
            distanceKm: osrmRoute?.distanceKm || 3.5,
            routingProvider: osrmRoute?.provider || "Estimated Local Route",
            waypointIndex: 0,
            etaRangeText: `${etaMinutes}–${etaMinutes + 5} mins (${osrmRoute ? `${osrmRoute.distanceKm} km via OSRM` : "Estimated"})`,
            lastUpdatedAt: new Date()
        });

        await Notification.create({
            recipient: req.user._id,
            title: `Order ${order.orderNumber} Placed`,
            message: `Sent to ${pharmacy.name}. Live updates will stream automatically.`,
            category: "order",
            link: `/orders/${order._id}`
        });

        if (pharmacy.owner) {
            await Notification.create({
                recipient: pharmacy.owner,
                title: `New Order ${order.orderNumber}`,
                message: `Incoming order for ${cleanArea}.`,
                category: "order",
                link: "/pharmacy/dashboard"
            });
        }

        await recordAudit({
            req,
            action: "orders.created",
            domain: "orders",
            targetType: "DemoOrder",
            targetId: order._id,
            summary: `Created order ${order.orderNumber} (${initialStatus})`
        });

        eventBus.publish({
            type: "order.created",
            payload: { orderId: order._id, orderNumber: order.orderNumber, status: order.status },
            audience: {
                userIds: [req.user._id, pharmacy.owner].filter(Boolean),
                roles: ["admin"]
            }
        });

        // Start automatic real-time progression & SSE live courier updates
        if (submitImmediately) {
            scheduleAutoLiveOrder(order._id);
        }

        const populated = await DemoOrder.findById(order._id)
            .populate("pharmacy", "name city address openingHours")
            .lean();

        res.status(201).json({
            success: true,
            message: "Order placed! Live real-time tracking started.",
            data: populated
        });
    } catch (error) {
        if (error.code === 11000) {
            const existing = await DemoOrder.findOne({
                customer: req.user._id,
                idempotencyKey: req.body?.idempotencyKey?.trim()
            }).populate("pharmacy", "name city address");
            if (existing) {
                return res.status(200).json({
                    success: true,
                    deduplicated: true,
                    message: "Duplicate request prevented.",
                    data: existing
                });
            }
        }
        res.status(500).json({ success: false, message: "Failed to create order." });
    }
});

router.get("/my", protect, async (req, res) => {
    try {
        const orders = await DemoOrder.find({ customer: req.user._id })
            .populate("pharmacy", "name city address phone")
            .populate("paymentTransaction", "transactionId gatewayOrderId gatewayPaymentId method methodDetails status capturedAt refundId")
            .sort({ createdAt: -1 })
            .lean();
        res.status(200).json({ success: true, count: orders.length, data: orders });
    } catch {
        res.status(500).json({ success: false, message: "Failed to load orders." });
    }
});

// Admin: Get all platform orders with customer, pharmacy, and payment info
router.get("/admin/all", protect, authorize("admin"), async (req, res) => {
    try {
        const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
        const filter = status && status !== "all" ? { status } : {};
        const orders = await DemoOrder.find(filter)
            .populate("customer", "name email")
            .populate("pharmacy", "name city")
            .populate("paymentTransaction", "transactionId gatewayPaymentId method methodDetails status")
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();
        res.status(200).json({ success: true, count: orders.length, data: orders });
    } catch {
        res.status(500).json({ success: false, message: "Failed to load platform orders." });
    }
});

router.get("/partner-queue", protect, authorize("pharmacy", "admin"), async (req, res) => {
    try {
        let query = {};
        if (isPharmacyOwnerRole(req.user.role)) {
            const myPharmacies = await Pharmacy.find({ owner: req.user._id }).select("_id");
            query = { pharmacy: { $in: myPharmacies.map((p) => p._id) } };
        }
        const orders = await DemoOrder.find(query)
            .populate("pharmacy", "name city")
            .populate("customer", "name")
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();
        res.status(200).json({ success: true, count: orders.length, data: orders });
    } catch {
        res.status(500).json({ success: false, message: "Failed to load partner order queue." });
    }
});

router.get("/:id", protect, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid order ID." });
        }

        const order = await DemoOrder.findById(req.params.id)
            .populate("pharmacy", "name city address phone owner openingHours")
            .lean();
        if (!order) return res.status(404).json({ success: false, message: "Order not found." });

        const isOwner = String(order.customer) === String(req.user._id);
        const isPartnerOwner = order.pharmacy?.owner && String(order.pharmacy.owner) === String(req.user._id);

        if (!isOwner && !isPartnerOwner && req.user.role !== "admin") {
            return res.status(403).json({ success: false, message: "Access denied to this order." });
        }

        if (order.pharmacy?.owner) delete order.pharmacy.owner;
        res.status(200).json({ success: true, data: order });
    } catch {
        res.status(500).json({ success: false, message: "Failed to fetch order." });
    }
});

router.patch("/:id/transition", protect, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid order ID." });
        }

        const { nextStatus, note = "", assignedCourier } = req.body || {};
        const order = await DemoOrder.findById(req.params.id).populate("pharmacy", "owner name");
        if (!order) return res.status(404).json({ success: false, message: "Order not found." });

        const isCustomer = String(order.customer) === String(req.user._id);
        const isPartnerOwner = order.pharmacy?.owner && String(order.pharmacy.owner) === String(req.user._id);
        const isAdmin = req.user.role === "admin";

        if (!isCustomer && !isPartnerOwner && !isAdmin) {
            return res.status(403).json({ success: false, message: "Not authorized for this order." });
        }
        if (PARTNER_ONLY_STATUSES.has(nextStatus) && !isPartnerOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: "Only the assigned pharmacy partner or admin can perform this status transition."
            });
        }
        if (nextStatus === "submitted" && !isCustomer && !isAdmin) {
            return res.status(403).json({ success: false, message: "Only the customer can submit a draft order." });
        }

        const allowedNext = ALLOWED_TRANSITIONS[order.status] || [];
        if (!allowedNext.includes(nextStatus)) {
            return res.status(400).json({
                success: false,
                message: `Invalid transition from "${order.status}" to "${nextStatus}".`
            });
        }

        order.status = nextStatus;
        if (assignedCourier && (isPartnerOwner || isAdmin)) {
            order.assignedCourier = String(assignedCourier).trim().slice(0, 80);
        }
        if (nextStatus === "submitted") {
            order.paymentStatus = "paid_sandbox";
            scheduleAutoLiveOrder(order._id);
        }
        if (nextStatus === "cancelled") {
            clearOrderTimers(order._id);
            if (order.paymentStatus === "paid_sandbox") {
                order.paymentStatus = "refunded_sandbox";
            }
        }
        if (["delivered", "failed", "returned"].includes(nextStatus)) {
            clearOrderTimers(order._id);
        }

        const isException = ["delayed", "failed", "rescheduled", "returned"].includes(nextStatus);
        order.timeline.push({
            status: nextStatus,
            note: String(note).trim() || `Status updated to ${nextStatus}`,
            actorId: req.user._id,
            actorRole: req.user.role,
            isException
        });
        await order.save();

        const tracking = await TrackingSession.findOne({ order: order._id });
        if (tracking) {
            if (nextStatus === "delivered") {
                tracking.status = "completed";
                tracking.waypointIndex = Math.max(0, tracking.routeWaypoints.length - 1);
                const lastWp = tracking.routeWaypoints[tracking.waypointIndex];
                if (lastWp) tracking.currentCoords = { lat: lastWp.lat, lng: lastWp.lng, label: lastWp.label };
                tracking.etaRangeText = "Delivered (Location sharing stopped)";
            } else if (nextStatus === "cancelled") {
                tracking.status = "cancelled";
                tracking.etaRangeText = "Cancelled";
            } else if (nextStatus === "dispatched") {
                tracking.status = "active";
                tracking.waypointIndex = Math.min(1, tracking.routeWaypoints.length - 1);
                const wp = tracking.routeWaypoints[tracking.waypointIndex];
                if (wp) tracking.currentCoords = { lat: wp.lat, lng: wp.lng, label: wp.label };
                tracking.etaRangeText = "12–18 mins";
            } else if (nextStatus === "delayed") {
                tracking.delayNotice = String(note).trim() || "Traffic delay reported by partner.";
                tracking.etaRangeText = "25–35 mins (Delayed)";
            }
            tracking.lastUpdatedAt = new Date();
            await tracking.save();

            eventBus.publish({
                type: "tracking.updated",
                payload: {
                    orderId: order._id,
                    status: tracking.status,
                    currentCoords: tracking.currentCoords,
                    waypointIndex: tracking.waypointIndex,
                    etaRangeText: tracking.etaRangeText,
                    delayNotice: tracking.delayNotice,
                    lastUpdatedAt: tracking.lastUpdatedAt
                },
                audience: {
                    userIds: [order.customer, order.pharmacy?.owner].filter(Boolean),
                    roles: ["admin"]
                }
            });
        }

        await Notification.create({
            recipient: order.customer,
            title: `Order ${order.orderNumber}: ${nextStatus.toUpperCase()}`,
            message: String(note).trim() || `Your order moved to ${nextStatus}.`,
            category: "order",
            link: `/orders/${order._id}`
        });

        await recordAudit({
            req,
            action: `orders.status_${nextStatus}`,
            domain: "orders",
            targetType: "DemoOrder",
            targetId: order._id,
            summary: `Order ${order.orderNumber} transitioned to ${nextStatus}`
        });

        eventBus.publish({
            type: "order.updated",
            payload: {
                orderId: order._id,
                orderNumber: order.orderNumber,
                status: order.status,
                paymentStatus: order.paymentStatus,
                timeline: order.timeline
            },
            audience: {
                userIds: [order.customer, order.pharmacy?.owner].filter(Boolean),
                roles: ["admin"]
            }
        });

        res.status(200).json({ success: true, message: `Order updated to ${nextStatus}.`, data: order });
    } catch {
        res.status(500).json({ success: false, message: "Order status transition failed." });
    }
});

router.post("/:id/refund-sandbox", protect, async (req, res) => {
    try {
        const order = await DemoOrder.findById(req.params.id).populate("pharmacy", "owner");
        if (!order) return res.status(404).json({ success: false, message: "Order not found." });

        const isCustomer = String(order.customer) === String(req.user._id);
        const isPartnerOwner = order.pharmacy?.owner && String(order.pharmacy.owner) === String(req.user._id);
        if (!isCustomer && !isPartnerOwner && req.user.role !== "admin") {
            return res.status(403).json({ success: false, message: "Not authorized." });
        }
        if (order.paymentStatus !== "paid_sandbox") {
            return res.status(400).json({ success: false, message: "Order is not eligible for refund." });
        }

        order.paymentStatus = "refunded_sandbox";
        order.timeline.push({
            status: "refunded_sandbox",
            note: "Refund processed on receipt.",
            actorId: req.user._id,
            actorRole: req.user.role
        });
        await order.save();

        res.status(200).json({ success: true, message: "Refund completed.", data: order });
    } catch {
        res.status(500).json({ success: false, message: "Refund failed." });
    }
});

router.post("/:id/dispute", protect, async (req, res) => {
    try {
        const { reason = "" } = req.body || {};
        if (!reason.trim()) return res.status(400).json({ success: false, message: "Provide a reason for escalation." });
        const order = await DemoOrder.findById(req.params.id);
        if (!order) return res.status(404).json({ success: false, message: "Order not found." });
        if (String(order.customer) !== String(req.user._id) && req.user.role !== "admin") {
            return res.status(403).json({ success: false, message: "Not authorized." });
        }

        order.disputeNote = reason.trim();
        await order.save();

        const ticket = await SupportTicket.create({
            ticketNumber: `MW-DSP-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
            type: "dispute",
            user: req.user._id,
            relatedOrder: order._id,
            subject: `Order Support Request for ${order.orderNumber}`,
            description: reason.trim()
        });

        res.status(201).json({ success: true, message: `Support ticket ${ticket.ticketNumber} created.`, ticket });
    } catch {
        res.status(500).json({ success: false, message: "Failed to submit support request." });
    }
});

module.exports = router;
