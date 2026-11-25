const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { rateLimit } = require("express-rate-limit");
const User = require("../models/User");
const Pharmacy = require("../models/Pharmacy");
const Notification = require("../models/Notification");
const {
    COOKIE_NAME,
    normalizeRole,
    protect
} = require("../middleware/authMiddleware");
const { recordAudit } = require("../services/auditService");
const eventBus = require("../services/eventBus");
const {
    isEmailConfigured,
    sendVerificationEmail,
    sendPasswordResetEmail
} = require("../services/emailService");

const router = express.Router();

const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
};

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many authentication attempts. Please try again in 15 minutes."
    }
});

const recoveryLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 12,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many recovery requests. Please wait before trying again."
    }
});

const adminLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many administrator login attempts. Try again later."
    }
});

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

const hashToken = (rawToken) =>
    crypto.createHash("sha256").update(String(rawToken)).digest("hex");

const validateStrongPassword = (password) => {
    if (typeof password !== "string") {
        return "Password is required.";
    }
    if (password.length < 12) {
        return "Password must be at least 12 characters long.";
    }
    if (Buffer.byteLength(password, "utf8") > 72) {
        return "Password must not exceed 72 bytes.";
    }
    if (!/[A-Z]/.test(password)) {
        return "Password must include at least one uppercase letter.";
    }
    if (!/[a-z]/.test(password)) {
        return "Password must include at least one lowercase letter.";
    }
    if (!/[0-9]/.test(password)) {
        return "Password must include at least one number.";
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
        return "Password must include at least one special character.";
    }
    return null;
};

const serializeUser = (u) => ({
    id: u._id,
    name: u.name,
    email: u.email,
    phone: u.phone || "",
    role: normalizeRole(u.role),
    isVerified: u.isVerified,
    emailVerified: Boolean(u.emailVerified),
    isActive: u.isActive,
    language: u.language || "en",
    lowBandwidthMode: Boolean(u.lowBandwidthMode),
    mfaEnabled: Boolean(u.mfaEnabled),
    dpdpConsent: u.dpdpConsent || {
        acceptedAt: null,
        analyticsOptIn: false,
        notificationsOptIn: true
    },
    preferences: u.preferences || { city: "Jalandhar", accessibilityNeeds: "" },
    lastLoginAt: u.lastLoginAt
});

const signSessionToken = (user, rememberMe = false) =>
    jwt.sign(
        {
            userId: user._id.toString(),
            sessionVersion: user.sessionVersion || 1
        },
        process.env.JWT_SECRET,
        { algorithm: "HS256", expiresIn: rememberMe ? "7d" : "2h" }
    );

const setAuthCookie = (res, token, rememberMe = false) => {
    res.cookie(COOKIE_NAME, token, {
        ...cookieOptions,
        maxAge: rememberMe ? 7 * 24 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000
    });
    res.set("Cache-Control", "no-store");
};

