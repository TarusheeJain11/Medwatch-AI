import { useEffect, useState, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../services/api";
import { StatusBadge, SkeletonCards } from "../components/StatusBadge";
import SmartImage from "../components/SmartImage";

export default function Catalog() {
    const { isAuthenticated, isAdmin, user, setUser } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [q, setQ] = useState(searchParams.get("q") || "");
    const [category, setCategory] = useState(searchParams.get("category") || "all");
    const [sort, setSort] = useState("default");
    const [page, setPage] = useState(1);

    const [medicines, setMedicines] = useState([]);
    const [categories, setCategories] = useState([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [suggestion, setSuggestion] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [fromCache, setFromCache] = useState(false);

    const [liveData, setLiveData] = useState(null);
    const [liveLoading, setLiveLoading] = useState(false);
    const [liveRecalls, setLiveRecalls] = useState(null);

    const [selectedMed, setSelectedMed] = useState(null);
    const [monograph, setMonograph] = useState(null);
    const [monographTab, setMonographTab] = useState("overview");
    const [prices, setPrices] = useState([]);
    const [pricesLoading, setPricesLoading] = useState(false);

    const [correctionMed, setCorrectionMed] = useState(null);
    const [correctionText, setCorrectionText] = useState("");
    const [correctionStatus, setCorrectionStatus] = useState("");
    const [toast, setToast] = useState("");

    const savedSet = new Set((user?.savedMedicines || []).map((id) => String(id)));

    const fetchCatalog = useCallback(async (queryVal, catVal, sortVal, pageVal) => {
        setLoading(true);
        setError("");
        try {
            const params = new URLSearchParams();
            if (queryVal.trim()) params.set("q", queryVal.trim());
            if (catVal && catVal !== "all") params.set("category", catVal);
            if (sortVal !== "default") params.set("sort", sortVal);
            params.set("page", String(pageVal));
            params.set("limit", "24");

            const res = await apiRequest(`/medicines?${params.toString()}`, {
                cacheKey: `catalog_${catVal}_${sortVal}_${pageVal}_${queryVal.trim() || "all"}`
            });
            setMedicines(res.data || []);
            setTotal(res.total || (res.data || []).length);
            setTotalPages(res.totalPages || 1);
            if (Array.isArray(res.categories) && res.categories.length > 0) {
                setCategories(res.categories);
            }
            setSuggestion(res.suggestion || null);
            setFromCache(Boolean(res._fromOfflineCache));
        } catch (err) {
            setError(err.message || "Failed to load medicines.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCatalog(q, category, sort, page);
    }, [category, sort, page, fetchCatalog]);

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        setPage(1);
        setSearchParams(q.trim() ? { q: q.trim() } : {});
        fetchCatalog(q, category, sort, 1);
    };

    const runLiveLookup = async () => {
        const term = q.trim() || "Paracetamol";
        setLiveLoading(true);
        try {
            const res = await apiRequest(`/medicines/live-lookup?q=${encodeURIComponent(term)}`);
            setLiveData(res);
        } catch (err) {
            setError(err.message || "Live OpenFDA / NIH lookup unavailable.");
        } finally {
            setLiveLoading(false);
        }
    };

    const loadRecallsFeed = async () => {
        try {
            const res = await apiRequest(`/medicines/recalls/live?q=${encodeURIComponent(q.trim())}&limit=6`);
            setLiveRecalls(res.data || []);
        } catch (err) {
            setError(err.message || "Could not fetch live FDA recalls.");
        }
    };

    const inspectMedicine = async (med) => {
        setSelectedMed(med);
        setMonograph(null);
        setMonographTab("overview");
        setPricesLoading(true);
        setPrices([]);

        const [priceRes, monoRes] = await Promise.allSettled([
            apiRequest(`/prices/compare/${med._id}`, { cacheKey: `compare_${med._id}` }),
            apiRequest(`/medicines/${med._id}/monograph`)
        ]);

        if (priceRes.status === "fulfilled") {
            setPrices(priceRes.value.data || []);
        }
        if (monoRes.status === "fulfilled") {
            setMonograph(monoRes.value.liveMonograph || null);
            if (monoRes.value.medicine) setSelectedMed(monoRes.value.medicine);
        }
        setPricesLoading(false);
    };

    const toggleSaveMedicine = async (medId) => {
        if (!isAuthenticated) {
            setToast("Sign in to bookmark medicines to your Health List.");
            return;
        }
        try {
            const res = await apiRequest(`/auth/saved-medicines/${medId}`, { method: "POST" });
            if (res.user) setUser(res.user);
            setToast(res.saved ? "Saved to your Health List!" : "Removed from your Health List.");
            setTimeout(() => setToast(""), 2500);
        } catch (err) {
            setToast(err.message);
        }
    };

    const importFdaItem = async (item) => {
        try {
            const res = await apiRequest("/medicines/import-live", { method: "POST", body: item });
            setToast(res.message);
            fetchCatalog(q, category, sort, page);
        } catch (err) {
            setToast(err.message);
        }
    };

    const submitCorrection = async (e) => {
        e.preventDefault();
        setCorrectionStatus("");
        try {
            const res = await apiRequest("/support", {
                method: "POST",
                body: {
                    type: "correction",
                    relatedMedicine: correctionMed._id,
                    subject: `Catalog correction for ${correctionMed.name}`,
                    description: correctionText,
                    proposedCorrection: correctionText
                }
            });
            setCorrectionStatus(res.message || "Correction submitted!");
            setCorrectionText("");
        } catch (err) {
            setCorrectionStatus(err.message || "Failed to submit correction.");
        }
    };

    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
                <div>
                    <h1 style={{ fontSize: 28 }}>Medicines, Live Monographs &amp; Price Comparison</h1>
                    <p style={{ color: "var(--mw-muted)", fontSize: 14 }}>
                        Showing {medicines.length} of <strong>{total.toLocaleString()}</strong> OpenFDA &amp; curated medicines. Click any medicine for real-time FDA labels, NIH RxNav classes, chemical structures, and pharmacy prices.
                    </p>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={runLiveLookup} disabled={liveLoading}>
                        {liveLoading ? "Querying Live APIs..." : "Live OpenFDA & NIH Lookup"}
                    </button>
                    <button type="button" className="btn btn-outline btn-sm" onClick={loadRecallsFeed}>
                        Live FDA Recalls
                    </button>
                    <Link to="/help" className="btn btn-outline btn-sm">Ask Care AI</Link>
                </div>
            </div>

            {toast && <div className="alert-box info">{toast}</div>}

            {fromCache && (
                <div className="alert-box warning">
                    Showing saved offline catalog snapshot. Reconnect for live pricing.
                </div>
            )}

            <form onSubmit={handleSearchSubmit} className="card-compact" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 20 }}>
                <input
                    type="text"
                    aria-label="Search medicines"
                    placeholder="Search medicine, generic name, manufacturer, or symptom..."
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    style={{ flex: "1 1 240px", minWidth: 0, padding: "10px 12px", border: "1px solid #C6D8DA", borderRadius: 8 }}
                />
                <select
                    aria-label="Filter by category"
                    value={category}
                    onChange={(e) => { setCategory(e.target.value); setPage(1); }}
                    style={{ padding: "10px 12px", border: "1px solid #C6D8DA", borderRadius: 8, maxWidth: 220 }}
                >
                    <option value="all">All Categories</option>
                    {categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                    ))}
                </select>
                <select
                    aria-label="Sort catalog"
                    value={sort}
                    onChange={(e) => { setSort(e.target.value); setPage(1); }}
                    style={{ padding: "10px 12px", border: "1px solid #C6D8DA", borderRadius: 8 }}
                >
                    <option value="default">Newest / Featured</option>
                    <option value="low">MRP: Low to High</option>
                    <option value="high">MRP: High to Low</option>
                    <option value="name">Name: A to Z</option>
                </select>
                <button type="submit" className="btn btn-primary btn-sm">Search</button>
                {(q || category !== "all") && (
                    <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => {
                            setQ("");
                            setCategory("all");
                            setPage(1);
                            setSearchParams({});
                            fetchCatalog("", "all", sort, 1);
                        }}
                    >
                        Reset
                    </button>
                )}
            </form>

            {liveRecalls && (
                <section className="card" style={{ marginBottom: 20, background: "#FFFBEB", borderColor: "#FDE68A" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <h2 style={{ fontSize: 18 }}>Live OpenFDA Drug Recall &amp; Enforcement Feed</h2>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setLiveRecalls(null)}>Close ✕</button>
                    </div>
                    {liveRecalls.length === 0 ? (
                        <p style={{ fontSize: 13 }}>No recent FDA recall records matched that filter.</p>
                    ) : (
                        <div className="grid-3">
                            {liveRecalls.map((rec, i) => (
                                <div key={rec.recallNumber || i} className="card-compact" style={{ background: "#fff" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                                        <StatusBadge status="pending" label={rec.classification} />
                                        <small>{rec.reportDate}</small>
                                    </div>
                                    <strong style={{ fontSize: 13 }}>{rec.recallingFirm}</strong>
                                    <p style={{ fontSize: 12, marginTop: 4 }}>{rec.productDescription}</p>
                                    <p style={{ fontSize: 11, color: "var(--mw-amber)", marginTop: 4 }}>{rec.reasonForRecall}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            )}

            {liveData && (
                <section className="card" style={{ marginBottom: 20, background: "#F4FAFA" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <div>
                            <h2 style={{ fontSize: 18 }}>Live External Lookup for "{liveData.query}"</h2>
                            <small style={{ color: "var(--mw-muted)" }}>
                                Fetched live at {new Date(liveData.fetchedAt).toLocaleTimeString()} from OpenFDA NDC &amp; NIH ClinicalTables RxTerms
                            </small>
                        </div>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setLiveData(null)}>Close ✕</button>
                    </div>
                    <div className="grid-2">
                        <div className="card-compact">
                            <strong style={{ fontSize: 14 }}>OpenFDA Live Results ({liveData.fdaCount})</strong>
                            {liveData.fdaResults.length === 0 ? (
                                <p style={{ fontSize: 13, color: "var(--mw-muted)", marginTop: 6 }}>No direct OpenFDA brand match found.</p>
                            ) : (
                                <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                                    {liveData.fdaResults.map((r, i) => (
                                        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 13, borderBottom: "1px solid #EEF4F5", paddingBottom: 6 }}>
                                            <div>
                                                <strong>{r.name}</strong> ({r.genericName})
                                                <div style={{ fontSize: 11, color: "var(--mw-muted)" }}>{r.manufacturer} · {r.dosage}</div>
                                            </div>
                                            {isAdmin && (
                                                <button type="button" className="btn btn-outline btn-sm" onClick={() => importFdaItem(r)}>
                                                    + Import
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="card-compact">
                            <strong style={{ fontSize: 14 }}>NIH RxTerms Live Results ({liveData.nihCount})</strong>
                            {liveData.nihResults.length === 0 ? (
                                <p style={{ fontSize: 13, color: "var(--mw-muted)", marginTop: 6 }}>No NIH RxTerms match found.</p>
                            ) : (
                                <ul style={{ paddingLeft: 18, fontSize: 13, marginTop: 6, display: "grid", gap: 4 }}>
                                    {liveData.nihResults.map((r, i) => (
                                        <li key={i}><strong>{r.name}</strong> {r.strengths?.length ? `— ${r.strengths.join(", ")}` : ""}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </section>
            )}

            {suggestion && (
                <div className="alert-box info">
                    Showing spelling-tolerant matches. Did you mean <strong>{suggestion}</strong>?
                </div>
            )}

            {error && (
                <div className="alert-box error" role="alert">
                    <span>{error}</span>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => fetchCatalog(q, category, sort, page)}>
                        Retry
                    </button>
                </div>
            )}

            {loading ? (
                <SkeletonCards count={6} />
            ) : medicines.length === 0 ? (
                <div className="card" style={{ textAlign: "center", padding: 40 }}>
                    <h3>No matching medicines found</h3>
                    <p style={{ color: "var(--mw-muted)", margin: "8px 0 16px" }}>
                        Try another spelling or click "Live OpenFDA &amp; NIH Lookup" above.
                    </p>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setQ(""); setCategory("all"); setPage(1); fetchCatalog("", "all", "default", 1); }}>
                        Show All Medicines
                    </button>
                </div>
            ) : (
                <>
                    <div className="catalog-grid">
                        {medicines.map((med) => {
                            const isSaved = savedSet.has(String(med._id));
                            return (
                                <article key={med._id} className="card-compact" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 10 }}>
                                    <div>
                                        <SmartImage
                                            src={med.imageUrl}
                                            fallbackSrc="/images/meds/tablet.svg"
                                            alt={med.name}
                                            height={120}
                                            style={{ marginBottom: 10 }}
                                        />
                                        <div style={{ display: "flex", justifyContent: "space-between", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                                            <span className="status-badge neutral">{med.category}</span>
                                            <StatusBadge status={med.editorialStatus || "verified"} label={med.prescriptionStatus || (med.sourceCitation?.includes("OpenFDA") ? "OpenFDA" : "Verified")} />
                                        </div>
                                        <h2 style={{ fontSize: 17, marginBottom: 4 }}>{med.name}</h2>
                                        <p style={{ fontSize: 13, color: "var(--mw-muted)" }}>
                                            Generic: <strong>{med.genericName || "N/A"}</strong> · {med.dosage || "Standard"}
                                        </p>
                                        <p style={{ fontSize: 12, color: "var(--mw-muted)", marginTop: 4 }}>
                                            Mfr: {med.manufacturer || "N/A"} · {med.packSize || "Standard Pack"}
                                        </p>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 21, fontWeight: 800, color: "var(--mw-teal)", marginBottom: 8 }}>
                                            ₹{med.mrp} <small style={{ fontSize: 12, fontWeight: 500, color: "var(--mw-muted)" }}>Reference MRP</small>
                                        </div>
                                        <div style={{ display: "flex", gap: 6 }}>
                                            <button type="button" className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => inspectMedicine(med)}>
                                                Details &amp; Prices
                                            </button>
                                            <button type="button" className="btn btn-outline btn-sm" onClick={() => toggleSaveMedicine(med._id)} title="Bookmark medicine">
                                                {isSaved ? "★" : "☆"}
                                            </button>
                                            <button type="button" className="btn btn-outline btn-sm" onClick={() => { setCorrectionMed(med); setCorrectionStatus(""); }}>
                                                Flag
                                            </button>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>

                    {totalPages > 1 && (
                        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 24 }}>
                            <button type="button" className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                                ← Previous
                            </button>
                            <span style={{ fontSize: 14, fontWeight: 600 }}>
                                Page {page} of {totalPages} ({total.toLocaleString()} records)
                            </span>
                            <button type="button" className="btn btn-outline btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                                Next →
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* Medicine Live Monograph & Price Comparison Drawer */}
            {selectedMed && (
                <section className="card" style={{ marginTop: 28 }} aria-live="polite">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
                        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                            <SmartImage
                                src={monograph?.wiki?.thumbnailUrl || selectedMed.imageUrl}
                                fallbackSrc="/images/meds/tablet.svg"
                                alt={selectedMed.name}
                                height={92}
                                style={{ width: 120 }}
                            />
                            <div>
                                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                                    <StatusBadge status="verified" label={selectedMed.prescriptionStatus || "Source Attributed"} />
                                    <span className="status-badge neutral">{selectedMed.category}</span>
                                    {monograph?.rxNav?.rxcui && (
                                        <span className="status-badge neutral">RxCUI: {monograph.rxNav.rxcui}</span>
                                    )}
                                </div>
                                <h2 style={{ fontSize: 22 }}>{selectedMed.name}</h2>
                                <p style={{ color: "var(--mw-muted)", fontSize: 14 }}>
                                    Generic: {selectedMed.genericName} · Manufacturer: {selectedMed.manufacturer} · {selectedMed.dosage} · HSN {selectedMed.hsnCode || "3004"}
                                </p>
                            </div>
                        </div>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setSelectedMed(null)}>
                            Close ✕
                        </button>
                    </div>

                    <div className="pill-tabs">
                        {[
                            { id: "overview", label: "Overview & Live Monograph" },
                            { id: "safety", label: "Warnings, Side Effects & Interactions" },
                            { id: "prices", label: `Pharmacy Prices (${prices.length})` }
                        ].map((tb) => (
                            <button
                                key={tb.id}
                                type="button"
                                className={`pill-tab ${monographTab === tb.id ? "active" : ""}`}
                                onClick={() => setMonographTab(tb.id)}
                            >
                                {tb.label}
                            </button>
                        ))}
                    </div>

                    {monographTab === "overview" && (
                        <div className="grid-2" style={{ alignItems: "start" }}>
                            <div className="card-compact" style={{ background: "var(--mw-bg)", display: "grid", gap: 10 }}>
                                <div>
                                    <strong style={{ fontSize: 13 }}>Catalog &amp; Provenance</strong>
                                    <p style={{ fontSize: 13, marginTop: 4 }}>{selectedMed.description}</p>
                                    {selectedMed.activeIngredients && (
                                        <p style={{ fontSize: 12, color: "var(--mw-muted)", marginTop: 4 }}>
                                            <strong>Active Ingredients:</strong> {selectedMed.activeIngredients}
                                        </p>
                                    )}
                                </div>

                                {monograph?.fdaLabel?.indicationsAndUsage && (
                                    <div>
                                        <strong style={{ fontSize: 13 }}>Live OpenFDA Indications &amp; Usage</strong>
                                        <p style={{ fontSize: 12, color: "var(--mw-navy)", marginTop: 4 }}>{monograph.fdaLabel.indicationsAndUsage}</p>
                                    </div>
                                )}

                                {monograph?.wiki?.extract && (
                                    <div>
                                        <strong style={{ fontSize: 13 }}>Encyclopedic Reference ({monograph.wiki.title})</strong>
                                        <p style={{ fontSize: 12, color: "var(--mw-muted)", marginTop: 4 }}>{monograph.wiki.extract}</p>
                                    </div>
                                )}

                                <p style={{ fontSize: 11, color: "var(--mw-muted)" }}>
                                    Source: {selectedMed.sourceCitation} · Verified{" "}
                                    {new Date(selectedMed.sourceLastVerifiedAt || selectedMed.updatedAt).toLocaleDateString()}
                                </p>
                            </div>

                            <div style={{ display: "grid", gap: 12 }}>
                                {(monograph?.structureImageUrl || selectedMed.structureImageUrl) && (
                                    <div className="card-compact" style={{ textAlign: "center" }}>
                                        <strong style={{ fontSize: 13, display: "block", marginBottom: 8 }}>
                                            PubChem 2D Molecular Structure
                                        </strong>
                                        <SmartImage
                                            src={monograph?.structureImageUrl || selectedMed.structureImageUrl}
                                            fallbackSrc="/images/meds/capsule.svg"
                                            alt={`${selectedMed.genericName || selectedMed.name} molecular structure`}
                                            height={160}
                                            fit="contain"
                                        />
                                    </div>
                                )}

                                {monograph?.rxNav?.therapeuticClasses?.length > 0 && (
                                    <div className="card-compact">
                                        <strong style={{ fontSize: 13, display: "block", marginBottom: 6 }}>NIH RxNav Therapeutic Classes</strong>
                                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                            {monograph.rxNav.therapeuticClasses.map((cls) => (
                                                <span key={cls} className="status-badge neutral">{cls}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {monographTab === "safety" && (
                        <div className="grid-2" style={{ alignItems: "start" }}>
                            <div className="card-compact" style={{ background: "var(--mw-amber-bg)", borderColor: "var(--mw-amber-border)", display: "grid", gap: 10 }}>
                                <div>
                                    <strong style={{ fontSize: 13, color: "var(--mw-amber)" }}>FDA Warnings &amp; Precautions</strong>
                                    <p style={{ fontSize: 13, color: "var(--mw-amber)", marginTop: 4 }}>
                                        {monograph?.fdaLabel?.warnings || selectedMed.warnings || "Educational information only. Consult a licensed doctor or pharmacist before use."}
                                    </p>
                                </div>
                                {monograph?.fdaLabel?.contraindications && (
                                    <div>
                                        <strong style={{ fontSize: 13, color: "var(--mw-amber)" }}>Contraindications</strong>
                                        <p style={{ fontSize: 12, color: "var(--mw-amber)", marginTop: 4 }}>{monograph.fdaLabel.contraindications}</p>
                                    </div>
                                )}
                                {monograph?.fdaLabel?.pregnancyOrBreastfeeding && (
                                    <div>
                                        <strong style={{ fontSize: 13, color: "var(--mw-amber)" }}>Pregnancy &amp; Breastfeeding</strong>
                                        <p style={{ fontSize: 12, color: "var(--mw-amber)", marginTop: 4 }}>{monograph.fdaLabel.pregnancyOrBreastfeeding}</p>
                                    </div>
                                )}
                            </div>

                            <div className="card-compact" style={{ display: "grid", gap: 10 }}>
                                <div>
                                    <strong style={{ fontSize: 13 }}>Adverse Reactions / Side Effects (OpenFDA)</strong>
                                    <p style={{ fontSize: 12, color: "var(--mw-muted)", marginTop: 4 }}>
                                        {monograph?.fdaLabel?.adverseReactions || "No adverse reaction extract returned for this label; refer to official package insert."}
                                    </p>
                                </div>
                                <div>
                                    <strong style={{ fontSize: 13 }}>Drug Interactions</strong>
                                    <p style={{ fontSize: 12, color: "var(--mw-muted)", marginTop: 4 }}>
                                        {monograph?.fdaLabel?.drugInteractions || "Always check with a licensed pharmacist before combining medications."}
                                    </p>
                                </div>
                                <div>
                                    <strong style={{ fontSize: 13 }}>Storage &amp; Handling</strong>
                                    <p style={{ fontSize: 12, color: "var(--mw-muted)", marginTop: 4 }}>
                                        {monograph?.fdaLabel?.storageAndHandling || selectedMed.storageInfo}
                                    </p>
                                </div>
                                {monograph?.recalls?.length > 0 && (
                                    <div className="alert-box warning" style={{ marginBottom: 0 }}>
                                        <div>
                                            <strong>Related Live FDA Recall Notice ({monograph.recalls[0].classification}):</strong>{" "}
                                            {monograph.recalls[0].reasonForRecall}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {monographTab === "prices" && (
                        <div>
                            <h3 style={{ fontSize: 18, marginBottom: 12 }}>Verified Pharmacy Price Comparison</h3>
                            {pricesLoading ? (
                                <SkeletonCards count={2} />
                            ) : prices.length === 0 ? (
                                <p style={{ color: "var(--mw-muted)" }}>No pharmacy price listings available for this record yet.</p>
                            ) : (
                                <div style={{ display: "grid", gap: 10 }}>
                                    {prices.map((p, idx) => {
                                        const savings = selectedMed.mrp > p.sellingPrice
                                            ? Math.round(((selectedMed.mrp - p.sellingPrice) / selectedMed.mrp) * 100)
                                            : 0;
                                        return (
                                            <div key={p._id} className="card-compact" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, borderColor: idx === 0 ? "var(--mw-teal)" : undefined }}>
                                                <div>
                                                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                                        <strong>{p.pharmacy?.name}</strong>
                                                        <StatusBadge status={p.pharmacy?.isVerified ? "verified" : "pending"} />
                                                        {idx === 0 && <span className="status-badge active">Best Price</span>}
                                                        {savings > 0 && <span className="status-badge verified">{savings}% Below MRP</span>}
                                                    </div>
                                                    <p style={{ fontSize: 13, color: "var(--mw-muted)", marginTop: 4 }}>
                                                        {p.pharmacy?.address}, {p.pharmacy?.city} · Stock: {p.stockQuantity ?? 25} units · Batch: {p.batchNumber || "Verified"}
                                                        {p.expiryDate ? ` · Exp ${new Date(p.expiryDate).toLocaleDateString()}` : ""}
                                                    </p>
                                                </div>
                                                <div style={{ textAlign: "right" }}>
                                                    <strong style={{ fontSize: 22, color: "var(--mw-teal)" }}>₹{p.sellingPrice}</strong>
                                                    <div style={{ fontSize: 11, color: "var(--mw-muted)" }}>
                                                        Updated {new Date(p.lastUpdated).toLocaleDateString()}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </section>
            )}

            {correctionMed && (
                <section className="card" style={{ marginTop: 24 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <h3>Report Data Correction: {correctionMed.name}</h3>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setCorrectionMed(null)}>Close</button>
                    </div>
                    {correctionStatus && <div className="alert-box info">{correctionStatus}</div>}
                    <form onSubmit={submitCorrection} className="form-grid">
                        <div className="field">
                            <label htmlFor="correctionText">What needs updating?</label>
                            <textarea id="correctionText" rows={3} required value={correctionText} onChange={(e) => setCorrectionText(e.target.value)} placeholder="Describe inaccurate details..." />
                        </div>
                        <button type="submit" className="btn btn-primary btn-sm" style={{ width: "fit-content" }}>Submit Correction</button>
                    </form>
                </section>
            )}
        </div>
    );
}
