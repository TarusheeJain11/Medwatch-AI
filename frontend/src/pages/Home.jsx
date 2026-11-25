import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../services/api";
import { t } from "../services/i18n";
import { SearchIcon, MicIcon, ShieldCrossIcon, BuildingIcon, TruckIcon, SparkleIcon } from "../components/Icons";
import { StatusBadge, SkeletonCards } from "../components/StatusBadge";

export default function Home() {
    const { language, addToCart, reconnectSse } = useAuth();
    const navigate = useNavigate();

    const [query, setQuery] = useState("");
    const [suggestions, setSuggestions] = useState([]);
    const [showAuto, setShowAuto] = useState(false);

    // Independent section states (so one failure never hides healthy sections)
    const [medicines, setMedicines] = useState([]);
    const [medTotal, setMedTotal] = useState(null);
    const [medLoading, setMedLoading] = useState(true);
    const [medError, setMedError] = useState("");

    const [pharmaciesTotal, setPharmaciesTotal] = useState(null);
    const [pharmLoading, setPharmLoading] = useState(true);
    const [pharmError, setPharmError] = useState("");

    const [storeProducts, setStoreProducts] = useState([]);
    const [storeTotal, setStoreTotal] = useState(null);
    const [storeLoading, setStoreLoading] = useState(true);
    const [storeError, setStoreError] = useState("");

    const [categories, setCategories] = useState([]);
    const [addedToast, setAddedToast] = useState("");
    const [voiceError, setVoiceError] = useState("");
    const [voiceActive, setVoiceActive] = useState(false);

    const debounceRef = useRef(null);
    const mountedRef = useRef(true);

    const loadHomeData = useCallback(async () => {
        setMedLoading(true);
        setPharmLoading(true);
        setStoreLoading(true);
        setMedError("");
        setPharmError("");
        setStoreError("");

        const [medRes, pharmRes, prodRes] = await Promise.allSettled([
            apiRequest("/medicines?limit=4", { cacheKey: "home_meds" }),
            apiRequest("/pharmacies?limit=1", { cacheKey: "home_pharms" }),
            apiRequest("/orders/demo-products?limit=4", { cacheKey: "home_store" })
        ]);

        if (!mountedRef.current) return;

        if (medRes.status === "fulfilled") {
            const val = medRes.value;
            setMedicines(val.data || []);
            setMedTotal(val.total ?? (val.data || []).length);
            setCategories((val.categories || []).slice(0, 8));
        } else {
            setMedicines([]);
            setMedTotal(null);
            setMedError(medRes.reason?.message || "Failed to load medicines.");
        }
        setMedLoading(false);

        if (pharmRes.status === "fulfilled") {
            const val = pharmRes.value;
            setPharmaciesTotal(val.total ?? (val.data || []).length);
        } else {
            setPharmaciesTotal(null);
            setPharmError(pharmRes.reason?.message || "Failed to load pharmacy directory.");
        }
        setPharmLoading(false);

        if (prodRes.status === "fulfilled") {
            const val = prodRes.value;
            setStoreProducts(val.data || []);
            setStoreTotal(val.total ?? (val.data || []).length);
        } else {
            setStoreProducts([]);
            setStoreTotal(null);
            setStoreError(prodRes.reason?.message || "Failed to load wellness products.");
        }
        setStoreLoading(false);
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        loadHomeData();
        return () => {
            mountedRef.current = false;
        };
    }, [loadHomeData]);

    const handleRetryAll = () => {
        reconnectSse();
        loadHomeData();
    };

    const handleSearchInput = (value) => {
        setQuery(value);
        clearTimeout(debounceRef.current);
        if (!value.trim()) {
            setSuggestions([]);
            setShowAuto(false);
            return;
        }
        debounceRef.current = setTimeout(async () => {
            try {
                const res = await apiRequest(`/medicines/autocomplete?q=${encodeURIComponent(value.trim())}`);
                setSuggestions(res.suggestions || []);
                setShowAuto(true);
            } catch {
                setSuggestions([]);
            }
        }, 180);
    };

    const startVoiceInput = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setVoiceError("Voice search is not supported in this browser; please type your query.");
            return;
        }
        setVoiceError("");
        const recognition = new SpeechRecognition();
        recognition.lang = language === "hi" ? "hi-IN" : language === "pa" ? "pa-IN" : "en-IN";
        setVoiceActive(true);
        recognition.onresult = (event) => {
            const transcript = event.results?.[0]?.[0]?.transcript || "";
            setVoiceActive(false);
            if (transcript) {
                setQuery(transcript);
                navigate(`/catalog?q=${encodeURIComponent(transcript)}`);
            }
        };
        recognition.onerror = () => setVoiceActive(false);
        recognition.onend = () => setVoiceActive(false);
        recognition.start();
    };

    const submitSearch = (e) => {
        e.preventDefault();
        setShowAuto(false);
        navigate(`/catalog?q=${encodeURIComponent(query.trim())}`);
    };

    const handleQuickAdd = (prod) => {
        addToCart(prod, 1);
        setAddedToast(`Added "${prod.name}" to your cart!`);
        setTimeout(() => setAddedToast(""), 3000);
    };

    const formatStat = (isLoading, total, hasError) => {
        if (isLoading) return "...";
        if (hasError || total === null) return "—";
        return total.toLocaleString();
    };

    const combinedError = medError || pharmError || storeError;

    return (
        <div>
            <section className="hero-panel">
                <span className="hero-eyebrow">{t(language, "heroEyebrow")}</span>
                <h1>
                    {t(language, "heroTitle1")}
                    <br />
                    <span>{t(language, "heroTitle2")}</span>
                </h1>
                <p className="hero-subtitle">{t(language, "heroSubtitle")}</p>

                <div className="search-wrapper">
                    <form className="search-bar" onSubmit={submitSearch}>
                        <SearchIcon size={20} />
                        <input
                            type="text"
                            aria-label="Search medicines or generic names"
                            placeholder={t(language, "searchPlaceholder")}
                            value={query}
                            onChange={(e) => handleSearchInput(e.target.value)}
                            onFocus={() => suggestions.length > 0 && setShowAuto(true)}
                        />
                        <button
                            type="button"
                            className={`btn btn-sm ${voiceActive ? "btn-primary" : "btn-outline"}`}
                            onClick={startVoiceInput}
                            aria-label="Voice search"
                            title="Voice search"
                        >
                            <MicIcon size={16} />
                        </button>
                        <button type="submit" className="btn btn-primary btn-sm">
                            Search
                        </button>
                    </form>

                    {showAuto && suggestions.length > 0 && (
                        <div className="autocomplete-list" role="listbox" aria-label="Medicine suggestions">
                            {suggestions.map((item) => (
                                <button
                                    key={item._id}
                                    type="button"
                                    className="autocomplete-item"
                                    onClick={() => {
                                        setShowAuto(false);
                                        navigate(`/catalog?q=${encodeURIComponent(item.name)}`);
                                    }}
                                >
                                    <div>
                                        <strong>{item.name}</strong>
                                        <span style={{ display: "block", fontSize: 12, color: "var(--mw-muted)" }}>
                                            {item.genericName} · {item.category}
                                            {item.fuzzyMatch ? " (Spelling match)" : ""}
                                        </span>
                                    </div>
                                    <span className="status-badge verified">MRP ₹{item.mrp}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div style={{ display: "flex", justifyContent: "center", gap: 36, flexWrap: "wrap", marginTop: 28 }}>
                    <div>
                        <strong style={{ fontSize: 26, color: "var(--mw-teal)", display: "block" }}>
                            {formatStat(medLoading, medTotal, Boolean(medError))}
                        </strong>
                        <span style={{ fontSize: 13, color: "var(--mw-muted)" }}>OpenFDA &amp; Catalog Medicines</span>
                    </div>
                    <div>
                        <strong style={{ fontSize: 26, color: "var(--mw-teal)", display: "block" }}>
                            {formatStat(pharmLoading, pharmaciesTotal, Boolean(pharmError))}
                        </strong>
                        <span style={{ fontSize: 13, color: "var(--mw-muted)" }}>Pharmacies in Directory</span>
                    </div>
                    <div>
                        <strong style={{ fontSize: 26, color: "var(--mw-teal)", display: "block" }}>
                            {formatStat(storeLoading, storeTotal, Boolean(storeError))}
                        </strong>
                        <span style={{ fontSize: 13, color: "var(--mw-muted)" }}>Wellness &amp; Care Products</span>
                    </div>
                </div>
            </section>

            {addedToast && (
                <div className="alert-box success" role="status">
                    <span>{addedToast}</span>
                    <Link to="/orders#checkout" className="btn btn-primary btn-sm">
                        View Cart &amp; Checkout →
                    </Link>
                </div>
            )}

            {voiceError && (
                <div className="alert-box info" role="status">
                    {voiceError}
                </div>
            )}

            {combinedError && (
                <div className="alert-box error" role="alert">
                    <div>
                        <strong>Unable to load live data from backend</strong>
                        <p style={{ marginTop: 4 }}>{combinedError}</p>
                    </div>
                    <button type="button" className="btn btn-outline btn-sm" onClick={handleRetryAll}>
                        Retry
                    </button>
                </div>
            )}

            {/* Easy Customer Actions */}
            <section style={{ marginBottom: 32 }}>
                <h2 style={{ fontSize: 22, marginBottom: 14 }}>What would you like to do today?</h2>
                <div className="grid-4">
                    <Link to="/catalog" className="card-compact" style={{ display: "block" }}>
                        <div style={{ color: "var(--mw-teal)", marginBottom: 8 }}><ShieldCrossIcon size={24} /></div>
                        <h3 style={{ fontSize: 17, marginBottom: 6 }}>Search Medicines &amp; Prices</h3>
                        <p style={{ fontSize: 13, color: "var(--mw-muted)" }}>
                            Compare pharmacy prices across {medTotal !== null ? medTotal.toLocaleString() : "our"} OpenFDA &amp; reference medicines.
                        </p>
                    </Link>

                    <Link to="/directory" className="card-compact" style={{ display: "block" }}>
                        <div style={{ color: "var(--mw-teal)", marginBottom: 8 }}><BuildingIcon size={24} /></div>
                        <h3 style={{ fontSize: 17, marginBottom: 6 }}>Find Nearby Pharmacies</h3>
                        <p style={{ fontSize: 13, color: "var(--mw-muted)" }}>
                            Filter {pharmaciesTotal !== null ? pharmaciesTotal.toLocaleString() : "verified"} pharmacies by city, 24x7 hours, and accessibility.
                        </p>
                    </Link>

                    <Link to="/orders" className="card-compact" style={{ display: "block" }}>
                        <div style={{ color: "var(--mw-teal)", marginBottom: 8 }}><TruckIcon size={24} /></div>
                        <h3 style={{ fontSize: 17, marginBottom: 6 }}>Shop Care Kits &amp; Track Live</h3>
                        <p style={{ fontSize: 13, color: "var(--mw-muted)" }}>
                            Order thermometers, oximeters, &amp; first-aid kits with simulated live OSRM street tracking.
                        </p>
                    </Link>

                    <Link to="/help" className="card-compact" style={{ display: "block" }}>
                        <div style={{ color: "var(--mw-teal)", marginBottom: 8 }}><SparkleIcon size={24} /></div>
                        <h3 style={{ fontSize: 17, marginBottom: 6 }}>Ask Care AI &amp; Support</h3>
                        <p style={{ fontSize: 13, color: "var(--mw-muted)" }}>
                            Get instant cited answers about medicines, policies, or reach human support anytime.
                        </p>
                    </Link>
                </div>
            </section>

            {/* Popular Care Products */}
            <section style={{ marginBottom: 32 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                    <h2 style={{ fontSize: 22 }}>Popular Wellness &amp; Care Products</h2>
                    <Link to="/orders" className="btn btn-secondary btn-sm">
                        Browse All {storeTotal !== null ? storeTotal.toLocaleString() : ""} Products →
                    </Link>
                </div>
                {storeLoading ? (
                    <SkeletonCards count={4} />
                ) : storeError ? (
                    <div className="alert-box error">
                        <span>{storeError}</span>
                        <button type="button" className="btn btn-outline btn-sm" onClick={handleRetryAll}>Retry</button>
                    </div>
                ) : storeProducts.length === 0 ? (
                    <div className="card-compact">No wellness products found in the database.</div>
                ) : (
                    <div className="catalog-grid">
                        {storeProducts.map((prod) => (
                            <article key={prod._id} className="card-compact" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 10 }}>
                                <div>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                                        <span className="status-badge neutral">{prod.category}</span>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--mw-teal)" }}>★ {prod.rating || 4.7}</span>
                                    </div>
                                    <h3 style={{ fontSize: 16, marginBottom: 4 }}>{prod.name}</h3>
                                    <p style={{ fontSize: 12, color: "var(--mw-muted)" }}>{prod.brand} · {prod.description}</p>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 6 }}>
                                    <div>
                                        <strong style={{ fontSize: 20, color: "var(--mw-teal)" }}>₹{prod.unitPrice}</strong>
                                        {prod.mrp > prod.unitPrice && (
                                            <small style={{ marginLeft: 6, textDecoration: "line-through", color: "var(--mw-muted)" }}>₹{prod.mrp}</small>
                                        )}
                                    </div>
                                    <button type="button" className="btn btn-primary btn-sm" onClick={() => handleQuickAdd(prod)}>
                                        + Add to Cart
                                    </button>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>

            {/* Quick Category Pills */}
            {categories.length > 0 && (
                <section style={{ marginBottom: 32 }}>
                    <h2 style={{ fontSize: 20, marginBottom: 12 }}>Browse Medicines by Category</h2>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {categories.map((cat) => (
                            <Link
                                key={cat}
                                to={`/catalog?category=${encodeURIComponent(cat)}`}
                                className="btn btn-outline btn-sm"
                            >
                                {cat}
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            {/* Featured Medicines */}
            <section style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                    <h2 style={{ fontSize: 22 }}>Featured Medicines &amp; Reference Catalog</h2>
                    <Link to="/catalog" className="btn btn-secondary btn-sm">
                        Explore All {medTotal !== null ? medTotal.toLocaleString() : ""} Medicines →
                    </Link>
                </div>
                {medLoading ? (
                    <SkeletonCards count={4} />
                ) : medError ? (
                    <div className="alert-box error">
                        <span>{medError}</span>
                        <button type="button" className="btn btn-outline btn-sm" onClick={handleRetryAll}>Retry</button>
                    </div>
                ) : medicines.length === 0 ? (
                    <div className="card-compact">No medicines found in the database.</div>
                ) : (
                    <div className="catalog-grid">
                        {medicines.map((med) => (
                            <article className="card-compact" key={med._id} style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 10 }}>
                                <div>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                                        <span className="status-badge neutral">{med.category}</span>
                                        <StatusBadge status="verified" label="Verified" />
                                    </div>
                                    <h3 style={{ fontSize: 17, marginBottom: 4 }}>{med.name}</h3>
                                    <p style={{ fontSize: 13, color: "var(--mw-muted)" }}>
                                        {med.genericName || "Generic"} · {med.manufacturer || "Manufacturer"}
                                    </p>
                                </div>
                                <div>
                                    <div style={{ fontSize: 20, fontWeight: 800, color: "var(--mw-teal)", marginBottom: 8 }}>
                                        ₹{med.mrp} <small style={{ fontSize: 12, fontWeight: 500, color: "var(--mw-muted)" }}>MRP</small>
                                    </div>
                                    <Link to={`/catalog?q=${encodeURIComponent(med.name)}`} className="btn btn-outline btn-sm" style={{ width: "100%" }}>
                                        {t(language, "comparePrices")}
                                    </Link>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>

            <div className="alert-box info" role="note">
                <div>
                    <strong>Notice:</strong> {t(language, "disclaimer")}
                </div>
                <Link to="/status" className="btn btn-outline btn-sm">
                    Live API Status
                </Link>
            </div>
        </div>
    );
}