// Public Registration: supports "customer" and "pharmacy_owner" ONLY (Admin disallowed)
router.post("/register", authLimiter, async (req, res) => {
    try {
        const {
            name,
            email,
            phone = "",
            password,
            confirmPassword,
            role = "customer",
            accountType,
            termsAccepted,
            dpdpAccepted,
            language = "en",
            // Pharmacy Owner details
            pharmacyName,
            licenseNumber,
            address,
            city,
            state,
            pinCode
        } = req.body || {};

        const requestedRole = accountType || role || "customer";
        if (!["customer", "pharmacy_owner"].includes(requestedRole)) {
            return res.status(403).json({
                success: false,
                message: "Public registration only supports Customer or Pharmacy Owner accounts."
            });
        }

        if (
            typeof name !== "string" ||
            !name.trim() ||
            name.trim().length < 2 ||
            name.length > 100 ||
            typeof email !== "string" ||
            email.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
        ) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid full name and email address."
            });
        }

        const passwordErr = validateStrongPassword(password);
        if (passwordErr) {
            return res.status(400).json({ success: false, message: passwordErr });
        }

        if (confirmPassword !== undefined && password !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: "Passwords do not match."
            });
        }

        if (termsAccepted !== true && dpdpAccepted !== true) {
            return res.status(400).json({
                success: false,
                message: "Please accept the Terms of Service and Privacy Policy to continue."
            });
        }

        // Validate Pharmacy Owner required fields
        if (requestedRole === "pharmacy_owner") {
            if (
                typeof phone !== "string" ||
                phone.trim().length < 7 ||
                phone.trim().length > 20 ||
                typeof pharmacyName !== "string" ||
                pharmacyName.trim().length < 2 ||
                typeof licenseNumber !== "string" ||
                licenseNumber.trim().length < 4 ||
                typeof address !== "string" ||
                address.trim().length < 4 ||
                typeof city !== "string" ||
                city.trim().length < 2 ||
                typeof state !== "string" ||
                state.trim().length < 2 ||
                typeof pinCode !== "string" ||
                !/^[0-9]{6}$/.test(pinCode.trim())
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Complete pharmacy owner contact, pharmacy name, drug licence number, address, city, state, and 6-digit PIN code are required."
                });
            }
        }

        const normalizedEmail = email.trim().toLowerCase();
        const existingUser = await User.findOne({ email: normalizedEmail });
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "An account with this email address already exists."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const rawVerifyToken = crypto.randomBytes(32).toString("hex");

        const created = await User.create({
            name: name.trim(),
            email: normalizedEmail,
            phone: typeof phone === "string" ? phone.trim() : "",
            password: hashedPassword,
            role: requestedRole,
            isVerified: false,
            emailVerified: false,
            emailVerificationTokenHash: hashToken(rawVerifyToken),
            emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            termsAcceptedAt: new Date(),
            language: ["en", "hi", "pa"].includes(language) ? language : "en",
            preferences: {
                city: typeof city === "string" && city.trim() ? city.trim() : "Jalandhar",
                accessibilityNeeds: ""
            },
            dpdpConsent: {
                acceptedAt: new Date(),
                analyticsOptIn: false,
                notificationsOptIn: true
            }
        });

        let createdPharmacy = null;
        if (requestedRole === "pharmacy_owner") {
            try {
                createdPharmacy = await Pharmacy.create({
                    name: pharmacyName.trim(),
                    address: address.trim(),
                    city: city.trim(),
                    state: state.trim(),
                    pinCode: pinCode.trim(),
                    phone: phone.trim(),
                    contactEmail: normalizedEmail,
                    licenseNumber: licenseNumber.trim(),
                    serviceArea: `${city.trim()}, ${state.trim()}`,
                    owner: created._id,
                    isVerified: false,
                    verificationStatus: "pending",
                    staff: [
                        {
                            name: created.name,
                            email: created.email,
                            staffRole: "owner",
                            active: true
                        }
                    ],
                    posSandboxKey: `sbx_pos_${String(created._id).slice(-6)}_${Date.now().toString(36)}`
                });
            } catch (pharmacyErr) {
                // Rollback user if pharmacy creation fails
                await User.deleteOne({ _id: created._id });
                throw pharmacyErr;
            }
        }

        await Notification.create({
            recipient: created._id,
            title:
                requestedRole === "pharmacy_owner"
                    ? "Pharmacy Owner Account Created (Verification Pending)"
                    : "Welcome to MedWatch AI",
            message:
                requestedRole === "pharmacy_owner"
                    ? `${createdPharmacy.name} is registered with status Pending. Submit verification documents in your dashboard for admin approval before publishing listings.`
                    : "Your account is ready. Browse transparent medicine prices, verified pharmacies, and healthcare guides.",
            category: requestedRole === "pharmacy_owner" ? "verification" : "system",
            link: requestedRole === "pharmacy_owner" ? "/pharmacy/dashboard" : "/account"
        });

        await recordAudit({
            actor: created._id,
            actorRole: requestedRole,
            action: "user.registered",
            domain: "auth",
            targetType: "User",
            targetId: created._id,
            summary:
                requestedRole === "pharmacy_owner"
                    ? `Registered Pharmacy Owner and linked pharmacy ${createdPharmacy?.name}`
                    : "Registered Customer account"
        });

        if (createdPharmacy) {
            eventBus.publish({
                type: "partner.verification_requested",
                payload: { pharmacyId: createdPharmacy._id, name: createdPharmacy.name },
                audience: { roles: ["admin"] }
            });
        }

        const emailResult = await sendVerificationEmail({
            to: created.email,
            name: created.name,
            token: rawVerifyToken
        });

        res.status(201).json({
            success: true,
            emailSent: emailResult.sent,
            emailConfigured: emailResult.configured,
            user: serializeUser(created),
            pharmacy: createdPharmacy
                ? {
                    id: createdPharmacy._id,
                    name: createdPharmacy.name,
                    verificationStatus: createdPharmacy.verificationStatus
                }
                : null,
            message:
                requestedRole === "pharmacy_owner"
                    ? emailResult.sent
                        ? "Pharmacy registered with Pending verification status! Check your email to verify your address, then sign in to your Pharmacy Owner Dashboard."
                        : "Pharmacy registered with Pending verification status! SMTP email delivery is not configured on this server; you can sign in to access your Pharmacy Owner Dashboard."
                    : emailResult.sent
                        ? "Customer account created! Check your email for a verification link before signing in."
                        : "Customer account created successfully! SMTP email delivery is not configured on this server; you can sign in now."
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "An account with this email address already exists."
            });
        }
        res.status(500).json({
            success: false,
            message: "Registration failed. Please try again."
        });
    }
});

