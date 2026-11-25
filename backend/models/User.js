const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },
        phone: {
            type: String,
            default: "",
            trim: true
        },
        password: {
            type: String,
            required: true,
            select: false
        },
        role: {
            type: String,
            enum: ["customer", "pharmacy_owner", "pharmacy", "admin"],
            default: "customer"
        },
        isVerified: {
            type: Boolean,
            default: false
        },
        emailVerified: {
            type: Boolean,
            default: false
        },
        emailVerificationTokenHash: {
            type: String,
            default: null,
            select: false
        },
        emailVerificationExpiresAt: {
            type: Date,
            default: null,
            select: false
        },
        isActive: {
            type: Boolean,
            default: true
        },
        suspensionReason: {
            type: String,
            default: ""
        },
        failedLoginAttempts: {
            type: Number,
            default: 0,
            select: false
        },
        lockUntil: {
            type: Date,
            default: null,
            select: false
        },
        language: {
            type: String,
            enum: ["en", "hi", "pa"],
            default: "en"
        },
        lowBandwidthMode: {
            type: Boolean,
            default: false
        },
        mfaEnabled: {
            type: Boolean,
            default: false
        },
        mfaCodeHint: {
            type: String,
            default: "",
            select: false
        },
        sessionVersion: {
            type: Number,
            default: 1
        },
        termsAcceptedAt: {
            type: Date,
            default: null
        },
        dpdpConsent: {
            acceptedAt: { type: Date, default: null },
            analyticsOptIn: { type: Boolean, default: false },
            notificationsOptIn: { type: Boolean, default: true }
        },
        preferences: {
            city: { type: String, default: "Jalandhar" },
            accessibilityNeeds: { type: String, default: "" }
        },
        lastLoginAt: {
            type: Date,
            default: null
        },
        passwordResetTokenHash: {
            type: String,
            default: null,
            select: false
        },
        passwordResetExpiresAt: {
            type: Date,
            default: null,
            select: false
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
