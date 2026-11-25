const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const FeatureFlag = require("../models/FeatureFlag");
const SourceRecord = require("../models/SourceRecord");
const KnowledgeDoc = require("../models/KnowledgeDoc");
const Pharmacy = require("../models/Pharmacy");
const { optionalAuth } = require("../middleware/authMiddleware");
const eventBus = require("../services/eventBus");
const {
    geocodeAddress,
    reverseGeocode,
    fetchLiveWeatherAdvisory
} = require("../services/liveDataService");

const DB_STATES = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting"
};

let cachedExternalProbes = null;
let cachedProbesAt = 0;

const probeUrl = async (url, timeoutMs = 3500) => {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal });
        return {
            status: res.ok ? "operational" : "degraded",
            httpStatus: res.status,
            latencyMs: Date.now() - started
        };
    } catch (err) {
        return {
            status: "unavailable",
            error: err?.name === "AbortError" ? "timeout" : "unreachable",
            latencyMs: Date.now() - started
        };
    } finally {
        clearTimeout(timer);
    }
};

const getExternalProbes = async (forceRefresh = false) => {
    if (!forceRefresh && cachedExternalProbes && Date.now() - cachedProbesAt < 30000) {
        return cachedExternalProbes;
    }
    const [openFda, openFdaLabel, openFdaRecalls, nihRxTerms, osrmRouting, nominatimGeo] = await Promise.all([
        probeUrl("https://api.fda.gov/drug/ndc.json?limit=1"),
        probeUrl("https://api.fda.gov/drug/label.json?limit=1"),
        probeUrl("https://api.fda.gov/drug/enforcement.json?limit=1"),
        probeUrl("https://clinicaltables.nlm.nih.gov/api/rxterms/v3/search?terms=vitamin&maxList=1"),
        probeUrl("https://router.project-osrm.org/route/v1/driving/75.5762,31.3260;75.5912,31.3370?overview=false"),
        probeUrl("https://nominatim.openstreetmap.org/reverse?format=json&lat=31.3260&lon=75.5762")
    ]);
    cachedExternalProbes = { openFda, openFdaLabel, openFdaRecalls, nihRxTerms, osrmRouting, nominatimGeo };
    cachedProbesAt = Date.now();
    return cachedExternalProbes;
};

// Health Check
router.get("/health", (req, res) => {
    const stateCode = mongoose.connection.readyState;
    const dbReady = stateCode === 1;
    res.status(dbReady ? 200 : 503).json({
        success: dbReady,
        status: dbReady ? "healthy" : "degraded",
        backend: "up",
        dbState: DB_STATES[stateCode] || "unknown",
        timestamp: new Date().toISOString()
    });
});

// Public Service Status Dashboard, Subsystem Probes & Feature Flags
router.get("/status", async (req, res) => {
    const dbReady = mongoose.connection.readyState === 1;
    const forceRefresh = req.query.refresh === "true";

    try {
        const started = Date.now();
        let flags = [];
        let sources = [];
        let pharmacyCount = 0;
        let knowledgeCount = 0;

        if (dbReady) {
            [flags, sources, pharmacyCount, knowledgeCount] = await Promise.all([
                FeatureFlag.find().select("key label enabled rolloutStage").lean(),
                SourceRecord.find().select("sourceName status lastSyncedAt recordsFlagged").lean(),
                Pharmacy.countDocuments(),
                KnowledgeDoc.countDocuments({ isReviewed: true })
            ]);
        }
        const dbLatencyMs = dbReady ? Date.now() - started : null;

        // Avoid external network calls during unit tests unless explicitly requested
        const external =
            process.env.NODE_ENV === "test" && !forceRefresh
                ? {
                    openFda: { status: "skipped_in_test", latencyMs: 0 },
                    nihRxTerms: { status: "skipped_in_test", latencyMs: 0 },
                    osrmRouting: { status: "skipped_in_test", latencyMs: 0 }
                }
                : await getExternalProbes(forceRefresh);

        const flagMap = {};
        for (const f of flags) flagMap[f.key] = f.enabled;

        const streamStats = eventBus.getStats();

        res.status(dbReady ? 200 : 503).json({
            success: dbReady,
            serviceStatus: dbReady ? "operational" : "degraded",
            environment: "India-First Pilot (Educational & Sandbox Commerce)",
            dbLatencyMs,
            stream: streamStats,
            services: {
                backendServer: { status: "operational" },
                mongoAtlas: {
                    status: dbReady ? "operational" : "unavailable",
                    state: DB_STATES[mongoose.connection.readyState] || "unknown",
                    latencyMs: dbLatencyMs
                },
                medicineReferenceApi: {
                    openFda: external.openFda,
                    openFdaLabel: external.openFdaLabel,
                    openFdaRecalls: external.openFdaRecalls,
                    nihRxTerms: external.nihRxTerms
                },
                pharmacyDataService: {
                    status: dbReady ? "operational" : "unavailable",
                    recordsCount: pharmacyCount
                },
                aiService: {
                    status: dbReady ? "operational" : "degraded",
                    reviewedDocsCount: knowledgeCount
                },
                realtimeSse: {
                    status: "operational",
                    connectedClients: streamStats.connectedClients
                },
                routingService: external.osrmRouting,
                geocodingService: external.nominatimGeo
            },
            featureFlags: flagMap,
            flagsList: flags,
            sources,
            measuredAt: new Date().toISOString()
        });
    } catch {
        res.status(503).json({
            success: false,
            serviceStatus: "degraded",
            dbState: DB_STATES[mongoose.connection.readyState] || "unknown"
        });
    }
});