// Shared credential authentication helper (enforces brute-force lockout & MFA)
const authenticateCredentials = async ({ email, password, mfaCode }) => {
    if (
        typeof email !== "string" ||
        !email.trim() ||
        email.length > 254 ||
        typeof password !== "string" ||
        !password ||
        Buffer.byteLength(password, "utf8") > 72
    ) {
        return { status: 400, message: "Valid email and password are required." };
    }

    const user = await User.findOne({
        email: email.trim().toLowerCase()
    }).select("+password +mfaCodeHint +failedLoginAttempts +lockUntil");

    if (!user) {
        return { status: 401, message: "Invalid email or password." };
    }

    if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
        const minsLeft = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
        return {
            status: 423,
            message: `Account temporarily locked due to repeated failed attempts. Try again in ${minsLeft} minute(s).`
        };
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
        const attempts = (user.failedLoginAttempts || 0) + 1;
        user.failedLoginAttempts = attempts;
        if (attempts >= MAX_FAILED_ATTEMPTS) {
            user.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
            user.failedLoginAttempts = 0;
        }
        await user.save();
        return { status: 401, message: "Invalid email or password." };
    }

    if (!user.isActive) {
        return {
            status: 403,
            message: user.suspensionReason
                ? `Account suspended: ${user.suspensionReason}`
                : "This account is currently inactive."
        };
    }

    if (user.mfaEnabled) {
        const expectedCode = user.mfaCodeHint || "";
        if (!mfaCode || typeof mfaCode !== "string") {
            return {
                status: 202,
                mfaRequired: true,
                message: "Multi-factor verification code required."
            };
        }
        if (!expectedCode || mfaCode.trim() !== expectedCode) {
            return {
                status: 401,
                mfaRequired: true,
                message: "Invalid multi-factor verification code."
            };
        }
    }

    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.lastLoginAt = new Date();
    await user.save();

    return { status: 200, user };
};

// Public Login API (verifies backend role matches selected accountType when provided)
router.post("/login", authLimiter, async (req, res) => {
    try {
        const {
            email,
            password,
            accountType,
            mfaCode,
            rememberMe = false
        } = req.body || {};

        if (accountType !== undefined && !["customer", "pharmacy_owner"].includes(accountType)) {
            return res.status(400).json({
                success: false,
                message: "Invalid account type selected."
            });
        }

        const result = await authenticateCredentials({ email, password, mfaCode });

        if (result.status !== 200) {
            return res.status(result.status).json({
                success: false,
                mfaRequired: Boolean(result.mfaRequired),
                message: result.message
            });
        }

        const user = result.user;
        const normalizedUserRole = normalizeRole(user.role);

        // Verify selected account type matches authenticated MongoDB role (no role escalation, no enumeration)
        if (accountType && normalizedUserRole !== accountType) {
            await recordAudit({
                actor: user._id,
                actorRole: normalizedUserRole,
                action: "user.login_role_mismatch",
                domain: "auth",
                targetType: "User",
                targetId: user._id,
                summary: `Login blocked: selected ${accountType} did not match account role`
            });
            return res.status(403).json({
                success: false,
                message: "The selected account type does not match your credentials."
            });
        }

        const persistSession = Boolean(rememberMe);
        const token = signSessionToken(user, persistSession);
        setAuthCookie(res, token, persistSession);

        await recordAudit({
            actor: user._id,
            actorRole: normalizedUserRole,
            action: "user.login",
            domain: "auth",
            targetType: "User",
            targetId: user._id,
            summary: `${normalizedUserRole} signed in (rememberMe=${persistSession})`
        });

        res.status(200).json({
            success: true,
            message: "Sign in successful.",
            user: serializeUser(user)
        });
    } catch {
        res.status(500).json({
            success: false,
            message: "Sign in failed. Please try again."
        });
    }
});

