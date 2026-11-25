import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../services/api";
import { StatusBadge, SkeletonCards } from "../components/StatusBadge";

export default function StatusPage() {
    const { sseStatus, isOnline, reconnectSse } = useAuth();
    const [statusData, setStatusData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const loadStatus = useCallback(async (forceRefresh = false) => {
        setLoading(true);
        setError("");
        try {
            const res = await apiRequest(`/status${forceRefresh ? "?refresh=true" : ""}`, {
                cacheKey: "status_page"
            });
            setStatusData(res);
        } catch (err) {
            setStatusData(null);
            setError(err.message || "Service status endpoint unreachable.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadStatus(false);
    }, [loadStatus]);

    const probeBadgeStatus = (status) => {
        if (status === "operational") return "verified";
        if (status === "degraded") return "pending";
        return "failed";
    };

    const services = statusData?.services;

    return (
        <div style={{ display: "grid", gap: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div>
                    <h1 style={{ fontSize: 28 }}>Service Status &amp; Subsystem Health</h1>
                    <p style={{ color: "var(--mw-muted)", fontSize: 14 }}>
                        Live operational telemetry across backend, MongoDB Atlas, external reference APIs, routing, AI, and SSE.
                    </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => { reconnectSse(); loadStatus(true); }}>
                        Run Live Health Check
                    </button>
                </div>
            </div>

            {loading ? (
                <SkeletonCards count={4} />
            ) : error || !statusData ? (
                <div className="alert-box error" role="alert">
                    <div>
                        <strong>Backend Unreachable</strong>
                        <p style={{ marginTop: 4 }}>{error || "Could not fetch /api/status."}</p>
                    </div>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => loadStatus(true)}>
                        Retry
                    </button>
                </div>
            ) : (
                <>
                    <div className="grid-4">
                        <div className="card-compact">
                            <span style={{ fontSize: 12, color: "var(--mw-muted)" }}>Backend &amp; MongoDB Atlas</span>
                            <div style={{ marginTop: 6 }}>
                                <StatusBadge status={probeBadgeStatus(services?.mongoAtlas?.status)} label={services?.mongoAtlas?.state || statusData.serviceStatus} />
                            </div>
                        </div>
                        <div className="card-compact">
                            <span style={{ fontSize: 12, color: "var(--mw-muted)" }}>Measured Atlas Latency</span>
                            <strong style={{ display: "block", fontSize: 24, color: "var(--mw-teal)", marginTop: 4 }}>
                                {statusData.dbLatencyMs !== null ? `${statusData.dbLatencyMs} ms` : "—"}
                            </strong>
                        </div>
                        <div className="card-compact">
                            <span style={{ fontSize: 12, color: "var(--mw-muted)" }}>Real-Time SSE Stream</span>
                            <div style={{ marginTop: 6 }}>
                                <StatusBadge status={isOnline && sseStatus === "connected" ? "active" : "paused_stale"} label={sseStatus} />
                            </div>
                        </div>
                        <div className="card-compact">
                            <span style={{ fontSize: 12, color: "var(--mw-muted)" }}>Measured At</span>
                            <strong style={{ display: "block", fontSize: 14, marginTop: 6 }}>
                                {new Date(statusData.measuredAt).toLocaleTimeString()}
                            </strong>
                        </div>
                    </div>

                    {services && (
                        <section className="card">
                            <h2 style={{ fontSize: 20, marginBottom: 12 }}>Subsystem Live Probes</h2>
                            <div className="table-wrap">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Subsystem</th>
                                            <th>Status</th>
                                            <th>Details</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td><strong>Backend Express Server</strong></td>
                                            <td><StatusBadge status={probeBadgeStatus(services.backendServer?.status)} label={services.backendServer?.status} /></td>
                                            <td>API server listening and serving requests</td>
                                        </tr>
                                        <tr>
                                            <td><strong>MongoDB Atlas Cluster</strong></td>
                                            <td><StatusBadge status={probeBadgeStatus(services.mongoAtlas?.status)} label={services.mongoAtlas?.state} /></td>
                                            <td>Latency: {services.mongoAtlas?.latencyMs ?? "N/A"} ms</td>
                                        </tr>
                                        <tr>
                                            <td><strong>OpenFDA Drug NDC Reference API</strong></td>
                                            <td><StatusBadge status={probeBadgeStatus(services.medicineReferenceApi?.openFda?.status)} label={services.medicineReferenceApi?.openFda?.status} /></td>
                                            <td>Latency: {services.medicineReferenceApi?.openFda?.latencyMs} ms</td>
                                        </tr>
                                        <tr>
                                            <td><strong>NIH ClinicalTables RxTerms API</strong></td>
                                            <td><StatusBadge status={probeBadgeStatus(services.medicineReferenceApi?.nihRxTerms?.status)} label={services.medicineReferenceApi?.nihRxTerms?.status} /></td>
                                            <td>Latency: {services.medicineReferenceApi?.nihRxTerms?.latencyMs} ms</td>
                                        </tr>
                                        <tr>
                                            <td><strong>OpenStreetMap OSRM Routing API</strong></td>
                                            <td><StatusBadge status={probeBadgeStatus(services.routingService?.status)} label={services.routingService?.status} /></td>
                                            <td>Latency: {services.routingService?.latencyMs} ms</td>
                                        </tr>
                                        <tr>
                                            <td><strong>Pharmacy Directory Service</strong></td>
                                            <td><StatusBadge status={probeBadgeStatus(services.pharmacyDataService?.status)} label={services.pharmacyDataService?.status} /></td>
                                            <td>{services.pharmacyDataService?.recordsCount?.toLocaleString()} directory records</td>
                                        </tr>
                                        <tr>
                                            <td><strong>Care AI Grounded Retrieval Service</strong></td>
                                            <td><StatusBadge status={probeBadgeStatus(services.aiService?.status)} label={services.aiService?.status} /></td>
                                            <td>{services.aiService?.reviewedDocsCount} reviewed policy &amp; guide docs</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}

                    <section className="card">
                        <h2 style={{ fontSize: 20, marginBottom: 12 }}>Feature Flags &amp; Regulatory Controls</h2>
                        <div className="table-wrap">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Feature</th>
                                        <th>Stage</th>
                                        <th>State</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(statusData.flagsList || []).map((f) => (
                                        <tr key={f.key}>
                                            <td><strong>{f.label}</strong></td>
                                            <td>{f.rolloutStage}</td>
                                            <td><StatusBadge status={f.enabled ? "verified" : "rejected"} label={f.enabled ? "Enabled" : "Disabled"} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="card">
                        <h2 style={{ fontSize: 20, marginBottom: 12 }}>Authorized Source Ingestion Freshness</h2>
                        <div className="table-wrap">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Source</th>
                                        <th>Status</th>
                                        <th>Flagged Records</th>
                                        <th>Last Synced</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(statusData.sources || []).map((s) => (
                                        <tr key={s._id}>
                                            <td><strong>{s.sourceName}</strong></td>
                                            <td><StatusBadge status={s.status} /></td>
                                            <td>{s.recordsFlagged}</td>
                                            <td>{new Date(s.lastSyncedAt).toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}
