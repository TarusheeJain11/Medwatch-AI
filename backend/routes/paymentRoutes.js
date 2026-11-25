const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");
const router = express.Router();

const DemoProduct = require("../models/DemoProduct");
const DemoOrder = require("../models/DemoOrder");
const Pharmacy = require("../models/Pharmacy");
const TrackingSession = require("../models/TrackingSession");
const Notification = require("../models/Notification");
const PaymentTransaction = require("../models/PaymentTransaction");
const { protect, authorize } = require("../middleware/authMiddleware");
const { recordAudit } = require("../services/auditService");
const { fetchOsrmRouteWaypoints, fetchLiveExchangeRates } = require("../services/liveDataService");
const { scheduleAutoLiveOrder } = require("../services/liveOrderEngine");
const eventBus = require("../services/eventBus");

const COUPONS = {
    MEDWATCH10: { code: "MEDWATCH10", type: "percent", value: 10, maxDiscount: 150, minOrder: 150, label: "10% off up to ₹150" },
    FIRSTCARE50: { code: "FIRSTCARE50", type: "flat", value: 50, maxDiscount: 50, minOrder: 200, label: "Flat ₹50 off on orders ₹200+" },
    WELLNESS15: { code: "WELLNESS15", type: "percent", value: 15, maxDiscount: 250, minOrder: 400, label: "15% off on orders ₹400+" }
};

const BANKS = [
    { code: "SBI", name: "State Bank of India" },
    { code: "HDFC", name: "HDFC Bank" },
    { code: "ICICI", name: "ICICI Bank" },
    { code: "AXIS", name: "Axis Bank" },
    { code: "KOTAK", name: "Kotak Mahindra Bank" }
];

const WALLETS = [
    { code: "PAYTM", name: "Paytm Wallet" },
    { code: "AMAZON", name: "Amazon Pay" },
    { code: "PHONEPE", name: "PhonePe Wallet" },
    { code: "MOBIKWIK", name: "MobiKwik" }
];

const getGatewaySecret = () =>
    process.env.RAZORPAY_KEY_SECRET || process.env.JWT_SECRET || "medwatch_gateway_secret";

const isRazorpayConfigured = () =>
    Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

const computeCouponDiscount = (code, subtotal) => {
    const clean = String(code || "").trim().toUpperCase();
    if (!clean) return { valid: false, discountAmount: 0, coupon: null };
    const coupon = COUPONS[clean];
    if (!coupon) return { valid: false, discountAmount: 0, error: "Invalid coupon code." };
    if (subtotal < coupon.minOrder) {
        return { valid: false, discountAmount: 0, error: `Minimum subtotal of ₹${coupon.minOrder} required for ${coupon.code}.` };
    }
    const rawDiscount = coupon.type === "percent"
        ? Math.round((subtotal * coupon.value) / 100)
        : coupon.value;
    const discountAmount = Math.min(subtotal, Math.min(coupon.maxDiscount, rawDiscount));
    return { valid: true, discountAmount, coupon };
};

const luhnValid = (cardNum) => {
    const digits = String(cardNum || "").replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19) return false;
    let sum = 0;
    let alt = false;
    for (let i = digits.length - 1; i >= 0; i--) {
        let n = parseInt(digits[i], 10);
        if (alt) {
            n *= 2;
            if (n > 9) n -= 9;
        }
        sum += n;
        alt = !alt;
    }
    return sum % 10 === 0;
};

const detectCardBrand = (cardNum) => {
    const d = String(cardNum || "").replace(/\D/g, "");
    if (/^4/.test(d)) return "Visa";
    if (/^(5[1-5]|2[2-7])/.test(d)) return "Mastercard";
    if (/^(60|65|81|82|508)/.test(d)) return "RuPay";
    if (/^3[47]/.test(d)) return "Amex";
    return "Card";
};

