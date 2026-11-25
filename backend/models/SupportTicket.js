const mongoose = require("mongoose");

const supportTicketSchema = new mongoose.Schema(
    {
        ticketNumber: { type: String, required: true, unique: true },
        type: {
            type: String,
            enum: ["support", "correction", "feedback", "dispute"],
            default: "support"
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
            index: true
        },
        contactEmail: { type: String, default: "", trim: true, lowercase: true },
        relatedMedicine: { type: mongoose.Schema.Types.ObjectId, ref: "Medicine", default: null },
        relatedPharmacy: { type: mongoose.Schema.Types.ObjectId, ref: "Pharmacy", default: null },
        relatedOrder: { type: mongoose.Schema.Types.ObjectId, ref: "DemoOrder", default: null },
        subject: { type: String, required: true, trim: true, maxlength: 160 },
        description: { type: String, required: true, trim: true, maxlength: 2000 },
        proposedCorrection: { type: String, default: "", maxlength: 1000 },
        status: {
            type: String,
            enum: ["open", "in_review", "resolved", "dismissed"],
            default: "open",
            index: true
        },
        resolutionNote: { type: String, default: "" },
        resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        resolvedAt: { type: Date, default: null }
    },
    { timestamps: true }
);

module.exports = mongoose.model("SupportTicket", supportTicketSchema);
