const dns = require("dns");
const mongoose = require("mongoose");

let reconnecting = false;
let resolvedSeedUriCache = null;

// Build a standard mongodb:// replica-set seedlist URI if system SRV lookup fails
// (handles macOS link-local IPv6 DNS fe80::...%en0 where Node c-ares returns EBADRESP/ETIMEOUT)
const resolveSrvFallbackUri = async (srvUri) => {
    if (resolvedSeedUriCache) return resolvedSeedUriCache;
    if (!srvUri || !srvUri.startsWith("mongodb+srv://")) return srvUri;

    const parsed = new URL(srvUri);
    const resolver = new dns.promises.Resolver();
    resolver.setServers(["1.1.1.1", "8.8.8.8"]);

    const srvRecords = await resolver.resolveSrv(`_mongodb._tcp.${parsed.hostname}`);
    if (!srvRecords || srvRecords.length === 0) {
        throw new Error("No SRV records resolved via fallback DNS");
    }

    let txtParams = "authSource=admin";
    try {
        const txtRecords = await resolver.resolveTxt(parsed.hostname);
        const joined = txtRecords.flat().join("&");
        if (joined) txtParams = joined;
    } catch {
        // default authSource=admin
    }

    const hosts = srvRecords.map((r) => `${r.name}:${r.port}`).join(",");
    const existingQuery = parsed.search ? parsed.search.replace(/^\?/, "") : "";
    const mergedQuery = [existingQuery, "ssl=true", txtParams].filter(Boolean).join("&");
    const authPart = parsed.username
        ? `${parsed.username}:${parsed.password}@`
        : "";

    resolvedSeedUriCache = `mongodb://${authPart}${hosts}${parsed.pathname || "/"}?${mergedQuery}`;
    return resolvedSeedUriCache;
};

const connectWithRetry = async () => {
    if (reconnecting || mongoose.connection.readyState === 1) return;
    if (!process.env.MONGO_URI) {
        throw new Error("MONGO_URI environment variable is missing.");
    }

    reconnecting = true;
    try {
        try {
            await mongoose.connect(process.env.MONGO_URI, {
                serverSelectionTimeoutMS: 8000,
                heartbeatFrequencyMS: 10000
            });
            console.log("MongoDB Connected Successfully!");
        } catch (primaryErr) {
            const msg = primaryErr?.message || "";
            if (
                msg.includes("querySrv") ||
                msg.includes("EBADRESP") ||
                msg.includes("ETIMEOUT") ||
                msg.includes("ECONNREFUSED")
            ) {
                console.warn("Primary SRV lookup failed, resolving Atlas seedlist via public DNS fallback...");
                const fallbackUri = await resolveSrvFallbackUri(process.env.MONGO_URI);
                await mongoose.connect(fallbackUri, {
                    serverSelectionTimeoutMS: 12000,
                    heartbeatFrequencyMS: 10000
                });
                console.log("MongoDB Connected Successfully (DNS fallback seedlist)!");
            } else {
                throw primaryErr;
            }
        }
    } catch (error) {
        console.error("MongoDB Connection Failed:", error.message);
        throw error;
    } finally {
        reconnecting = false;
    }
};

let listenersAttached = false;
let retryAttempt = 0;
let retryTimer = null;

const scheduleReconnect = (onConnected) => {
    if (process.env.NODE_ENV === "test" || retryTimer || mongoose.connection.readyState === 1) {
        return;
    }
    const delayMs = Math.min(30000, 3000 * Math.pow(2, retryAttempt));
    retryAttempt = Math.min(retryAttempt + 1, 4);
    retryTimer = setTimeout(async () => {
        retryTimer = null;
        try {
            await connectWithRetry();
            retryAttempt = 0;
            if (typeof onConnected === "function") {
                await onConnected();
            }
        } catch {
            scheduleReconnect(onConnected);
        }
    }, delayMs);
};

const connectDB = async ({ allowDeferred = false, onConnected = null } = {}) => {
    if (process.env.MONGO_DNS_SERVERS) {
        const servers = process.env.MONGO_DNS_SERVERS.split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        if (servers.length > 0) {
            dns.setServers(servers);
        }
    }

    if (!listenersAttached) {
        listenersAttached = true;
        mongoose.connection.on("connected", () => {
            retryAttempt = 0;
            if (retryTimer) {
                clearTimeout(retryTimer);
                retryTimer = null;
            }
        });
        mongoose.connection.on("disconnected", () => {
            if (process.env.NODE_ENV !== "test") {
                console.warn("MongoDB disconnected; scheduling exponential-backoff reconnect...");
                scheduleReconnect(onConnected);
            }
        });
        mongoose.connection.on("error", (err) => {
            if (process.env.NODE_ENV !== "test") {
                console.error("MongoDB connection error:", err.message);
            }
        });
    }

    try {
        await connectWithRetry();
        if (typeof onConnected === "function") {
            await onConnected();
        }
    } catch (err) {
        if (!allowDeferred) throw err;
        console.warn("Server starting in degraded mode while retrying MongoDB connection...");
        scheduleReconnect(onConnected);
    }
};

module.exports = connectDB;
