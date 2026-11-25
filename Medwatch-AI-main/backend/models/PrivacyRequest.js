const mongoose = require("mongoose");

const privacyRequestSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        requestType: {
            type: String,
            enum: ["export", "deletion", "rectification"],
            required: true
        },
        status: {
            type: String,
            enum: ["pending", "completed", "rejected"],
            default: "pending"
        },
        reason: { type: String, default: "" },
        processedAt: { type: Date, default: null },
        processedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
    },
    { timestamps: true }
);

module.exports = mongoose.model("PrivacyRequest", privacyRequestSchema);
