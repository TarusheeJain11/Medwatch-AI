import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../services/api";
import { StatusBadge, SkeletonCards } from "../components/StatusBadge";
import SmartImage from "../components/SmartImage";

const haversineKm = (lat1, lng1, lat2, lng2) => {
    const toRad = (d) => (d * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return Number((2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1));
};

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

    const [userCoords, setUserCoords] = useState(null);
    const [userAreaLabel, setUserAreaLabel] = useState("");
    const [mapPharmacy, setMapPharmacy] = useState(null);

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

    const detectGpsLocation = () => {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                setUserCoords({ lat, lng });
                try {
                    const geo = await apiRequest(`/location/reverse?lat=${lat}&lng=${lng}`);
                    if (geo?.data?.city || geo?.data?.locality) {
                        setUserAreaLabel(`${geo.data.locality || ""}, ${geo.data.city || ""}`.replace(/^,\s*/, ""));
                    }
                } catch {
                    setUserAreaLabel("Current GPS Location");
                }
            },
            () => {
                setUserCoords({ lat: 31.3260, lng: 75.5762 });
                setUserAreaLabel("Jalandhar Central (Fallback)");
            }
        );
    };

    const sortedPharmacies = useMemo(() => {
        const list = pharmacies.map((p) => ({
            ...p,
            distanceKm: userCoords && p.lat && p.lng ? haversineKm(userCoords.lat, userCoords.lng, p.lat, p.lng) : null
        }));
        if (userCoords) {
            list.sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
        }
        return list;
    }, [pharmacies, userCoords]);

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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
                <div>
                    <h1 style={{ fontSize: 28 }}>Verified Pharmacy Directory</h1>
                    <p style={{ color: "var(--mw-muted)", fontSize: 14 }}>
                        Showing {pharmacies.length} of <strong>{total.toLocaleString()}</strong> pharmacies across India. Filter by city, accessibility, 24×7 availability, or GPS distance.
                    </p>
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={detectGpsLocation}>
                    {userCoords ? `Near: ${userAreaLabel || "GPS Active"}` : "Sort by My GPS Location"}
                </button>
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

            {mapPharmacy && (
                <section className="card" style={{ marginBottom: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <div>
                            <h2 style={{ fontSize: 18 }}>Live OpenStreetMap Location: {mapPharmacy.name}</h2>
                            <small style={{ color: "var(--mw-muted)" }}>
                                {mapPharmacy.address}, {mapPharmacy.city} ({Number(mapPharmacy.lat || 31.326).toFixed(4)}, {Number(mapPharmacy.lng || 75.576).toFixed(4)})
                            </small>
                        </div>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setMapPharmacy(null)}>Close Map ✕</button>
                    </div>
                    <iframe
                        title={`Map for ${mapPharmacy.name}`}
                        width="100%"
                        height="260"
                        style={{ border: "1px solid var(--mw-border)", borderRadius: 12 }}
                        src={`https://www.openstreetmap.org/export/embed.html?bbox=${(mapPharmacy.lng || 75.576) - 0.015}%2C${(mapPharmacy.lat || 31.326) - 0.01}%2C${(mapPharmacy.lng || 75.576) + 0.015}%2C${(mapPharmacy.lat || 31.326) + 0.01}&layer=mapnik&marker=${mapPharmacy.lat || 31.326}%2C${mapPharmacy.lng || 75.576}`}
                    />
                </section>
            )}

            {loading ? (
                <SkeletonCards count={4} />
            ) : sortedPharmacies.length === 0 ? (
                <div className="card" style={{ textAlign: "center", padding: 32 }}>
                    <p>No pharmacies match your filters.</p>
                </div>
            ) : (
                <>
                    <div className="grid-2">
                        {sortedPharmacies.map((p) => (
                            <article key={p._id} className="card-compact" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 10 }}>
                                <div style={{ display: "grid", gap: 6 }}>
                                    <SmartImage
                                        src={p.imageUrl}
                                        fallbackSrc="/images/pharmacy-verified.svg"
                                        alt={p.name}
                                        height={110}
                                        style={{ marginBottom: 4 }}
                                    />
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                        <h2 style={{ fontSize: 18 }}>{p.name}</h2>
                                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                            {p.distanceKm !== null && (
                                                <span className="status-badge neutral">{p.distanceKm} km away</span>
                                            )}
                                            <StatusBadge status={p.isVerified ? "verified" : "pending"} label={p.isVerified ? "Verified" : "Pending Review"} />
                                        </div>
                                    </div>
                                    <p style={{ fontSize: 13, color: "var(--mw-muted)" }}>
                                        {p.address}, {p.city}{p.state ? `, ${p.state}` : ""}
                                    </p>
                                    <div style={{ fontSize: 13 }}>
                                        <strong>Hours:</strong> {p.openingHours || "08:00 AM - 10:00 PM"} · <strong>ETA:</strong> {p.deliveryEtaText || "20–30 mins"}
                                    </div>
                                    <div style={{ fontSize: 13 }}>
                                        <strong>Phone:</strong> {p.phone || "Directory Support"} · <strong>License:</strong> {p.licenseNumber || "Verified Registry"}
                                    </div>
                                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                                        {(p.accessibilityFeatures || []).map((feat, idx) => (
                                            <span key={idx} className="status-badge neutral">{feat}</span>
                                        ))}
                                        {(p.servicesOffered || []).map((srv, idx) => (
                                            <span key={`srv-${idx}`} className="status-badge verified">{srv}</span>
                                        ))}
                                    </div>
                                </div>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    <button type="button" className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => orderFromPharmacy(p._id)}>
                                        Order Care Kits →
                                    </button>
                                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setMapPharmacy(p)}>
                                        View Map
                                    </button>
                                </div>
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