// Protected Administrator Login Flow (validates admin role server-side)
router.post("/admin/login", adminLoginLimiter, async (req, res) => {
    try {
        const { email, password, mfaCode } = req.body || {};
        const result = await authenticateCredentials({ email, password, mfaCode });

        if (result.status !== 200) {
            return res.status(result.status).json({
                success: false,
                mfaRequired: Boolean(result.mfaRequired),
                message: result.message
            });
        }

        const user = result.user;
        if (user.role !== "admin") {
            await recordAudit({
                actor: user._id,
                actorRole: normalizeRole(user.role),
                action: "admin.unauthorized_login_attempt",
                domain: "auth",
                targetType: "User",
                targetId: user._id,
                summary: "Non-admin user attempted administrator login"
            });
            return res.status(403).json({
                success: false,
                message: "Administrator privileges are required for this portal."
            });
        }

        const token = signSessionToken(user, false);
        setAuthCookie(res, token, false);

        await recordAudit({
            actor: user._id,
            actorRole: "admin",
            action: "admin.login",
            domain: "auth",
            targetType: "User",
            targetId: user._id,
            summary: "Administrator signed in via dedicated portal"
        });

        res.status(200).json({
            success: true,
            message: "Administrator authentication successful.",
            user: serializeUser(user)
        });
    } catch {
        res.status(500).json({
            success: false,
            message: "Administrator authentication failed."
        });
    }
});

// Protected User Profile API
router.get("/me", protect, (req, res) => {
    res.set("Cache-Control", "no-store");
    res.status(200).json({
        success: true,
        user: serializeUser(req.user)
    });
});

// Update profile, preferences, language, low-bandwidth mode, DPDP consent
router.patch("/profile", protect, async (req, res) => {
    try {
        const { name, phone, language, lowBandwidthMode, preferences, dpdpConsent } = req.body || {};
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        if (typeof name === "string" && name.trim() && name.trim().length <= 100) {
            user.name = name.trim();
        }
        if (typeof phone === "string" && phone.trim().length <= 20) {
            user.phone = phone.trim();
        }
        if (["en", "hi", "pa"].includes(language)) {
            user.language = language;
        }
        if (typeof lowBandwidthMode === "boolean") {
            user.lowBandwidthMode = lowBandwidthMode;
        }
        if (preferences && typeof preferences === "object") {
            user.preferences = {
                city:
                    typeof preferences.city === "string"
                        ? preferences.city.trim().slice(0, 80)
                        : user.preferences?.city || "Jalandhar",
                accessibilityNeeds:
                    typeof preferences.accessibilityNeeds === "string"
                        ? preferences.accessibilityNeeds.trim().slice(0, 200)
                        : user.preferences?.accessibilityNeeds || ""
            };
        }
        if (dpdpConsent && typeof dpdpConsent === "object") {
            user.dpdpConsent = {
                acceptedAt: user.dpdpConsent?.acceptedAt || new Date(),
                analyticsOptIn:
                    typeof dpdpConsent.analyticsOptIn === "boolean"
                        ? dpdpConsent.analyticsOptIn
                        : Boolean(user.dpdpConsent?.analyticsOptIn),
                notificationsOptIn:
                    typeof dpdpConsent.notificationsOptIn === "boolean"
                        ? dpdpConsent.notificationsOptIn
                        : user.dpdpConsent?.notificationsOptIn !== false
            };
        }

        await user.save();

        await recordAudit({
            req,
            action: "user.profile_updated",
            domain: "auth",
            targetType: "User",
            targetId: user._id,
            summary: "Updated profile or privacy preferences"
        });

        res.status(200).json({
            success: true,
            message: "Profile updated.",
            user: serializeUser(user)
        });
    } catch {
        res.status(500).json({ success: false, message: "Failed to update profile." });
    }
});

// Change password
router.post("/change-password", protect, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body || {};
        if (typeof currentPassword !== "string") {
            return res.status(400).json({ success: false, message: "Current password is required." });
        }
        const passwordErr = validateStrongPassword(newPassword);
        if (passwordErr) {
            return res.status(400).json({ success: false, message: passwordErr });
        }

        const user = await User.findById(req.user._id).select("+password");
        const ok = await bcrypt.compare(currentPassword, user.password);
        if (!ok) {
            return res.status(401).json({
                success: false,
                message: "Current password is incorrect."
            });
        }

        user.password = await bcrypt.hash(newPassword, 12);
        user.sessionVersion = (user.sessionVersion || 1) + 1;
        await user.save();

        const token = signSessionToken(user, false);
        setAuthCookie(res, token, false);

        await recordAudit({
            req,
            action: "user.password_changed",
            domain: "auth",
            targetType: "User",
            targetId: user._id,
            summary: "Password changed and older sessions invalidated"
        });

        res.status(200).json({
            success: true,
            message: "Password updated successfully."
        });
    } catch {
        res.status(500).json({ success: false, message: "Password update failed." });
    }
});