const buildFallbackWaypoints = (pharmacy, serviceArea, toLat = null, toLng = null) => {
    const baseLat = pharmacy.lat || 31.3260;
    const baseLng = pharmacy.lng || 75.5762;
    const endLat = typeof toLat === "number" ? toLat : baseLat + 0.012;
    const endLng = typeof toLng === "number" ? toLng : baseLng + 0.014;
    const wps = [
        { lat: baseLat, lng: baseLng, label: `Picked up from ${pharmacy.name}`, etaMinutes: 20 },
        { lat: baseLat + (endLat - baseLat) * 0.35, lng: baseLng + (endLng - baseLng) * 0.35, label: "Passing Main City Chowk", etaMinutes: 14 },
        { lat: baseLat + (endLat - baseLat) * 0.7, lng: baseLng + (endLng - baseLng) * 0.7, label: `Entering ${serviceArea}`, etaMinutes: 7 },
        { lat: endLat, lng: endLng, label: `Arrived at ${serviceArea}`, etaMinutes: 0 }
    ];
    return wps;
};

// Public Payment Gateway Configuration + Live FX Rates
router.get("/config", async (req, res) => {
    const fx = await fetchLiveExchangeRates();
    res.status(200).json({
        success: true,
        provider: isRazorpayConfigured() ? "razorpay_live" : "medwatch_gateway_sandbox",
        razorpayKeyId: isRazorpayConfigured() ? process.env.RAZORPAY_KEY_ID : "rzp_test_medwatch_pilot",
        currency: "INR",
        methods: [
            { id: "upi", label: "UPI / QR (GPay, PhonePe, Paytm)", badge: "Instant", icons: ["/images/payments/upi.svg", "/images/payments/gpay.svg", "/images/payments/phonepe.svg"] },
            { id: "card", label: "Credit / Debit Card (Visa, Mastercard, RuPay)", badge: "3DS Secured", icons: ["/images/payments/visa.svg", "/images/payments/mastercard.svg", "/images/payments/rupay.svg"] },
            { id: "netbanking", label: "NetBanking (All Major Indian Banks)", badge: "Direct", icons: ["/images/payments/netbanking.svg"] },
            { id: "wallet", label: "Wallets (Paytm, Amazon Pay, PhonePe)", badge: "1-Tap", icons: ["/images/payments/wallet.svg"] },
            { id: "cod", label: "Cash / UPI on Delivery", badge: "Pay at Door", icons: ["/images/payments/cod.svg"] }
        ],
        banks: BANKS,
        wallets: WALLETS,
        coupons: Object.values(COUPONS),
        exchangeRates: fx
    });
});

// Validate Promo Coupon
router.post("/validate-coupon", protect, async (req, res) => {
    const { code = "", subtotal = 0 } = req.body || {};
    const result = computeCouponDiscount(code, Number(subtotal) || 0);
    if (!result.valid) {
        return res.status(400).json({ success: false, message: result.error || "Invalid coupon." });
    }
    res.status(200).json({
        success: true,
        code: result.coupon.code,
        discountAmount: result.discountAmount,
        label: result.coupon.label
    });
});

