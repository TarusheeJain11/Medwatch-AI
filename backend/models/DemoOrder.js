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
            discountAmount: { type: Number, default: 0 },
            serviceFee: { type: Number, required: true },
            taxAmount: { type: Number, required: true },
            totalAmount: { type: Number, required: true }
        },
        couponCode: { type: String, default: "" },
        serviceArea: { type: String, required: true, trim: true },
        deliveryDetails: {
            recipientName: { type: String, default: "" },
            phone: { type: String, default: "" },
            addressLine: { type: String, default: "" },
            city: { type: String, default: "" },
            pinCode: { type: String, default: "" },
            lat: { type: Number, default: null },
            lng: { type: Number, default: null },
            instructions: { type: String, default: "" }
        },
        deliveryOtp: { type: String, default: "" },
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
            enum: ["pending", "authorized_sandbox", "paid_sandbox", "paid_gateway", "cod_pending", "refunded_sandbox", "refunded"],
            default: "paid_sandbox"
        },
        paymentMethod: {
            type: String,
            default: "sandbox"
        },
        paymentTransaction: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PaymentTransaction",
            default: null
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
