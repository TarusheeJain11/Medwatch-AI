const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
require("dotenv").config();

const connectDB = require("./db");
const { bootstrapDatabase } = require("./services/seedBootstrap");

const medicineRoutes = require("./routes/medicineRoutes");
const pharmacyRoutes = require("./routes/pharmacyRoutes");
const priceRoutes = require("./routes/priceRoutes");
const authRoutes = require("./routes/authRoutes");
const orderRoutes = require("./routes/orderRoutes");
const trackingRoutes = require("./routes/trackingRoutes");
const supportRoutes = require("./routes/supportRoutes");
const aiRoutes = require("./routes/aiRoutes");
const adminRoutes = require("./routes/adminRoutes");
const privacyRoutes = require("./routes/privacyRoutes");
const systemRoutes = require("./routes/systemRoutes");
const paymentRoutes = require("./routes/paymentRoutes");

const createApp = () => {
    const app = express();

    const defaultOrigins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173"
    ];
    const envOrigins = (process.env.FRONTEND_URL || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

    // Security Headers (OWASP ASVS baseline)
    app.use((req, res, next) => {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("X-Frame-Options", "DENY");
        res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
        res.setHeader("Permissions-Policy", "geolocation=(self), microphone=(self)");
        next();
    });

    // Exact CORS Allowlist
    app.use(
        cors({
            origin: (origin, callback) => {
                if (!origin || allowedOrigins.includes(origin)) {
                    callback(null, true);
                } else {
                    callback(new Error("CORS origin not allowed"));
                }
            },
            credentials: true
        })
    );

    app.use(express.json({ limit: "1mb" }));
    app.use(cookieParser());

    // CSRF Origin Defense for cookie-authenticated unsafe methods
    app.use((req, res, next) => {
        const safeMethods = ["GET", "HEAD", "OPTIONS"];
        if (!safeMethods.includes(req.method)) {
            const origin = req.get("origin");
            if (origin && !allowedOrigins.includes(origin)) {
                return res.status(403).json({
                    success: false,
                    message: "Request origin not allowed."
                });
            }
        }
        next();
    });

    // Structured Request Logger (no credentials/secrets logged)
    app.use((req, res, next) => {
        const started = Date.now();
        res.on("finish", () => {
            if (process.env.NODE_ENV !== "test") {
                console.log(
                    JSON.stringify({
                        method: req.method,
                        path: req.originalUrl,
                        status: res.statusCode,
                        durationMs: Date.now() - started
                    })
                );
            }
        });
        next();
    });

    // Fast DB-readiness guard so disconnected DB returns clean JSON 503 instead of hanging
    const requireDb = (req, res, next) => {
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({
                success: false,
                code: "DB_UNAVAILABLE",
                message: "Database connection is temporarily unavailable. Reconnecting..."
            });
        }
        next();
    };

    // System & Health Routes (work even if DB is temporarily reconnecting)
    app.use("/api", systemRoutes);

    // Domain API Routes
    app.use("/api/medicines", requireDb, medicineRoutes);
    app.use("/api/pharmacies", requireDb, pharmacyRoutes);
    app.use("/api/prices", requireDb, priceRoutes);
    app.use("/api/auth", requireDb, authRoutes);
    app.use("/api/orders", requireDb, orderRoutes);
    app.use("/api/tracking", requireDb, trackingRoutes);
    app.use("/api/support", requireDb, supportRoutes);
    app.use("/api/ai", requireDb, aiRoutes);
    app.use("/api/admin", requireDb, adminRoutes);
    app.use("/api/privacy", requireDb, privacyRoutes);
    app.use("/api/payments", requireDb, paymentRoutes);

    app.get("/", (req, res) => {
        res.send("MedWatch AI Backend is Running!");
    });

    // Structured Error Handler
    app.use((err, req, res, next) => {
        if (err.message === "CORS origin not allowed") {
            return res.status(403).json({ success: false, message: "CORS origin not allowed." });
        }
        res.status(500).json({ success: false, message: "Internal server error." });
    });

    return app;
};

let bootstrapped = false;

const startServer = async () => {
    try {
        if (!process.env.JWT_SECRET) {
            throw new Error("JWT_SECRET is missing in backend/.env");
        }
        if (!process.env.MONGO_URI) {
            throw new Error("MONGO_URI is missing in backend/.env");
        }

        const port = Number(process.env.PORT || 5000);
        const app = createApp();

        // Bind port immediately so Vite proxy never returns 502 while MongoDB connects/reconnects
        app.listen(port, () => {
            console.log(`MedWatch AI Server running on port ${port}`);
        });

        await connectDB({
            allowDeferred: true,
            onConnected: async () => {
                if (!bootstrapped) {
                    bootstrapped = true;
                    await bootstrapDatabase();
                }
            }
        });
    } catch (error) {
        console.error("Server startup failed:", error.message);
        process.exit(1);
    }
};

process.on("unhandledRejection", (err) => {
    console.error("Unhandled Promise Rejection:", err?.message || err);
});

process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err?.message || err);
});

if (require.main === module) {
    startServer();
}

module.exports = { createApp };