// Step 1: Create Payment Gateway Intent / Order
router.post("/create-intent", protect, async (req, res) => {
    try {
        const {
            pharmacyId,
            items = [],
            serviceArea = "Model Town",
            deliveryDetails = {},
            couponCode = "",
            idempotencyKey
        } = req.body || {};

        if (!idempotencyKey || typeof idempotencyKey !== "string" || idempotencyKey.length > 100) {
            return res.status(400).json({ success: false, message: "Idempotency key is required." });
        }

        // Return existing completed order if already paid with same idempotencyKey
        const existingOrder = await DemoOrder.findOne({
            customer: req.user._id,
            idempotencyKey: idempotencyKey.trim()
        })
            .populate("pharmacy", "name city address")
            .lean();
        if (existingOrder) {
            return res.status(200).json({
                success: true,
                alreadyCompleted: true,
                order: existingOrder
            });
        }

        if (!mongoose.isValidObjectId(pharmacyId)) {
            return res.status(400).json({ success: false, message: "Select a valid dispatching pharmacy." });
        }
        const pharmacy = await Pharmacy.findOne({
            _id: pharmacyId,
            $or: [{ isVerified: true }, { owner: null }]
        });
        if (!pharmacy) {
            return res.status(404).json({ success: false, message: "Selected pharmacy is not available." });
        }

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: "Your cart is empty." });
        }

        const productIds = items.map((i) => i.productId).filter((id) => mongoose.isValidObjectId(id));
        const dbProducts = await DemoProduct.find({ _id: { $in: productIds }, inStock: true }).lean();
        const productMap = new Map(dbProducts.map((p) => [String(p._id), p]));

        const normalizedItems = [];
        let subtotal = 0;

        for (const reqItem of items) {
            const prod = productMap.get(String(reqItem.productId));
            const qty = Number(reqItem.quantity);
            if (!prod) return res.status(400).json({ success: false, message: "Invalid product in cart." });
            if (!Number.isInteger(qty) || qty < 1 || qty > (prod.maxQuantity || 10)) {
                return res.status(400).json({
                    success: false,
                    message: `Quantity for ${prod.name} must be between 1 and ${prod.maxQuantity || 10}.`
                });
            }
            const lineTotal = prod.unitPrice * qty;
            subtotal += lineTotal;
            normalizedItems.push({
                product: prod._id,
                sku: prod.sku,
                name: prod.name,
                quantity: qty,
                unitPrice: prod.unitPrice,
                lineTotal
            });
        }

        const couponEval = couponCode ? computeCouponDiscount(couponCode, subtotal) : { valid: false, discountAmount: 0 };
        const discountAmount = couponEval.valid ? couponEval.discountAmount : 0;
        const discountedSubtotal = Math.max(0, subtotal - discountAmount);
        const serviceFee = 25;
        const taxAmount = Math.round(discountedSubtotal * 0.05);
        const totalAmount = discountedSubtotal + serviceFee + taxAmount;

        const txSuffix = crypto.randomBytes(4).toString("hex").toUpperCase();
        const transactionId = `TXN-${txSuffix}`;
        let gatewayOrderId = `order_mw_${crypto.randomBytes(6).toString("hex")}`;
        let provider = "medwatch_gateway_sandbox";

        // Optional Real Razorpay Orders API when keys are provided in .env
        if (isRazorpayConfigured()) {
            try {
                const authHeader = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
                const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
                    method: "POST",
                    headers: {
                        Authorization: `Basic ${authHeader}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        amount: totalAmount * 100,
                        currency: "INR",
                        receipt: transactionId,
                        notes: { customerId: String(req.user._id), pharmacyId: String(pharmacy._id) }
                    })
                });
                const rzpData = await rzpRes.json();
                if (rzpRes.ok && rzpData.id) {
                    gatewayOrderId = rzpData.id;
                    provider = "razorpay_live";
                }
            } catch {
                // Fall back to sandbox gateway seamlessly
            }
        }

        const cleanArea = String(deliveryDetails.serviceArea || serviceArea || "Central Sector").trim().slice(0, 120);

        const tx = await PaymentTransaction.create({
            transactionId,
            gatewayOrderId,
            provider,
            customer: req.user._id,
            pharmacy: pharmacy._id,
            idempotencyKey: idempotencyKey.trim(),
            itemsSnapshot: normalizedItems,
            deliveryDetails: {
                recipientName: String(deliveryDetails.recipientName || req.user.name || "").trim().slice(0, 80),
                phone: String(deliveryDetails.phone || req.user.phone || "").trim().slice(0, 20),
                addressLine: String(deliveryDetails.addressLine || "").trim().slice(0, 200),
                serviceArea: cleanArea,
                city: String(deliveryDetails.city || pharmacy.city || "").trim().slice(0, 80),
                pinCode: String(deliveryDetails.pinCode || "").trim().slice(0, 10),
                lat: typeof deliveryDetails.lat === "number" ? deliveryDetails.lat : null,
                lng: typeof deliveryDetails.lng === "number" ? deliveryDetails.lng : null,
                instructions: String(deliveryDetails.instructions || "").trim().slice(0, 200)
            },
            couponCode: couponEval.valid ? couponEval.coupon.code : "",
            costBreakdown: {
                subtotal,
                discountAmount,
                serviceFee,
                taxAmount,
                totalAmount
            },
            currency: "INR",
            status: "created"
        });

        res.status(201).json({
            success: true,
            provider,
            razorpayKeyId: isRazorpayConfigured() ? process.env.RAZORPAY_KEY_ID : "rzp_test_medwatch_pilot",
            intent: {
                intentId: tx._id,
                transactionId: tx.transactionId,
                gatewayOrderId: tx.gatewayOrderId,
                amount: totalAmount,
                amountPaise: totalAmount * 100,
                currency: "INR",
                costBreakdown: tx.costBreakdown,
                couponCode: tx.couponCode,
                pharmacyName: pharmacy.name,
                upiQrPayload: `upi://pay?pa=medwatch@okaxis&pn=MedWatch%20AI&tr=${tx.transactionId}&am=${totalAmount}&cu=INR`
            }
        });
    } catch {
        res.status(500).json({ success: false, message: "Could not initialize payment session." });
    }
});

