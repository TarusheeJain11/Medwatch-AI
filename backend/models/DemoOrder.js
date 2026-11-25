const mongoose = require("mongoose");

const timelineEntrySchema = new mongoose.Schema(
    {
        status: { type: String, required: true },
        note: { type: String, default: "" },
        actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        actorRole: { type: String, default: "system" },
        isException: { type: Boolean, default: false },
        timestamp: { type: Date, default: Date.now }
    },
    { _id: true }
);

const orderItemSchema = new mongoose.Schema(
    {
        product: { type: mongoose.Schema.Types.ObjectId, ref: "DemoProduct", required: true },
        sku: { type: String, required: true },
        name: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1, max: 10 },
        unitPrice: { type: Number, required: true, min: 0 },
        lineTotal: { type: Number, required: true, min: 0 }
    },
    { _id: false }
);

const demoOrderSchema = new mongoose.Schema(
    {
        orderNumber: { type: String, required: true, unique: true },
        idempotencyKey: { type: String, required: true, index: true },
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
        items: { type: [orderItemSchema], required: true },
        costBreakdown: {
            subtotal: { type: Number, required: true },
            serviceFee: { type: Number, required: true },
            taxAmount: { type: Number, required: true },
            totalAmount: { type: Number, required: true }
        },
        serviceArea: { type: String, required: true, trim: true },
        cancellationPolicy: {
            type: String,
            default: "Free cancellation in draft, submitted, or accepted stages before dispatch."
        },
        status: {
            type: String,
            enum: [
                "draft",
                "submitted",
                "accepted",
                "preparing",
                "dispatched",
                "delivered",
                "cancelled",
                "failed",
                "delayed",
                "rescheduled",
                "returned"
            ],
            default: "submitted",
            index: true
        },
        paymentStatus: {
            type: String,
            enum: ["pending", "authorized_sandbox", "paid_sandbox", "refunded_sandbox"],
            default: "paid_sandbox"
        },
        receiptNumber: { type: String, required: true },
        assignedCourier: { type: String, default: "Unassigned" },
        disputeNote: { type: String, default: "" },
        timeline: { type: [timelineEntrySchema], default: [] },
        isNonMedicalDemo: { type: Boolean, default: true },
        isDemo: { type: Boolean, default: true }
    },
    { timestamps: true }
);

demoOrderSchema.index({ customer: 1, idempotencyKey: 1 }, { unique: true });

module.exports = mongoose.model("DemoOrder", demoOrderSchema);
