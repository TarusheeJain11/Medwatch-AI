const AuditEvent = require("../models/AuditEvent");

const SENSITIVE_KEYS = new Set([
    "password",
    "token",
    "secret",
    "authorization",
    "cookie",
    "mfacode",
    "resettoken",
    "exactaddress",
    "homeaddress"
]);

const redactMetadata = (value) => {
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(redactMetadata);

    const out = {};
    for (const [k, v] of Object.entries(value)) {
        if (SENSITIVE_KEYS.has(k.toLowerCase())) {
            out[k] = "[REDACTED]";
        } else if (typeof v === "object" && v !== null) {
            out[k] = redactMetadata(v);
        } else {
            out[k] = v;
        }
    }
    return out;
};

const recordAudit = async ({
    req = null,
    actor = null,
    actorRole = null,
    action,
    domain = "system",
    targetType = "",
    targetId = "",
    summary,
    metadata = {}
}) => {
    try {
        const resolvedActor = actor || req?.user?._id || null;
        const resolvedRole = actorRole || req?.user?.role || "guest";
        await AuditEvent.create({
            actor: resolvedActor,
            actorRole: resolvedRole,
            action,
            domain,
            targetType,
            targetId: targetId ? String(targetId) : "",
            summary,
            metadata: redactMetadata(metadata)
        });
    } catch (err) {
        console.error("Audit log write failed:", err.message);
    }
};

module.exports = { recordAudit, redactMetadata };
