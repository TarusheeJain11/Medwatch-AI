const jwt = require("jsonwebtoken");
const User = require("../models/User");

const COOKIE_NAME = "medwatch_token";

// Normalize legacy internal "pharmacy" role to "pharmacy_owner"
const normalizeRole = (role) => (role === "pharmacy" ? "pharmacy_owner" : role);
const isPharmacyOwnerRole = (role) => role === "pharmacy_owner" || role === "pharmacy";

const extractToken = (req) => {
    if (req.cookies?.[COOKIE_NAME]) {
        return req.cookies[COOKIE_NAME];
    }
    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith("Bearer ")
    ) {
        return req.headers.authorization.split(" ")[1];
    }
    return null;
};

const verifyUserFromToken = async (token) => {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ["HS256"]
    });

    if (
        typeof decoded.userId !== "string" ||
        !/^[a-fA-F0-9]{24}$/.test(decoded.userId)
    ) {
        throw new Error("Invalid token payload");
    }

    const user = await User.findById(decoded.userId).select("-password");
    if (!user || !user.isActive) {
        return null;
    }

    if (
        typeof decoded.sessionVersion === "number" &&
        decoded.sessionVersion !== (user.sessionVersion || 1)
    ) {
        return null;
    }

    return user;
};

// Strict Authentication Middleware
const protect = async (req, res, next) => {
    const token = extractToken(req);

    if (!token) {
        return res.status(401).json({
            success: false,
            message: "Access denied. No token provided."
        });
    }

    try {
        const user = await verifyUserFromToken(token);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Session expired, revoked, or account inactive."
            });
        }
        req.user = user;
        next();
    } catch (error) {
        const isJwtError =
            error.name === "JsonWebTokenError" ||
            error.name === "TokenExpiredError" ||
            error.message === "Invalid token payload";
        return res.status(isJwtError ? 401 : 500).json({
            success: false,
            message: isJwtError
                ? "Invalid or expired token."
                : "Authentication failed."
        });
    }
};

// Optional Authentication Middleware (attaches req.user if signed in)
const optionalAuth = async (req, res, next) => {
    const token = extractToken(req);
    if (!token) {
        req.user = null;
        return next();
    }
    try {
        req.user = await verifyUserFromToken(token);
    } catch {
        req.user = null;
    }
    next();
};

// Role-Based Authorization (maps legacy "pharmacy" seamlessly to "pharmacy_owner")
const authorize = (...roles) => {
    const normalizedAllowed = roles.map(normalizeRole);
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        if (!normalizedAllowed.includes(normalizeRole(req.user.role))) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized for this action."
            });
        }

        next();
    };
};

const requireVerifiedPharmacy = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: "Authentication required."
        });
    }

    if (!isPharmacyOwnerRole(req.user.role) || !req.user.isVerified) {
        return res.status(403).json({
            success: false,
            message: "Verified pharmacy account required."
        });
    }

    next();
};

module.exports = {
    COOKIE_NAME,
    normalizeRole,
    isPharmacyOwnerRole,
    protect,
    optionalAuth,
    authorize,
    requireVerifiedPharmacy
};