// Step 2: Verify Payment & Complete Order Atomically
router.post("/verify-and-complete", protect, async (req, res) => {
    try {
        const {
            intentId,
            method = "upi",
            upiVpa = "",
            cardNumber = "",
            cardExpiry = "",
            cardCvv = "",
            cardName = "",
            bankCode = "",
            walletCode = "",
            razorpayPaymentId = "",
            razorpaySignature = "",
            simulateFailure = false
        } = req.body || {};

        if (!mongoose.isValidObjectId(intentId)) {
            return res.status(400).json({ success: false, message: "Invalid payment session ID." });
        }

        const tx = await PaymentTransaction.findOne({ _id: intentId, customer: req.user._id });
        if (!tx) {
            return res.status(404).json({ success: false, message: "Payment session not found." });
        }

        if (tx.order) {
            const existingOrder = await DemoOrder.findById(tx.order).populate("pharmacy", "name city address openingHours").lean();
            return res.status(200).json({
                success: true,
                deduplicated: true,
                message: "Payment already verified for this order.",
                transaction: tx,
                data: existingOrder
            });
        }

        if (!["upi", "card", "netbanking", "wallet", "cod"].includes(method)) {
            return res.status(400).json({ success: false, message: "Unsupported payment method." });
        }

        if (simulateFailure) {
            tx.status = "failed";
            tx.method = method;
            tx.failureReason = "Simulated bank / issuer decline requested for test.";
            await tx.save();
            return res.status(402).json({
                success: false,
                code: "PAYMENT_DECLINED",
                message: "Payment was declined by the issuing bank. Please try another method or retry."
            });
        }

        // Validate method-specific payload
        const methodDetails = { label: method.toUpperCase() };
        if (method === "upi") {
            const cleanVpa = String(upiVpa || "pilot.customer@okaxis").trim();
            if (!/^[a-zA-Z0-9._-]{2,}@[a-zA-Z0-9]{2,}$/.test(cleanVpa)) {
                return res.status(400).json({ success: false, message: "Enter a valid UPI ID (e.g. name@okaxis)." });
            }
            methodDetails.label = `UPI (${cleanVpa})`;
            methodDetails.upiVpa = cleanVpa;
        } else if (method === "card") {
            const digits = String(cardNumber || "").replace(/\D/g, "");
            if (!luhnValid(digits)) {
                return res.status(400).json({ success: false, message: "Invalid card number. Check digits and try again." });
            }
            if (!/^(0[1-9]|1[0-2])\/?\d{2,4}$/.test(String(cardExpiry || "").trim())) {
                return res.status(400).json({ success: false, message: "Enter valid card expiry (MM/YY)." });
            }
            if (!/^\d{3,4}$/.test(String(cardCvv || "").trim())) {
                return res.status(400).json({ success: false, message: "Enter valid 3 or 4 digit CVV." });
            }
            const brand = detectCardBrand(digits);
            const last4 = digits.slice(-4);
            methodDetails.label = `${brand} •••• ${last4}${cardName ? ` (${String(cardName).trim().slice(0, 24)})` : ""}`;
            methodDetails.cardBrand = brand;
            methodDetails.cardLast4 = last4;
        } else if (method === "netbanking") {
            const bank = BANKS.find((b) => b.code === bankCode) || BANKS[0];
            methodDetails.label = `NetBanking — ${bank.name}`;
            methodDetails.bankName = bank.name;
        } else if (method === "wallet") {
            const wallet = WALLETS.find((w) => w.code === walletCode) || WALLETS[0];
            methodDetails.label = `Wallet — ${wallet.name}`;
            methodDetails.walletName = wallet.name;
        } else if (method === "cod") {
            methodDetails.label = "Cash / UPI on Delivery";
        }

        // Verify or generate HMAC-SHA256 gateway signature
        const generatedPaymentId = razorpayPaymentId || `pay_mw_${crypto.randomBytes(6).toString("hex")}`;
        const expectedSignature = crypto
            .createHmac("sha256", getGatewaySecret())
            .update(`${tx.gatewayOrderId}|${generatedPaymentId}`)
            .digest("hex");

        if (tx.provider === "razorpay_live" && razorpayPaymentId && razorpaySignature) {
            if (razorpaySignature !== expectedSignature) {
                tx.status = "failed";
                tx.failureReason = "Razorpay HMAC signature verification failed.";
                await tx.save();
                return res.status(400).json({ success: false, message: "Payment signature verification failed." });
            }
        }

        tx.method = method;
        tx.methodDetails = methodDetails;
        tx.gatewayPaymentId = generatedPaymentId;
        tx.gatewaySignature = razorpaySignature || expectedSignature;
        tx.status = method === "cod" ? "cod_pending" : "captured";
        tx.capturedAt = method === "cod" ? null : new Date();

        const pharmacy = await Pharmacy.findById(tx.pharmacy);
        const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
        const deliveryOtp = String(crypto.randomInt(1000, 9999));

        const order = await DemoOrder.create({
            orderNumber: `MW-${suffix}`,
            idempotencyKey: tx.idempotencyKey,
            customer: req.user._id,
            pharmacy: tx.pharmacy,
            items: tx.itemsSnapshot,
            costBreakdown: tx.costBreakdown,
            couponCode: tx.couponCode,
            serviceArea: tx.deliveryDetails?.serviceArea || "Central Sector",
            deliveryDetails: tx.deliveryDetails,
            deliveryOtp,
            status: "submitted",
            paymentStatus: method === "cod" ? "cod_pending" : "paid_gateway",
            paymentMethod: methodDetails.label,
            paymentTransaction: tx._id,
            receiptNumber: `INV-${suffix}`,
            timeline: [
                {
                    status: "submitted",
                    note:
                        method === "cod"
                            ? `Order placed with Cash/UPI on Delivery (${tx.transactionId}).`
                            : `Payment ₹${tx.costBreakdown.totalAmount} captured via ${methodDetails.label} (${generatedPaymentId}).`,
                    actorId: req.user._id,
                    actorRole: req.user.role
                }
            ],
            isNonMedicalDemo: true,
            isDemo: false
        });

        tx.order = order._id;
        await tx.save();

        // Live OSRM road route between pharmacy and customer locality coordinates
        const fromLat = pharmacy?.lat || 31.3260;
        const fromLng = pharmacy?.lng || 75.5762;
        const toLat = typeof tx.deliveryDetails?.lat === "number" ? tx.deliveryDetails.lat : fromLat + 0.015;
        const toLng = typeof tx.deliveryDetails?.lng === "number" ? tx.deliveryDetails.lng : fromLng + 0.018;

        const osrmRoute = await fetchOsrmRouteWaypoints({
            fromLat,
            fromLng,
            toLat,
            toLng,
            pharmacyName: pharmacy?.name || "Verified Pharmacy",
            serviceArea: order.serviceArea
        });

        const waypoints = osrmRoute?.waypoints || buildFallbackWaypoints(pharmacy || {}, order.serviceArea, toLat, toLng);
        const etaMinutes = osrmRoute?.totalMinutes || 18;

        await TrackingSession.create({
            order: order._id,
            customer: req.user._id,
            pharmacy: tx.pharmacy,
            status: "active",
            currentCoords: { lat: waypoints[0].lat, lng: waypoints[0].lng, label: waypoints[0].label },
            routeWaypoints: waypoints,
            routeGeometry: osrmRoute?.routeGeometry || waypoints.map((w) => ({ lat: w.lat, lng: w.lng })),
            distanceKm: osrmRoute?.distanceKm || 3.5,
            routingProvider: osrmRoute?.provider || "Estimated Local Route",
            waypointIndex: 0,
            etaRangeText: `${etaMinutes}–${etaMinutes + 5} mins (${osrmRoute ? `${osrmRoute.distanceKm} km via OSRM` : "Estimated"})`,
            lastUpdatedAt: new Date()
        });

        await Notification.create({
            recipient: req.user._id,
            title: `Payment Confirmed & Order ${order.orderNumber} Placed`,
            message: `${method === "cod" ? "COD confirmed" : `₹${tx.costBreakdown.totalAmount} paid`} via ${methodDetails.label}. Delivery PIN: ${deliveryOtp}.`,
            category: "order",
            link: `/orders/${order._id}`
        });

        if (pharmacy?.owner) {
            await Notification.create({
                recipient: pharmacy.owner,
                title: `New Paid Order ${order.orderNumber}`,
                message: `₹${tx.costBreakdown.totalAmount} (${method.toUpperCase()}) for ${order.serviceArea}.`,
                category: "order",
                link: "/pharmacy/dashboard"
            });
        }

        await recordAudit({
            req,
            action: "payments.captured",
            domain: "orders",
            targetType: "PaymentTransaction",
            targetId: tx._id,
            summary: `Captured ₹${tx.costBreakdown.totalAmount} via ${methodDetails.label} for ${order.orderNumber}`
        });

        eventBus.publish({
            type: "order.created",
            payload: { orderId: order._id, orderNumber: order.orderNumber, status: order.status, paymentStatus: order.paymentStatus },
            audience: {
                userIds: [req.user._id, pharmacy?.owner].filter(Boolean),
                roles: ["admin"]
            }
        });

        scheduleAutoLiveOrder(order._id);

        const populated = await DemoOrder.findById(order._id)
            .populate("pharmacy", "name city address phone openingHours")
            .populate("paymentTransaction", "transactionId gatewayOrderId gatewayPaymentId method methodDetails status capturedAt")
            .lean();

        res.status(201).json({
            success: true,
            message: `Payment successful! Order ${order.orderNumber} is confirmed.`,
            transaction: tx,
            data: populated
        });
    } catch {
        res.status(500).json({ success: false, message: "Payment verification failed." });
    }
});

