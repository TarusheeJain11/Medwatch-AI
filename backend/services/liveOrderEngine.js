const DemoOrder = require("../models/DemoOrder");
const TrackingSession = require("../models/TrackingSession");
const Notification = require("../models/Notification");
const eventBus = require("./eventBus");

const activeTimers = new Map();

const clearOrderTimers = (orderId) => {
    const key = String(orderId);
    const timer = activeTimers.get(key);
    if (timer) {
        clearTimeout(timer);
        activeTimers.delete(key);
    }
};

const emitOrderAndTracking = ({ order, tracking }) => {
    const audience = {
        userIds: [order.customer, tracking?.pharmacy?.owner].filter(Boolean),
        roles: ["admin"]
    };

    eventBus.publish({
        type: "order.updated",
        payload: {
            orderId: order._id,
            orderNumber: order.orderNumber,
            status: order.status,
            paymentStatus: order.paymentStatus,
            assignedCourier: order.assignedCourier,
            timeline: order.timeline
        },
        audience
    });

    if (tracking) {
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
            audience
        });
    }
};

// Automatic real-time progression so customer sees live status + courier movement without clicking
const scheduleAutoLiveOrder = (orderId) => {
    if (process.env.NODE_ENV === "test") return;
    const key = String(orderId);
    clearOrderTimers(key);

    const runNextStep = async () => {
        try {
            const order = await DemoOrder.findById(key).populate("pharmacy", "name owner");
            if (!order) return clearOrderTimers(key);

            if (["delivered", "cancelled", "failed", "returned"].includes(order.status)) {
                return clearOrderTimers(key);
            }

            const tracking = await TrackingSession.findOne({ order: order._id }).populate("pharmacy", "owner");
            let nextDelayMs = 4500;

            if (order.status === "submitted") {
                order.status = "accepted";
                order.timeline.push({
                    status: "accepted",
                    note: `${order.pharmacy?.name || "Pharmacy"} confirmed your order in real time.`,
                    actorRole: "pharmacy"
                });
                await order.save();
                emitOrderAndTracking({ order, tracking });
            } else if (order.status === "accepted") {
                order.status = "preparing";
                order.timeline.push({
                    status: "preparing",
                    note: "Items picked, quality-checked, and packed for dispatch.",
                    actorRole: "pharmacy"
                });
                await order.save();
                emitOrderAndTracking({ order, tracking });
            } else if (order.status === "preparing") {
                order.status = "dispatched";
                order.assignedCourier = order.assignedCourier && order.assignedCourier !== "Unassigned"
                    ? order.assignedCourier
                    : "MedWatch Live Courier #12";
                order.timeline.push({
                    status: "dispatched",
                    note: `Picked up by ${order.assignedCourier}. Live route sharing active.`,
                    actorRole: "pharmacy"
                });
                await order.save();

                if (tracking && tracking.routeWaypoints.length > 1) {
                    tracking.waypointIndex = 1;
                    const wp = tracking.routeWaypoints[1];
                    tracking.currentCoords = { lat: wp.lat, lng: wp.lng, label: wp.label };
                    const eta = Number(wp.etaMinutes) || 12;
                    tracking.etaRangeText = `${Math.max(2, eta)}–${eta + 4} mins`;
                    tracking.lastUpdatedAt = new Date();
                    await tracking.save();
                }

                await Notification.create({
                    recipient: order.customer,
                    title: `Order ${order.orderNumber} Out for Delivery`,
                    message: `${order.assignedCourier} is on the way to ${order.serviceArea}.`,
                    category: "order",
                    link: `/orders/${order._id}`
                });

                emitOrderAndTracking({ order, tracking });
            } else if (order.status === "dispatched" && tracking) {
                if (tracking.status === "paused_stale") {
                    nextDelayMs = 6000;
                } else {
                    const lastIdx = Math.max(0, tracking.routeWaypoints.length - 1);
                    const nextIdx = Math.min(tracking.waypointIndex + 1, lastIdx);
                    const wp = tracking.routeWaypoints[nextIdx];
                    tracking.waypointIndex = nextIdx;
                    tracking.currentCoords = { lat: wp.lat, lng: wp.lng, label: wp.label };
                    tracking.lastUpdatedAt = new Date();

                    if (nextIdx >= lastIdx) {
                        tracking.status = "completed";
                        tracking.etaRangeText = "Delivered (Location sharing stopped)";
                        await tracking.save();

                        order.status = "delivered";
                        order.timeline.push({
                            status: "delivered",
                            note: "Order delivered to customer zone; live courier sharing ended.",
                            actorRole: "system"
                        });
                        await order.save();

                        await Notification.create({
                            recipient: order.customer,
                            title: `Order ${order.orderNumber} Delivered`,
                            message: "Your order has arrived. Thank you for using MedWatch AI!",
                            category: "order",
                            link: `/orders/${order._id}`
                        });

                        emitOrderAndTracking({ order, tracking });
                        return clearOrderTimers(key);
                    } else {
                        const eta = Number(wp.etaMinutes) || 5;
                        tracking.etaRangeText = `${Math.max(2, eta)}–${eta + 3} mins`;
                        await tracking.save();
                        emitOrderAndTracking({ order, tracking });
                    }
                }
            } else {
                return clearOrderTimers(key);
            }

            const timer = setTimeout(runNextStep, nextDelayMs);
            activeTimers.set(key, timer);
        } catch {
            clearOrderTimers(key);
        }
    };

    const initialTimer = setTimeout(runNextStep, 4000);
    activeTimers.set(key, initialTimer);
};

module.exports = {
    scheduleAutoLiveOrder,
    clearOrderTimers
};
