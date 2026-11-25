const mongoose = require("mongoose");

const sourceRecordSchema = new mongoose.Schema(
    {
        sourceName: { type: String, required: true, trim: true },
        sourceType: {
            type: String,
            enum: ["catalog_feed", "partner_inventory", "policy_doc", "license_registry"],
            default: "catalog_feed"
        },
        status: {
            type: String,
            enum: ["synced", "pending", "failed", "dead_letter"],
            default: "synced",
            index: true
        },
        recordsProcessed: { type: Number, default: 0 },
        recordsFlagged: { type: Number, default: 0 },
        checksum: { type: String, default: "" },
        errorMessage: { type: String, default: "" },
        retryCount: { type: Number, default: 0 },
        provenanceNote: { type: String, default: "" },
        lastSyncedAt: { type: Date, default: Date.now },
        nextRetryAt: { type: Date, default: null }
    },
    { timestamps: true }
);

module.exports = mongoose.model("SourceRecord", sourceRecordSchema);