// Process Full Refund (Customer on eligible order or Admin on any paid order)
router.post("/:orderId/refund", protect, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.orderId)) {
            return res.status(400).json({ success: false, message: "Invalid order ID." });
        }
        const order = await DemoOrder.findById(req.params.orderId).populate("pharmacy", "owner name");
        if (!order) return res.status(404).json({ success: false, message: "Order not found." });

        const isCustomer = String(order.customer) === String(req.user._id);
        const isPartnerOwner = order.pharmacy?.owner && String(order.pharmacy.owner) === String(req.user._id);
        const isAdmin = req.user.role === "admin";
        if (!isCustomer && !isPartnerOwner && !isAdmin) {
            return res.status(403).json({ success: false, message: "Not authorized." });
        }

        if (!["paid_sandbox", "paid_gateway"].includes(order.paymentStatus)) {
            return res.status(400).json({ success: false, message: "Order payment is not eligible for refund." });
        }

        const refundId = `rfnd_mw_${crypto.randomBytes(5).toString("hex")}`;
        order.paymentStatus = order.paymentStatus === "paid_sandbox" ? "refunded_sandbox" : "refunded";
        if (!["delivered", "cancelled", "returned"].includes(order.status)) {
            order.status = "cancelled";
        }
        order.timeline.push({
            status: "refunded",
            note: `Full refund ₹${order.costBreakdown?.totalAmount || 0} processed (${refundId}).`,
            actorId: req.user._id,
            actorRole: req.user.role
        });
        await order.save();

        if (order.paymentTransaction) {
            await PaymentTransaction.findByIdAndUpdate(order.paymentTransaction, {
                $set: {
                    status: "refunded",
                    refundId,
                    refundAmount: order.costBreakdown?.totalAmount || 0,
                    refundedAt: new Date()
                }
            });
        }

        await Notification.create({
            recipient: order.customer,
            title: `Refund Processed for ${order.orderNumber}`,
            message: `₹${order.costBreakdown?.totalAmount || 0} has been refunded (${refundId}).`,
            category: "order",
            link: `/orders/${order._id}`
        });

        await recordAudit({
            req,
            action: "payments.refunded",
            domain: "orders",
            targetType: "DemoOrder",
            targetId: order._id,
            summary: `Refunded ₹${order.costBreakdown?.totalAmount || 0} on ${order.orderNumber} (${refundId})`
        });

        eventBus.publish({
            type: "order.updated",
            payload: {
                orderId: order._id,
                orderNumber: order.orderNumber,
                status: order.status,
                paymentStatus: order.paymentStatus,
                timeline: order.timeline
            },
            audience: { userIds: [order.customer, order.pharmacy?.owner].filter(Boolean), roles: ["admin"] }
        });

        res.status(200).json({ success: true, message: `Refund ${refundId} completed.`, refundId, data: order });
    } catch {
        res.status(500).json({ success: false, message: "Refund processing failed." });
    }
});

