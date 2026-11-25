import { StatusBadge } from "./StatusBadge";

export default function TrackingMapPanel({
    tracking,
    isStale,
    onStep,
    onToggleStale,
    stepping = false
}) {
    if (!tracking) {
        return (
            <div className="alert-box info">
                Preparing live OSRM road route tracking session...
            </div>
        );
    }

    const waypoints = tracking.routeWaypoints || [];
    const rawGeo = Array.isArray(tracking.routeGeometry) && tracking.routeGeometry.length > 1
        ? tracking.routeGeometry
        : waypoints;
    const currentIdx = Math.min(tracking.waypointIndex || 0, Math.max(0, waypoints.length - 1));
    const stopped = ["completed", "cancelled", "expired"].includes(tracking.status);

    // Project real OSRM lat/lng coordinates cleanly onto the SVG canvas
    const allCoords = [...rawGeo, ...waypoints].filter((c) => Number.isFinite(c?.lat) && Number.isFinite(c?.lng));
    const lats = allCoords.map((c) => c.lat);
    const lngs = allCoords.map((c) => c.lng);
    const minLat = lats.length ? Math.min(...lats) : 31.32;
    const maxLat = lats.length ? Math.max(...lats) : 31.34;
    const minLng = lngs.length ? Math.min(...lngs) : 75.57;
    const maxLng = lngs.length ? Math.max(...lngs) : 75.59;
    const latSpan = Math.max(0.002, maxLat - minLat);
    const lngSpan = Math.max(0.002, maxLng - minLng);

    const project = (c, fallbackIdx = 0, totalCount = 1) => {
        if (Number.isFinite(c?.lat) && Number.isFinite(c?.lng) && allCoords.length > 1) {
            const x = 36 + ((c.lng - minLng) / lngSpan) * 328;
            const y = 132 - ((c.lat - minLat) / latSpan) * 96;
            return { x: Math.round(x), y: Math.round(y) };
        }
        return {
            x: totalCount > 1 ? 36 + (fallbackIdx / (totalCount - 1)) * 328 : 200,
            y: fallbackIdx % 2 === 0 ? 105 : 50
        };
    };

    const geoPoints = rawGeo.map((c, idx) => project(c, idx, rawGeo.length));
    const points = waypoints.map((wp, idx) => ({
        ...wp,
        ...project(wp, idx, waypoints.length)
    }));

    const activePoint = points[currentIdx] || { x: 36, y: 105, label: "Checkpoint" };

    return (
        <div className="card-compact" style={{ background: "#F9FCFC" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                <div>
                    <h4 style={{ fontSize: 16 }}>Live Delivery Route Tracker</h4>
                    <p style={{ fontSize: 13, color: "var(--mw-muted)" }}>
                        {tracking.routingProvider || "OpenStreetMap OSRM"} · {tracking.distanceKm ? `${tracking.distanceKm} km · ` : ""}
                        ETA: <strong>{tracking.etaRangeText}</strong>
                    </p>
                </div>
                <StatusBadge status={isStale ? "paused_stale" : tracking.status} label={stopped ? "Delivered" : isStale ? "Signal Paused" : "Live Updates On"} />
            </div>

            {(isStale || tracking.delayNotice) && (
                <div className="alert-box warning" role="status">
                    <div>
                        <strong>{isStale ? "Courier Signal Paused" : "Delivery Update"}</strong>
                        <p style={{ marginTop: 2 }}>
                            {tracking.delayNotice || "Showing last confirmed checkpoint."}
                        </p>
                    </div>
                </div>
            )}

            <div style={{ background: "#fff", border: "1px solid var(--mw-border)", borderRadius: 12, padding: 12, marginBottom: 12 }}>
                <svg viewBox="0 0 400 165" width="100%" height="160" role="img" aria-label="Live delivery route map">
                    <rect x="0" y="0" width="400" height="165" rx="8" fill="#EFF7F7" />
                    {/* Subtle map grid */}
                    <path d="M0 40 H400 M0 82 H400 M0 124 H400 M80 0 V165 M160 0 V165 M240 0 V165 M320 0 V165" stroke="#DDECEE" strokeWidth="1" />
                    {geoPoints.length > 1 && (
                        <polyline
                            fill="none"
                            stroke="#B8D8DC"
                            strokeWidth="4.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeDasharray="6 4"
                            points={geoPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                        />
                    )}
                    {points.length > 1 && currentIdx > 0 && (
                        <polyline
                            fill="none"
                            stroke="#087E80"
                            strokeWidth="4.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            points={points.slice(0, currentIdx + 1).map((p) => `${p.x},${p.y}`).join(" ")}
                        />
                    )}
                    {points.map((p, i) => (
                        <g key={i}>
                            <circle
                                cx={p.x}
                                cy={p.y}
                                r={i === currentIdx ? 8 : 5}
                                fill={i <= currentIdx ? "#087E80" : "#CBD5E1"}
                                stroke="#fff"
                                strokeWidth="2"
                            />
                            <text x={p.x} y={Math.min(156, p.y + 18)} textAnchor="middle" fontSize="9" fill="#15364A" fontWeight="700">
                                {i === 0 ? "Pharmacy" : i === points.length - 1 ? "Drop" : `Pt ${i + 1}`}
                            </text>
                        </g>
                    ))}
                    {!stopped && (
                        <circle
                            cx={activePoint.x}
                            cy={activePoint.y}
                            r="14"
                            fill="none"
                            stroke={isStale ? "#B45309" : "#087E80"}
                            strokeWidth="2.2"
                            strokeOpacity="0.55"
                        />
                    )}
                </svg>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                    <p style={{ fontSize: 13, color: "var(--mw-navy)" }}>
                        Current Location: <strong>{tracking.currentCoords?.label}</strong>
                    </p>
                    <small style={{ fontSize: 11, color: "var(--mw-muted)" }}>
                        Coords: {Number(tracking.currentCoords?.lat || 0).toFixed(4)}, {Number(tracking.currentCoords?.lng || 0).toFixed(4)} · Updated{" "}
                        {tracking.lastUpdatedAt ? new Date(tracking.lastUpdatedAt).toLocaleTimeString() : "Just now"}
                    </small>
                </div>
            </div>

            <ol style={{ paddingLeft: 18, fontSize: 13, marginBottom: 12, display: "grid", gap: 4 }}>
                {waypoints.map((wp, idx) => (
                    <li key={idx} style={{ color: idx <= currentIdx ? "var(--mw-navy)" : "var(--mw-muted)", fontWeight: idx === currentIdx ? 700 : 400 }}>
                        {wp.label} {idx < currentIdx ? "✓" : idx === currentIdx ? "● Current" : `(Est. ${wp.etaMinutes}m)`}
                    </li>
                ))}
            </ol>

            {!stopped && (onStep || onToggleStale) && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {onStep && (
                        <button type="button" className="btn btn-outline btn-sm" onClick={onStep} disabled={stepping}>
                            {stepping ? "Updating..." : "Advance Checkpoint Now"}
                        </button>
                    )}
                    {onToggleStale && (
                        <button type="button" className="btn btn-outline btn-sm" onClick={onToggleStale} disabled={stepping}>
                            {tracking.status === "paused_stale" ? "Resume Live Signal" : "Pause / Test Offline State"}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
