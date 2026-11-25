const mongoose = require("mongoose");

const paymentTransactionSchema = new mongoose.Schema(
    {
        transactionId: { type: String, required: true, unique: true, index: true },
        gatewayOrderId: { type: String, required: true, index: true },
        gatewayPaymentId: { type: String, default: "", index: true },
        gatewaySignature: { type: String, default: "" },
        provider: {
            type: String,
            enum: ["medwatch_gateway_sandbox", "razorpay_live"],
            default: "medwatch_gateway_sandbox"
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
            required: true
        },
        order: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "DemoOrder",
            default: null,
            index: true
        },
        idempotencyKey: { type: String, required: true, index: true },
        itemsSnapshot: { type: Array, default: [] },
        deliveryDetails: {
            recipientName: { type: String, default: "" },
            phone: { type: String, default: "" },
            addressLine: { type: String, default: "" },
            serviceArea: { type: String, default: "" },
            city: { type: String, default: "" },
            pinCode: { type: String, default: "" },
            lat: { type: Number, default: null },
            lng: { type: Number, default: null },
            instructions: { type: String, default: "" }
        },
        couponCode: { type: String, default: "" },
        costBreakdown: {
            subtotal: { type: Number, required: true },
            discountAmount: { type: Number, default: 0 },
            serviceFee: { type: Number, required: true },
            taxAmount: { type: Number, required: true },
            totalAmount: { type: Number, required: true }
        },
        currency: { type: String, default: "INR" },
        method: {
            type: String,
            enum: ["upi", "card", "netbanking", "wallet", "cod", "pending"],
            default: "pending"
        },
        methodDetails: {
            label: { type: String, default: "" },
            upiVpa: { type: String, default: "" },
            cardBrand: { type: String, default: "" },
            cardLast4: { type: String, default: "" },
            bankName: { type: String, default: "" },
            walletName: { type: String, default: "" }
        },
        status: {
            type: String,
            enum: ["created", "authorized", "captured", "cod_pending", "failed", "refund_initiated", "refunded"],
            default: "created",
            index: true
        },
        failureReason: { type: String, default: "" },
        refundId: { type: String, default: "" },
        refundAmount: { type: Number, default: 0 },
        refundedAt: { type: Date, default: null },
        capturedAt: { type: Date, default: null },
        expiresAt: { type: Date, default: () => new Date(Date.now() + 30 * 60 * 1000) }
    },
    { timestamps: true }
);

module.exports = mongoose.model("PaymentTransaction", paymentTransactionSchema);