// Server-Sent Events (SSE) Live Update Stream
router.get("/events/stream", optionalAuth, (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const client = eventBus.addClient({
        res,
        userId: req.user?._id || null,
        role: req.user?.role || "guest"
    });

    const snapshot = eventBus.getSnapshotForClient({
        userId: req.user?._id || null,
        role: req.user?.role || "guest"
    });

    res.write(
        `event: connected\ndata: ${JSON.stringify({
            version: "1.0",
            connectedAt: new Date().toISOString(),
            recentEvents: snapshot
        })}\n\n`
    );

    const heartbeat = setInterval(() => {
        try {
            res.write(`event: heartbeat\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
        } catch {
            clearInterval(heartbeat);
            eventBus.removeClient(client);
        }
    }, 25000);

    req.on("close", () => {
        clearInterval(heartbeat);
        eventBus.removeClient(client);
    });
});

// Live OpenStreetMap Nominatim Address Search
router.get("/location/search", async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!q || q.length < 2) {
        return res.status(400).json({ success: false, message: "Enter at least 2 characters to search address." });
    }
    const results = await geocodeAddress(q);
    res.status(200).json({ success: true, count: results.length, data: results });
});

// Live OpenStreetMap Nominatim Reverse Geocode
router.get("/location/reverse", async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ success: false, message: "Valid latitude and longitude are required." });
    }
    const location = await reverseGeocode(lat, lng);
    res.status(200).json({ success: Boolean(location), data: location });
});

// Live Open-Meteo City Weather & Cold-Chain Pharmacy Advisory
router.get("/live-weather", async (req, res) => {
    const lat = Number(req.query.lat) || 31.3260;
    const lng = Number(req.query.lng) || 75.5762;
    const city = typeof req.query.city === "string" && req.query.city.trim() ? req.query.city.trim() : "Jalandhar";
    const advisory = await fetchLiveWeatherAdvisory(lat, lng, city);
    res.status(200).json({ success: Boolean(advisory), data: advisory });
});

// REST Snapshot on Reconnect
router.get("/events/snapshot", optionalAuth, (req, res) => {
    const events = eventBus.getSnapshotForClient({
        userId: req.user?._id || null,
        role: req.user?.role || "guest"
    });
    res.status(200).json({ success: true, events });
});

// OpenAPI 3.0 Specification
router.get("/docs/openapi.json", (req, res) => {
    res.status(200).json({
        openapi: "3.0.3",
        info: {
            title: "MedWatch AI Pilot API",
            version: "2.0.0",
            description:
                "Healthcare information catalog, verified partner directory, non-medical demo orders, simulated live tracking, RAG assistant, and governance APIs."
        },
        paths: {
            "/api/health": { get: { summary: "Service and MongoDB health check" } },
            "/api/status": { get: { summary: "Subsystem health probes, feature flags, and data source freshness" } },
            "/api/auth/register": { post: { summary: "Register customer or pharmacy partner account" } },
            "/api/auth/login": { post: { summary: "Authenticate with HttpOnly cookie & optional MFA" } },
            "/api/auth/me": { get: { summary: "Get current authenticated user profile" } },
            "/api/auth/profile": { patch: { summary: "Update language, low-bandwidth mode, preferences, DPDP consent" } },
            "/api/medicines": { get: { summary: "Browse and fuzzy-search educational catalog" } },
            "/api/medicines/autocomplete": { get: { summary: "Spelling-tolerant and bilingual autocomplete" } },
            "/api/medicines/live-lookup": { get: { summary: "Live OpenFDA Drug NDC and NIH RxTerms lookup" } },
            "/api/pharmacies": { get: { summary: "Public verified service directory" } },
            "/api/pharmacies/my": { get: { summary: "Tenant-isolated partner pharmacy operations" } },
            "/api/prices/compare/{medicineId}": { get: { summary: "Compare pharmacy simulated prices & batch metadata" } },
            "/api/orders": { post: { summary: "Create idempotent fictional non-medical demo order" } },
            "/api/orders/{id}/transition": { patch: { summary: "Role-validated order lifecycle transition" } },
            "/api/tracking/{orderId}": { get: { summary: "Authorized simulated live tracking snapshot" } },
            "/api/events/stream": { get: { summary: "SSE real-time order, tracking, and system events" } },
            "/api/ai/ask": { post: { summary: "Citation-grounded RAG assistant with clinical abstention" } },
            "/api/support": { post: { summary: "Submit support ticket, catalog correction, or feedback" } },
            "/api/privacy/export": { get: { summary: "DPDP Act 2023 personal data JSON export" } },
            "/api/admin/overview": { get: { summary: "Admin KPIs, analytics, and governance overview" } }
        }
    });
});

module.exports = router;
