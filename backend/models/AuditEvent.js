const mongoose = require("mongoose");

const auditEventSchema = new mongoose.Schema(
    {
        actor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
            index: true
        },
        actorRole: { type: String, default: "guest" },
        action: { type: String, required: true, index: true },
        domain: {
            type: String,
            enum: ["auth", "catalog", "partner", "orders", "tracking", "admin", "privacy", "ai", "system"],
            default: "system"
        },
        targetType: { type: String, default: "" },
        targetId: { type: String, default: "" },
        summary: { type: String, required: true },
        metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
    },
    { timestamps: true }
);

module.exports = mongoose.model("AuditEvent", auditEventSchema);
