const mongoose = require("mongoose");

const waypointSchema = new mongoose.Schema(
    {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
        label: { type: String, required: true },
        etaMinutes: { type: Number, required: true }
    },
    { _id: false }
);

const trackingSessionSchema = new mongoose.Schema(
    {
        order: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "DemoOrder",
            required: true,
            unique: true
        },
        customer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        pharmacy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Pharmacy",
            required: true,
            index: true
        },
        status: {
            type: String,
            enum: ["active", "paused_stale", "completed", "expired", "cancelled"],
            default: "active"
        },
        currentCoords: {
            lat: { type: Number, required: true },
            lng: { type: Number, required: true },
            label: { type: String, required: true }
        },
        routeWaypoints: { type: [waypointSchema], default: [] },
        routeGeometry: {
            type: [{ lat: { type: Number }, lng: { type: Number } }],
            default: []
        },
        distanceKm: { type: Number, default: 3.5 },
        routingProvider: { type: String, default: "OpenStreetMap OSRM Live Routing" },
        waypointIndex: { type: Number, default: 0 },
        etaRangeText: { type: String, default: "18–24 mins" },
        delayNotice: { type: String, default: "" },
        lastUpdatedAt: { type: Date, default: Date.now },
        expiresAt: {
            type: Date,
            default: () => new Date(Date.now() + 2 * 60 * 60 * 1000)
        },
        isSynthetic: { type: Boolean, default: true }
    },
    { timestamps: true }
);

module.exports = mongoose.model("TrackingSession", trackingSessionSchema);
