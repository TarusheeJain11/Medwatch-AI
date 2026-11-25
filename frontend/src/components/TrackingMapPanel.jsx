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
                Preparing live route tracking session...
            </div>
        );
    }

    const waypoints = tracking.routeWaypoints || [];
    const currentIdx = Math.min(tracking.waypointIndex || 0, Math.max(0, waypoints.length - 1));
    const stopped = ["completed", "cancelled", "expired"].includes(tracking.status);

    const points = waypoints.map((wp, idx) => {
        const x = waypoints.length > 1 ? 36 + (idx / (waypoints.length - 1)) * 328 : 200;
        const y = idx % 2 === 0 ? 105 : 50;
        return { ...wp, x, y };
    });

    const activePoint = points[currentIdx] || { x: 36, y: 105, label: "Checkpoint" };

    return (
        <div className="card-compact" style={{ background: "#F9FCFC" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                <div>
                    <h4 style={{ fontSize: 16 }}>Live Delivery Route Tracker</h4>
                    <p style={{ fontSize: 13, color: "var(--mw-muted)" }}>
                        Updated: {tracking.lastUpdatedAt ? new Date(tracking.lastUpdatedAt).toLocaleTimeString() : "Just now"} · ETA: <strong>{tracking.etaRangeText}</strong>
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
                <svg viewBox="0 0 400 150" width="100%" height="145" role="img" aria-label="Live delivery route map">
                    <rect x="0" y="0" width="400" height="150" rx="8" fill="#F2F9F9" />
                    {points.length > 1 && (
                        <polyline
                            fill="none"
                            stroke="#C2DCE0"
                            strokeWidth="4"
                            strokeDasharray="6 4"
                            points={points.map((p) => `${p.x},${p.y}`).join(" ")}
                        />
                    )}
                    {points.length > 1 && currentIdx > 0 && (
                        <polyline
                            fill="none"
                            stroke="#087E80"
                            strokeWidth="4"
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
                            <text x={p.x} y={p.y + 20} textAnchor="middle" fontSize="9" fill="#15364A" fontWeight="600">
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
                            strokeWidth="2"
                            strokeOpacity="0.45"
                        />
                    )}
                </svg>
                <p style={{ fontSize: 13, color: "var(--mw-navy)", marginTop: 6 }}>
                    Current Location: <strong>{tracking.currentCoords?.label}</strong>
                </p>
                {!stopped && (
                    <p style={{ fontSize: 12, color: "var(--mw-muted)", marginTop: 2 }}>
                        Updates stream automatically every few seconds — no refresh needed.
                    </p>
                )}
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
