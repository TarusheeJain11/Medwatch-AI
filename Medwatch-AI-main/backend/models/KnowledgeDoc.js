const mongoose = require("mongoose");

const knowledgeDocSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true },
        category: {
            type: String,
            enum: ["catalog", "policy", "faq", "accessibility", "safety"],
            default: "policy"
        },
        language: {
            type: String,
            enum: ["en", "hi", "pa"],
            default: "en"
        },
        content: { type: String, required: true },
        sourceCitation: { type: String, required: true },
        reviewedAt: { type: Date, default: Date.now },
        tags: { type: [String], default: [] },
        isReviewed: { type: Boolean, default: true }
    },
    { timestamps: true }
);

module.exports = mongoose.model("KnowledgeDoc", knowledgeDocSchema);