// Customer Payment & Invoice History
router.get("/my", protect, async (req, res) => {
    try {
        const transactions = await PaymentTransaction.find({ customer: req.user._id })
            .populate("pharmacy", "name city")
            .populate("order", "orderNumber status receiptNumber paymentStatus")
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();
        res.status(200).json({ success: true, count: transactions.length, data: transactions });
    } catch {
        res.status(500).json({ success: false, message: "Failed to load payment history." });
    }
});

// Admin Gateway Ledger & Revenue Breakdown
router.get("/admin/all", protect, authorize("admin"), async (req, res) => {
    try {
        const transactions = await PaymentTransaction.find()
            .populate("customer", "name email")
            .populate("pharmacy", "name city")
            .populate("order", "orderNumber status paymentStatus")
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();

        const summary = transactions.reduce(
            (acc, tx) => {
                const amt = tx.costBreakdown?.totalAmount || 0;
                if (tx.status === "captured") {
                    acc.capturedRevenue += amt;
                    acc.capturedCount += 1;
                } else if (tx.status === "cod_pending") {
                    acc.codPending += amt;
                } else if (tx.status === "refunded") {
                    acc.refundedAmount += tx.refundAmount || amt;
                }
                acc.byMethod[tx.method] = (acc.byMethod[tx.method] || 0) + 1;
                return acc;
            },
            { capturedRevenue: 0, capturedCount: 0, codPending: 0, refundedAmount: 0, byMethod: {} }
        );

        res.status(200).json({ success: true, summary, data: transactions });
    } catch {
        res.status(500).json({ success: false, message: "Failed to load gateway ledger." });
    }
});

module.exports = router;