// Toggle MFA
router.post("/mfa/toggle", protect, async (req, res) => {
    try {
        const { enabled } = req.body || {};
        const user = await User.findById(req.user._id).select("+mfaCodeHint");
        const nextEnabled = typeof enabled === "boolean" ? enabled : !user.mfaEnabled;

        let setupCode = null;
        if (nextEnabled) {
            setupCode = String(crypto.randomInt(100000, 999999));
            user.mfaCodeHint = setupCode;
        } else {
            user.mfaCodeHint = "";
        }
        user.mfaEnabled = nextEnabled;
        await user.save();

        await recordAudit({
            req,
            action: nextEnabled ? "user.mfa_enabled" : "user.mfa_disabled",
            domain: "auth",
            targetType: "User",
            targetId: user._id,
            summary: `MFA ${nextEnabled ? "enabled" : "disabled"}`
        });

        res.status(200).json({
            success: true,
            message: nextEnabled
                ? "MFA enabled for your account. Save your verification code."
                : "MFA disabled.",
            mfaEnabled: user.mfaEnabled,
            pilotVerificationCode: setupCode,
            user: serializeUser(user)
        });
    } catch {
        res.status(500).json({ success: false, message: "Failed to toggle MFA." });
    }
});

// Token-Based Email Verification
router.post("/verify-email", authLimiter, async (req, res) => {
    try {
        const { token } = req.body || {};
        if (typeof token !== "string" || token.trim().length < 20) {
            return res.status(400).json({
                success: false,
                message: "A valid email verification token is required."
            });
        }

        const user = await User.findOne({
            emailVerificationTokenHash: hashToken(token.trim()),
            emailVerificationExpiresAt: { $gt: new Date() }
        }).select("+emailVerificationTokenHash +emailVerificationExpiresAt");

        if (!user) {
            return res.status(400).json({
                success: false,
                message: "Verification link is invalid or has expired."
            });
        }

        user.emailVerified = true;
        user.emailVerificationTokenHash = null;
        user.emailVerificationExpiresAt = null;
        await user.save();

        await recordAudit({
            actor: user._id,
            actorRole: normalizeRole(user.role),
            action: "user.email_verified",
            domain: "auth",
            targetType: "User",
            targetId: user._id,
            summary: "Verified email address via token"
        });

        res.status(200).json({
            success: true,
            message: "Your email address has been verified. You can now sign in.",
            user: serializeUser(user)
        });
    } catch {
        res.status(500).json({ success: false, message: "Email verification failed." });
    }
});

// Resend Verification Email
router.post("/resend-verification", recoveryLimiter, async (req, res) => {
    try {
        const { email } = req.body || {};
        const configured = isEmailConfigured();

        if (!configured) {
            return res.status(503).json({
                success: false,
                emailConfigured: false,
                message: "Email delivery service (SMTP) is not configured on this server. Configure SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS in backend/.env."
            });
        }

        if (typeof email === "string" && email.trim()) {
            const user = await User.findOne({ email: email.trim().toLowerCase() });
            if (user && !user.emailVerified) {
                const rawToken = crypto.randomBytes(32).toString("hex");
                user.emailVerificationTokenHash = hashToken(rawToken);
                user.emailVerificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
                await user.save();
                await sendVerificationEmail({ to: user.email, name: user.name, token: rawToken });
            }
        }

        res.status(200).json({
            success: true,
            emailConfigured: true,
            message: "If an unverified account matches that email, a new verification link has been sent."
        });
    } catch {
        res.status(500).json({ success: false, message: "Could not resend verification email." });
    }
});

