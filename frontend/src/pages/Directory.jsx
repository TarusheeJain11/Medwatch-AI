import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../services/api";
import { StatusBadge, SkeletonCards } from "../components/StatusBadge";

export default function Directory() {
    const { setPreferredPharmacyId } = useAuth();
    const navigate = useNavigate();

    const [pharmacies, setPharmacies] = useState([]);
    const [cities, setCities] = useState(["Jalandhar", "Chandigarh", "Ludhiana", "Amritsar", "New Delhi", "Mumbai", "Bengaluru"]);
    const [city, setCity] = useState("all");
    const [q, setQ] = useState("");
    const [verifiedOnly, setVerifiedOnly] = useState(false);
    const [accessibilityFilter, setAccessibilityFilter] = useState("");
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const loadDirectory = useCallback(async (pageVal = page) => {
        setLoading(true);
        setError("");
        try {
            const params = new URLSearchParams();
            if (city !== "all") params.set("city", city);
            if (verifiedOnly) params.set("verifiedOnly", "true");
            if (accessibilityFilter.trim()) params.set("accessibility", accessibilityFilter.trim());
            if (q.trim()) params.set("q", q.trim());
            params.set("page", String(pageVal));
            params.set("limit", "24");

            const res = await apiRequest(`/pharmacies?${params.toString()}`, {
                cacheKey: `dir_${city}_${verifiedOnly}_${pageVal}`
            });
            setPharmacies(res.data || []);
            setTotal(res.total || (res.data || []).length);
            setTotalPages(res.totalPages || 1);
            if (Array.isArray(res.cities) && res.cities.length > 0) {
                setCities(res.cities);
            }
        } catch (err) {
            setError(err.message || "Failed to load directory.");
        } finally {
            setLoading(false);
        }
    }, [city, verifiedOnly, accessibilityFilter, q, page]);

    useEffect(() => {
        loadDirectory(page);
    }, [city, verifiedOnly, page]);

    const handleFilterSubmit = (e) => {
        e.preventDefault();
        setPage(1);
        loadDirectory(1);
    };

    const orderFromPharmacy = (pharmacyId) => {
        setPreferredPharmacyId(pharmacyId);
        navigate("/orders#checkout");
    };

    return (
        <div>
            <div style={{ marginBottom: 20 }}>
                <h1 style={{ fontSize: 28 }}>Verified Pharmacy Directory</h1>
                <p style={{ color: "var(--mw-muted)", fontSize: 14 }}>
                    Showing {pharmacies.length} of <strong>{total.toLocaleString()}</strong> pharmacies across India. Filter by city, 24-hour availability, or wheelchair accessibility.
                </p>
            </div>

            <form onSubmit={handleFilterSubmit} className="card-compact" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 20 }}>
                <input
                    type="text"
                    aria-label="Search pharmacy by name or area"
                    placeholder="Search pharmacy name or sector..."
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    style={{ flex: "1 1 200px", minWidth: 0, padding: "9px 12px", border: "1px solid #C6D8DA", borderRadius: 8 }}
                />

                <select aria-label="Filter by city" value={city} onChange={(e) => { setCity(e.target.value); setPage(1); }} style={{ padding: "9px 12px", border: "1px solid #C6D8DA", borderRadius: 8 }}>
                    <option value="all">All Cities ({cities.length})</option>
                    {cities.map((c) => (
                        <option key={c} value={c}>{c}</option>
                    ))}
                </select>

                <input
                    type="text"
                    aria-label="Filter by accessibility feature"
                    placeholder="Accessibility (e.g. wheelchair, 24x7)..."
                    value={accessibilityFilter}
                    onChange={(e) => setAccessibilityFilter(e.target.value)}
                    style={{ flex: "1 1 180px", minWidth: 0, padding: "9px 12px", border: "1px solid #C6D8DA", borderRadius: 8 }}
                />

                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600 }}>
                    <input type="checkbox" checked={verifiedOnly} onChange={(e) => { setVerifiedOnly(e.target.checked); setPage(1); }} />
                    Verified Only
                </label>

                <button type="submit" className="btn btn-primary btn-sm">Apply</button>
            </form>

            {error && <div className="alert-box error">{error}</div>}

            {loading ? (
                <SkeletonCards count={4} />
            ) : pharmacies.length === 0 ? (
                <div className="card" style={{ textAlign: "center", padding: 32 }}>
                    <p>No pharmacies match your filters.</p>
                </div>
            ) : (
                <>
                    <div className="grid-2">
                        {pharmacies.map((p) => (
                            <article key={p._id} className="card-compact" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 10 }}>
                                <div style={{ display: "grid", gap: 6 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                                        <h2 style={{ fontSize: 18 }}>{p.name}</h2>
                                        <StatusBadge status={p.isVerified ? "verified" : "pending"} label={p.isVerified ? "Verified" : "Pending Review"} />
                                    </div>
                                    <p style={{ fontSize: 13, color: "var(--mw-muted)" }}>
                                        {p.address}, {p.city}
                                    </p>
                                    <div style={{ fontSize: 13 }}>
                                        <strong>Hours:</strong> {p.openingHours || "08:00 AM - 10:00 PM"}
                                    </div>
                                    <div style={{ fontSize: 13 }}>
                                        <strong>Phone:</strong> {p.phone || "Directory Support"}
                                    </div>
                                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                                        {(p.accessibilityFeatures || []).map((feat, idx) => (
                                            <span key={idx} className="status-badge neutral">{feat}</span>
                                        ))}
                                    </div>
                                </div>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => orderFromPharmacy(p._id)}>
                                    Order Care Kits From This Pharmacy →
                                </button>
                            </article>
                        ))}
                    </div>

                    {totalPages > 1 && (
                        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 24 }}>
                            <button type="button" className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                                ← Previous
                            </button>
                            <span style={{ fontSize: 14, fontWeight: 600 }}>
                                Page {page} of {totalPages} ({total.toLocaleString()} pharmacies)
                            </span>
                            <button type="button" className="btn btn-outline btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                                Next →
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
