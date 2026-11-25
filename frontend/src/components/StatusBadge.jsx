const LABELS = {
    verified: "Verified",
    pending: "Pending",
    under_review: "Under Review",
    rejected: "Rejected",
    demo: "Demo Record",
    draft: "Draft",
    submitted: "Submitted",
    accepted: "Accepted",
    preparing: "Preparing",
    dispatched: "Dispatched",
    delivered: "Delivered",
    cancelled: "Cancelled",
    failed: "Failed",
    delayed: "Delayed",
    rescheduled: "Rescheduled",
    returned: "Returned",
    active: "Live (Synthetic)",
    paused_stale: "Stale / Offline",
    completed: "Completed",
    expired: "Expired",
    synced: "Synced",
    dead_letter: "Dead Letter",
    open: "Open",
    in_review: "In Review",
    resolved: "Resolved",
    dismissed: "Dismissed"
};

export function StatusBadge({ status, label }) {
    const key = String(status || "neutral").toLowerCase();
    return (
        <span className={`status-badge ${key}`}>
            {label || LABELS[key] || status}
        </span>
    );
}

export function SkeletonCards({ count = 4 }) {
    return (
        <div className="catalog-grid" aria-busy="true" aria-label="Loading content">
            {Array.from({ length: count }).map((_, i) => (
                <div className="card-compact" key={i}>
                    <div className="skeleton" style={{ height: 18, width: "45%", marginBottom: 12 }} />
                    <div className="skeleton" style={{ height: 24, width: "80%", marginBottom: 8 }} />
                    <div className="skeleton" style={{ height: 16, width: "60%", marginBottom: 20 }} />
                    <div className="skeleton" style={{ height: 38, width: "100%" }} />
                </div>
            ))}
        </div>
    );
}