// Forgot Password / Account Recovery Request
const handleForgotPassword = async (req, res) => {
    try {
        const { email } = req.body || {};
        if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid email address."
            });
        }

        const configured = isEmailConfigured();
        if (!configured) {
            return res.status(503).json({
                success: false,
                emailConfigured: false,
                message: "Password recovery email delivery is not configured on this server. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM in backend/.env to send reset links."
            });
        }

        const user = await User.findOne({ email: email.trim().toLowerCase() });
        if (user && user.isActive) {
            const rawToken = crypto.randomBytes(32).toString("hex");
            user.passwordResetTokenHash = hashToken(rawToken);
            user.passwordResetExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
            await user.save();

            const mailRes = await sendPasswordResetEmail({
                to: user.email,
                name: user.name,
                token: rawToken
            });

            await recordAudit({
                actor: user._id,
                actorRole: normalizeRole(user.role),
                action: "user.recovery_requested",
                domain: "auth",
                targetType: "User",
                targetId: user._id,
                summary: `Password recovery token issued (emailSent=${mailRes.sent})`
            });
        }

        res.status(200).json({
            success: true,
            emailConfigured: true,
            message: "If an account exists for that email address, a password reset link has been sent (valid for 15 minutes)."
        });
    } catch {
        res.status(500).json({ success: false, message: "Recovery request failed." });
    }
};

router.post("/forgot-password", recoveryLimiter, handleForgotPassword);
router.post("/recover", recoveryLimiter, handleForgotPassword);

// Validate Reset Token
router.get("/reset-password/validate", async (req, res) => {
    try {
        const token = typeof req.query.token === "string" ? req.query.token.trim() : "";
        if (!token || token.length < 20) {
            return res.status(400).json({ success: false, valid: false, message: "Invalid reset link." });
        }

        const exists = await User.exists({
            passwordResetTokenHash: hashToken(token),
            passwordResetExpiresAt: { $gt: new Date() }
        });

        if (!exists) {
            return res.status(400).json({
                success: false,
                valid: false,
                message: "This password reset link is invalid or has expired."
            });
        }

        res.status(200).json({ success: true, valid: true });
    } catch {
        res.status(500).json({ success: false, valid: false, message: "Failed to validate reset link." });
    }
});

// Complete Password Reset
router.post("/reset-password", recoveryLimiter, async (req, res) => {
    try {
        const { token, newPassword, confirmPassword } = req.body || {};

        if (typeof token !== "string" || token.trim().length < 20) {
            return res.status(400).json({ success: false, message: "Invalid or missing reset token." });
        }

        const passwordErr = validateStrongPassword(newPassword);
        if (passwordErr) {
            return res.status(400).json({ success: false, message: passwordErr });
        }

        if (confirmPassword !== undefined && newPassword !== confirmPassword) {
            return res.status(400).json({ success: false, message: "Passwords do not match." });
        }

        const user = await User.findOne({
            passwordResetTokenHash: hashToken(token.trim()),
            passwordResetExpiresAt: { $gt: new Date() }
        }).select("+passwordResetTokenHash +passwordResetExpiresAt");

        if (!user) {
            return res.status(400).json({
                success: false,
                message: "This password reset link is invalid or has expired."
            });
        }

        user.password = await bcrypt.hash(newPassword, 12);
        user.passwordResetTokenHash = null;
        user.passwordResetExpiresAt = null;
        user.failedLoginAttempts = 0;
        user.lockUntil = null;
        user.sessionVersion = (user.sessionVersion || 1) + 1;
        await user.save();

        await recordAudit({
            actor: user._id,
            actorRole: normalizeRole(user.role),
            action: "user.password_reset_completed",
            domain: "auth",
            targetType: "User",
            targetId: user._id,
            summary: "Completed password reset and revoked prior sessions"
        });

        res.status(200).json({
            success: true,
            message: "Your password has been reset successfully. Redirecting to sign in..."
        });
    } catch {
        res.status(500).json({ success: false, message: "Password reset failed." });
    }
});

// Revoke all sessions
router.post("/revoke-sessions", protect, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user._id, {
            $inc: { sessionVersion: 1 }
        });
        res.clearCookie(COOKIE_NAME, cookieOptions);
        await recordAudit({
            req,
            action: "user.sessions_revoked",
            domain: "auth",
            targetType: "User",
            targetId: req.user._id,
            summary: "Revoked all active sessions"
        });
        res.status(200).json({
            success: true,
            message: "All active sessions have been revoked."
        });
    } catch {
        res.status(500).json({ success: false, message: "Session revocation failed." });
    }
});

// Logout API
router.post("/logout", (req, res) => {
    res.clearCookie(COOKIE_NAME, cookieOptions);
    res.set("Cache-Control", "no-store");
    res.status(200).json({
        success: true,
        message: "Logout successful."
    });
});

module.exports = router;
