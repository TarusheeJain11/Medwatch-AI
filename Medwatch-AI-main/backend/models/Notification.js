const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
    {
        recipient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
            index: true
        },
        roleTarget: {
            type: String,
            enum: ["all", "customer", "pharmacy", "admin", "direct"],
            default: "direct"
        },
        title: { type: String, required: true, trim: true },
        message: { type: String, required: true, trim: true },
        category: {
            type: String,
            enum: ["order", "verification", "expiry", "system", "privacy", "recall"],
            default: "system"
        },
        link: { type: String, default: "" },
        isRead: { type: Boolean, default: false },
        isDemo: { type: Boolean, default: true }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Notification", notificationSchema);
