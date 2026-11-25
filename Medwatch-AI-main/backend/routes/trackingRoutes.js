const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const TrackingSession = require("../models/TrackingSession");
const DemoOrder = require("../models/DemoOrder");
const { protect } = require("../middleware/authMiddleware");
const eventBus = require("../services/eventBus");

const authorizeTrackingAccess = async (orderId, user) => {
    if (!mongoose.isValidObjectId(orderId)) return { error: 400, message: "Invalid order ID." };
    const session = await TrackingSession.findOne({ order: orderId }).populate({
        path: "pharmacy",
        select: "name city owner"
    });
    if (!session) return { error: 404, message: "Tracking session not found." };

    const isCustomer = String(session.customer) === String(user._id);
    const isPartnerOwner =
        session.pharmacy?.owner && String(session.pharmacy.owner) === String(user._id);
    const isAdmin = user.role === "admin";

    if (!isCustomer && !isPartnerOwner && !isAdmin) {
        return { error: 403, message: "Unauthorized tracking access denied." };
    }

    if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) {
        if (session.status === "active") {
            session.status = "expired";
            await session.save();
        }
        return { error: 403, message: "Tracking access expired." };
    }

    return { session };
};

// Get live/snapshot synthetic tracking session
router.get("/:orderId", protect, async (req, res) => {
    try {
        const result = await authorizeTrackingAccess(req.params.orderId, req.user);
        if (result.error) {
            return res.status(result.error).json({ success: false, message: result.message });
        }
        const session = result.session.toObject();
        if (session.pharmacy?.owner) delete session.pharmacy.owner;

        // Mark stale if older than 2 minutes while active
        const ageMs = Date.now() - new Date(session.lastUpdatedAt).getTime();
        const isStale = session.status === "paused_stale" || (session.status === "active" && ageMs > 120000);

        res.status(200).json({
            success: true,
            isStale,
            data: session
        });
    } catch {
        res.status(500).json({ success: false, message: "Failed to load tracking data." });
    }
});

// Advance synthetic courier waypoint (Demo live movement over SSE)
router.post("/:orderId/step", protect, async (req, res) => {
    try {
        const result = await authorizeTrackingAccess(req.params.orderId, req.user);
        if (result.error) {
            return res.status(result.error).json({ success: false, message: result.message });
        }

        const session = result.session;
        if (session.status === "completed" || session.status === "cancelled" || session.status === "expired") {
            return res.status(400).json({
                success: false,
                message: `Tracking is ${session.status}; live sharing has stopped.`
            });
        }

        const nextIdx = Math.min(session.waypointIndex + 1, session.routeWaypoints.length - 1);
        const targetWp = session.routeWaypoints[nextIdx];
        session.waypointIndex = nextIdx;
        session.currentCoords = {
            lat: targetWp.lat,
            lng: targetWp.lng,
            label: targetWp.label
        };
        session.status = nextIdx === session.routeWaypoints.length - 1 ? "completed" : "active";
        const eta = Number(targetWp.etaMinutes) || 5;
        session.etaRangeText =
            nextIdx === session.routeWaypoints.length - 1
                ? "Arrived (Sharing stopped)"
                : `${Math.max(2, eta)}–${eta + 5} mins (Synthetic)`;
        session.delayNotice = "";
        session.lastUpdatedAt = new Date();
        await session.save();

        // Also update order if final waypoint reached
        if (session.status === "completed") {
            const order = await DemoOrder.findById(session.order);
            if (order && !["delivered", "cancelled"].includes(order.status)) {
                order.status = "delivered";
                order.timeline.push({
                    status: "delivered",
                    note: "Synthetic courier reached demo drop point; live tracking stopped.",
                    actorId: req.user._id,
                    actorRole: req.user.role
                });
                await order.save();

                eventBus.publish({
                    type: "order.updated",
                    payload: {
                        orderId: order._id,
                        orderNumber: order.orderNumber,
                        status: order.status,
                        timeline: order.timeline
                    },
                    audience: {
                        userIds: [session.customer, session.pharmacy?.owner].filter(Boolean),
                        roles: ["admin"]
                    }
                });
            }
        }

        const payload = {
            orderId: session.order,
            status: session.status,
            currentCoords: session.currentCoords,
            waypointIndex: session.waypointIndex,
            etaRangeText: session.etaRangeText,
            delayNotice: session.delayNotice,
            lastUpdatedAt: session.lastUpdatedAt
        };

        eventBus.publish({
            type: "tracking.updated",
            payload,
            audience: {
                userIds: [session.customer, session.pharmacy?.owner].filter(Boolean),
                roles: ["admin"]
            }
        });

        res.status(200).json({ success: true, data: session });
    } catch {
        res.status(500).json({ success: false, message: "Failed to advance tracking." });
    }
});

// Toggle stale/offline tracking simulation (Section 06 requirement)
router.post("/:orderId/toggle-stale", protect, async (req, res) => {
    try {
        const result = await authorizeTrackingAccess(req.params.orderId, req.user);
        if (result.error) {
            return res.status(result.error).json({ success: false, message: result.message });
        }

        const session = result.session;
        if (session.status === "completed" || session.status === "cancelled") {
            return res.status(400).json({ success: false, message: "Tracking already closed." });
        }

        session.status = session.status === "paused_stale" ? "active" : "paused_stale";
        if (session.status === "paused_stale") {
            session.delayNotice = "Courier signal offline/stale. Showing last known synthetic checkpoint.";
        } else {
            session.delayNotice = "";
            session.lastUpdatedAt = new Date();
        }
        await session.save();

        eventBus.publish({
            type: "tracking.updated",
            payload: {
                orderId: session.order,
                status: session.status,
                currentCoords: session.currentCoords,
                waypointIndex: session.waypointIndex,
                etaRangeText: session.etaRangeText,
                delayNotice: session.delayNotice,
                lastUpdatedAt: session.lastUpdatedAt
            },
            audience: {
                userIds: [session.customer, session.pharmacy?.owner].filter(Boolean),
                roles: ["admin"]
            }
        });

        res.status(200).json({ success: true, data: session });
    } catch {
        res.status(500).json({ success: false, message: "Failed to toggle tracking state." });
    }
});

module.exports = router;
