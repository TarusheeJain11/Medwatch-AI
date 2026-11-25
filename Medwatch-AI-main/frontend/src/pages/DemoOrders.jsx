import { useEffect, useState, useCallback, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../services/api";
import { StatusBadge, SkeletonCards } from "../components/StatusBadge";
import TrackingMapPanel from "../components/TrackingMapPanel";

const PROGRESS_STEPS = [
    { key: "submitted", label: "Order Placed" },
    { key: "accepted", label: "Confirmed" },
    { key: "preparing", label: "Packing" },
    { key: "dispatched", label: "On the Way" },
    { key: "delivered", label: "Delivered" }
];

export default function DemoOrders() {
    const {
        isAuthenticated,
        liveEvents,
        cartItems,
        addToCart,
        setCartItemQty,
        clearCart,
        preferredPharmacyId
    } = useAuth();

    const location = useLocation();
    const processedEventIdsRef = useRef(new Set());
    const selectedOrderIdRef = useRef(null);
    const [activeSection, setActiveSection] = useState("shop");
    const [products, setProducts] = useState([]);
    const [prodCategories, setProdCategories] = useState([]);
    const [prodTotal, setProdTotal] = useState(0);
    const [prodPage, setProdPage] = useState(1);
    const [prodTotalPages, setProdTotalPages] = useState(1);
    const [prodQuery, setProdQuery] = useState("");
    const [prodCategory, setProdCategory] = useState("all");
    const [prodSort, setProdSort] = useState("popular");

    const [policy, setPolicy] = useState(null);
    const [pharmacies, setPharmacies] = useState([]);
    const [orders, setOrders] = useState([]);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [tracking, setTracking] = useState(null);
    const [isStale, setIsStale] = useState(false);

    const [selectedPharmacy, setSelectedPharmacy] = useState(preferredPharmacyId || "");
    const [serviceArea, setServiceArea] = useState("Model Town");
    const [idempotencyKey, setIdempotencyKey] = useState(() => `idem_${crypto.randomUUID()}`);

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [stepping, setStepping] = useState(false);
    const [feedback, setFeedback] = useState({ type: "", message: "" });
    const [disputeReason, setDisputeReason] = useState("");

    const loadProducts = useCallback(async (qVal = prodQuery, catVal = prodCategory, sortVal = prodSort, pageVal = prodPage) => {
        const params = new URLSearchParams();
        if (qVal.trim()) params.set("q", qVal.trim());
        if (catVal !== "all") params.set("category", catVal);
        params.set("sort", sortVal);
        params.set("page", String(pageVal));
        params.set("limit", "18");

        const prodRes = await apiRequest(`/orders/demo-products?${params.toString()}`, {
            cacheKey: `store_${catVal}_${sortVal}_${pageVal}_${qVal.trim() || "all"}`
        });
        setProducts(prodRes.data || []);
        setProdTotal(prodRes.total || (prodRes.data || []).length);
        setProdTotalPages(prodRes.totalPages || 1);
        if (Array.isArray(prodRes.categories)) setProdCategories(prodRes.categories);
        setPolicy(prodRes.policy || null);
    }, [prodQuery, prodCategory, prodSort, prodPage]);

    const loadInitial = useCallback(async () => {
        setLoading(true);
        try {
            const [, pharmRes] = await Promise.all([
                loadProducts(prodQuery, prodCategory, prodSort, prodPage),
                apiRequest("/pharmacies?verifiedOnly=true&limit=40", { cacheKey: "checkout_pharms" })
            ]);

            const phList = pharmRes.data || [];
            setPharmacies(phList);
            if (preferredPharmacyId && phList.some((p) => p._id === preferredPharmacyId)) {
                setSelectedPharmacy(preferredPharmacyId);
            } else if (phList.length > 0 && !selectedPharmacy) {
                setSelectedPharmacy(phList[0]._id);
            }

            if (isAuthenticated) {
                const ordRes = await apiRequest("/orders/my");
                setOrders(ordRes.data || []);
                if ((ordRes.data || []).length > 0 && !selectedOrder) {
                    setSelectedOrder(ordRes.data[0]);
                }
            }
        } catch (err) {
            setFeedback({ type: "error", message: err.message || "Failed to load store." });
        } finally {
            setLoading(false);
        }
    }, [isAuthenticated, preferredPharmacyId]);

    useEffect(() => {
        loadInitial();
    }, [loadInitial]);

    useEffect(() => {
        if (!loading) {
            loadProducts(prodQuery, prodCategory, prodSort, prodPage).catch(() => {});
        }
    }, [prodCategory, prodSort, prodPage]);

    const loadTracking = useCallback(async (orderId) => {
        if (!orderId || !isAuthenticated) return;
        try {
            const res = await apiRequest(`/tracking/${orderId}`);
            setTracking(res.data);
            setIsStale(Boolean(res.isStale));
        } catch {
            setTracking(null);
        }
    }, [isAuthenticated]);

    useEffect(() => {
        selectedOrderIdRef.current = selectedOrder?._id || null;
        if (selectedOrder?._id) {
            loadTracking(selectedOrder._id);
        }
    }, [selectedOrder?._id, loadTracking]);

    useEffect(() => {
        if (location.hash === "#checkout") {
            setActiveSection("shop");
            setTimeout(() => {
                document.getElementById("checkout")?.scrollIntoView({ behavior: "smooth" });
            }, 80);
        }
    }, [location.hash]);

    // Real-time SSE updates for orders & courier movement (process ALL newly arrived events)
    useEffect(() => {
        if (!liveEvents.length) return;
        for (const evt of liveEvents) {
            if (processedEventIdsRef.current.has(evt.id)) continue;
            processedEventIdsRef.current.add(evt.id);

            if (evt.type === "order.updated") {
                setOrders((prev) =>
                    prev.map((o) =>
                        o._id === evt.payload.orderId
                            ? {
                                ...o,
                                status: evt.payload.status,
                                paymentStatus: evt.payload.paymentStatus || o.paymentStatus,
                                assignedCourier: evt.payload.assignedCourier || o.assignedCourier,
                                timeline: evt.payload.timeline || o.timeline
                            }
                            : o
                    )
                );
                setSelectedOrder((prev) => {
                    if (!prev || prev._id !== evt.payload.orderId) return prev;
                    return {
                        ...prev,
                        status: evt.payload.status,
                        paymentStatus: evt.payload.paymentStatus || prev.paymentStatus,
                        assignedCourier: evt.payload.assignedCourier || prev.assignedCourier,
                        timeline: evt.payload.timeline || prev.timeline
                    };
                });
            }

            if (evt.type === "tracking.updated" && evt.payload.orderId === selectedOrderIdRef.current) {
                setTracking((prev) =>
                    prev
                        ? {
                            ...prev,
                            status: evt.payload.status,
                            currentCoords: evt.payload.currentCoords,
                            waypointIndex: evt.payload.waypointIndex,
                            etaRangeText: evt.payload.etaRangeText,
                            delayNotice: evt.payload.delayNotice,
                            lastUpdatedAt: evt.payload.lastUpdatedAt
                        }
                        : prev
                );
                setIsStale(evt.payload.status === "paused_stale");
            }
        }
    }, [liveEvents]);

    const getCartQty = (productId) => cartItems.find((i) => i.product._id === productId)?.quantity || 0;
    const subtotal = cartItems.reduce((sum, item) => sum + item.product.unitPrice * item.quantity, 0);
    const serviceFee = cartItems.length > 0 ? (policy?.serviceFee || 25) : 0;
    const taxAmount = Math.round(subtotal * ((policy?.taxRatePercent || 5) / 100));
    const totalAmount = subtotal + serviceFee + taxAmount;

    const placeOrder = async (submitImmediately = true) => {
        if (!isAuthenticated) {
            setFeedback({ type: "warning", message: "Please sign in to place your order and watch live tracking." });
            return;
        }
        if (cartItems.length === 0) {
            setFeedback({ type: "error", message: "Your cart is empty. Add items from the store first." });
            return;
        }
        setSubmitting(true);
        setFeedback({ type: "", message: "" });
        try {
            const res = await apiRequest("/orders", {
                method: "POST",
                body: {
                    pharmacyId: selectedPharmacy,
                    items: cartItems.map((c) => ({ productId: c.product._id, quantity: c.quantity })),
                    serviceArea,
                    idempotencyKey,
                    submitImmediately
                }
            });
            setFeedback({
                type: "success",
                message: `Order ${res.data.orderNumber} placed! Live tracking is active below.`
            });
            clearCart();
            setIdempotencyKey(`idem_${crypto.randomUUID()}`);
            setOrders((prev) => (prev.some((o) => o._id === res.data._id) ? prev : [res.data, ...prev]));
            setSelectedOrder(res.data);
            setActiveSection("orders");
        } catch (err) {
            setFeedback({ type: "error", message: err.message || "Could not place order." });
        } finally {
            setSubmitting(false);
        }
    };

    const transitionOrder = async (orderId, nextStatus, note = "") => {
        try {
            const res = await apiRequest(`/orders/${orderId}/transition`, {
                method: "PATCH",
                body: { nextStatus, note }
            });
            setSelectedOrder((prev) => ({ ...prev, ...res.data, pharmacy: prev.pharmacy }));
            setOrders((prev) => prev.map((o) => (o._id === orderId ? { ...o, ...res.data, pharmacy: o.pharmacy } : o)));
            setFeedback({ type: "success", message: res.message });
        } catch (err) {
            setFeedback({ type: "error", message: err.message });
        }
    };

    const handleStepTracking = async () => {
        if (!selectedOrder) return;
        setStepping(true);
        try {
            const res = await apiRequest(`/tracking/${selectedOrder._id}/step`, { method: "POST" });
            setTracking(res.data);
            setIsStale(res.data.status === "paused_stale");
        } catch (err) {
            setFeedback({ type: "error", message: err.message });
        } finally {
            setStepping(false);
        }
    };

    const handleToggleStale = async () => {
        if (!selectedOrder) return;
        setStepping(true);
        try {
            const res = await apiRequest(`/tracking/${selectedOrder._id}/toggle-stale`, { method: "POST" });
            setTracking(res.data);
            setIsStale(res.data.status === "paused_stale");
        } catch (err) {
            setFeedback({ type: "error", message: err.message });
        } finally {
            setStepping(false);
        }
    };

    const submitDispute = async (e) => {
        e.preventDefault();
        if (!selectedOrder || !disputeReason.trim()) return;
        try {
            const res = await apiRequest(`/orders/${selectedOrder._id}/dispute`, {
                method: "POST",
                body: { reason: disputeReason }
            });
            setDisputeReason("");
            setFeedback({ type: "success", message: res.message });
        } catch (err) {
            setFeedback({ type: "error", message: err.message });
        }
    };

    const useOptionalAreaLocation = () => {
        if (!navigator.geolocation) {
            setFeedback({ type: "info", message: "Location unavailable; enter your area manually." });
            return;
        }
        navigator.geolocation.getCurrentPosition(
            () => {
                setServiceArea("Current Locality (Area Verified)");
                setFeedback({ type: "success", message: "Delivery area updated." });
            },
            () => {
                setFeedback({ type: "info", message: "Location permission declined; manual area active." });
            }
        );
    };

    const activeStepIndex = selectedOrder
        ? PROGRESS_STEPS.findIndex((s) => s.key === selectedOrder.status)
        : -1;

    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
                <div>
                    <h1 style={{ fontSize: 28 }}>Wellness Store &amp; Live Order Tracker</h1>
                    <p style={{ color: "var(--mw-muted)", fontSize: 14 }}>
                        Browse <strong>{prodTotal.toLocaleString()}</strong> healthcare kits &amp; monitors, check out in 1 click, and watch real-time OSRM road delivery updates.
                    </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button
                        type="button"
                        className={`btn btn-sm ${activeSection === "shop" ? "btn-primary" : "btn-outline"}`}
                        onClick={() => setActiveSection("shop")}
                    >
                        Shop &amp; Cart ({cartItems.reduce((s, i) => s + i.quantity, 0)})
                    </button>
                    <button
                        type="button"
                        className={`btn btn-sm ${activeSection === "orders" ? "btn-primary" : "btn-outline"}`}
                        onClick={() => setActiveSection("orders")}
                    >
                        Track My Orders ({orders.length})
                    </button>
                </div>
            </div>

            {feedback.message && (
                <div className={`alert-box ${feedback.type || "info"}`} role="status">
                    {feedback.message}
                </div>
            )}

            {loading ? (
                <SkeletonCards count={4} />
            ) : (
                <>
                    {activeSection === "shop" && (
                        <div className="grid-2" style={{ alignItems: "start", gridTemplateColumns: "minmax(0, 1.45fr) minmax(0, 1fr)" }}>
                            {/* Storefront Catalog */}
                            <section className="card">
                                <h2 style={{ fontSize: 20, marginBottom: 12 }}>Browse Wellness &amp; Care Products</h2>
                                <form
                                    onSubmit={(e) => { e.preventDefault(); setProdPage(1); loadProducts(prodQuery, prodCategory, prodSort, 1); }}
                                    style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}
                                >
                                    <input
                                        type="text"
                                        aria-label="Search store products"
                                        placeholder="Search thermometer, oximeter, first-aid..."
                                        value={prodQuery}
                                        onChange={(e) => setProdQuery(e.target.value)}
                                        style={{ flex: "1 1 180px", minWidth: 0, padding: "9px 12px", border: "1px solid #C6D8DA", borderRadius: 8 }}
                                    />
                                    <select aria-label="Filter product category" value={prodCategory} onChange={(e) => { setProdCategory(e.target.value); setProdPage(1); }} style={{ padding: "9px 10px", border: "1px solid #C6D8DA", borderRadius: 8 }}>
                                        <option value="all">All Categories</option>
                                        {prodCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                    <select aria-label="Sort products" value={prodSort} onChange={(e) => { setProdSort(e.target.value); setProdPage(1); }} style={{ padding: "9px 10px", border: "1px solid #C6D8DA", borderRadius: 8 }}>
                                        <option value="popular">Top Rated</option>
                                        <option value="low">Price: Low to High</option>
                                        <option value="high">Price: High to Low</option>
                                    </select>
                                    <button type="submit" className="btn btn-primary btn-sm">Find</button>
                                </form>

                                <div style={{ display: "grid", gap: 10 }}>
                                    {products.map((prod) => {
                                        const qty = getCartQty(prod._id);
                                        return (
                                            <div key={prod._id} className="card-compact" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                                                <div>
                                                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                                                        <span className="status-badge neutral">{prod.category}</span>
                                                        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--mw-teal)" }}>★ {prod.rating || 4.7}</span>
                                                    </div>
                                                    <h3 style={{ fontSize: 16 }}>{prod.name}</h3>
                                                    <p style={{ fontSize: 12, color: "var(--mw-muted)" }}>{prod.brand} · {prod.description}</p>
                                                    <div style={{ marginTop: 4 }}>
                                                        <strong style={{ color: "var(--mw-teal)", fontSize: 17 }}>₹{prod.unitPrice}</strong>
                                                        {prod.mrp > prod.unitPrice && (
                                                            <small style={{ marginLeft: 6, textDecoration: "line-through", color: "var(--mw-muted)" }}>₹{prod.mrp}</small>
                                                        )}
                                                    </div>
                                                </div>
                                                {qty === 0 ? (
                                                    <button type="button" className="btn btn-primary btn-sm" onClick={() => addToCart(prod, 1)}>
                                                        + Add
                                                    </button>
                                                ) : (
                                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                        <button type="button" className="btn btn-outline btn-sm" aria-label={`Decrease ${prod.name}`} onClick={() => addToCart(prod, -1)}>-</button>
                                                        <strong style={{ minWidth: 20, textAlign: "center" }}>{qty}</strong>
                                                        <button type="button" className="btn btn-primary btn-sm" aria-label={`Increase ${prod.name}`} onClick={() => addToCart(prod, 1)}>+</button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {prodTotalPages > 1 && (
                                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, marginTop: 16 }}>
                                        <button type="button" className="btn btn-outline btn-sm" disabled={prodPage <= 1} onClick={() => setProdPage((p) => p - 1)}>← Prev</button>
                                        <span style={{ fontSize: 13, fontWeight: 600 }}>Page {prodPage} / {prodTotalPages}</span>
                                        <button type="button" className="btn btn-outline btn-sm" disabled={prodPage >= prodTotalPages} onClick={() => setProdPage((p) => p + 1)}>Next →</button>
                                    </div>
                                )}
                            </section>

                            {/* Sticky Cart & Checkout */}
                            <section id="checkout" className="card" style={{ position: "sticky", top: 80 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                                    <h2 style={{ fontSize: 20 }}>Your Cart &amp; Checkout</h2>
                                    {cartItems.length > 0 && (
                                        <button type="button" className="btn btn-outline btn-sm" onClick={clearCart}>Clear</button>
                                    )}
                                </div>

                                {cartItems.length === 0 ? (
                                    <div className="alert-box info">
                                        Your cart is empty. Click <strong>+ Add</strong> on any product to start!
                                    </div>
                                ) : (
                                    <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
                                        {cartItems.map((item) => (
                                            <div key={item.product._id} className="card-compact" style={{ padding: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                                                <div style={{ fontSize: 13 }}>
                                                    <strong>{item.product.name}</strong>
                                                    <div style={{ color: "var(--mw-muted)" }}>₹{item.product.unitPrice} × {item.quantity} = ₹{item.product.unitPrice * item.quantity}</div>
                                                </div>
                                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setCartItemQty(item.product._id, item.quantity - 1)}>-</button>
                                                    <span>{item.quantity}</span>
                                                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setCartItemQty(item.product._id, item.quantity + 1)}>+</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="form-grid">
                                    <div className="field">
                                        <label htmlFor="demoPharmacy">Dispatching Pharmacy</label>
                                        <select id="demoPharmacy" value={selectedPharmacy} onChange={(e) => setSelectedPharmacy(e.target.value)}>
                                            {pharmacies.map((p) => (
                                                <option key={p._id} value={p._id}>
                                                    {p.name} ({p.city})
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="field">
                                        <label htmlFor="serviceArea">Delivery Locality / Area</label>
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <input id="serviceArea" type="text" value={serviceArea} onChange={(e) => setServiceArea(e.target.value)} />
                                            <button type="button" className="btn btn-outline btn-sm" onClick={useOptionalAreaLocation}>Detect</button>
                                        </div>
                                    </div>

                                    <div className="card-compact" style={{ background: "var(--mw-bg)" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
                                            <span>Subtotal</span><span>₹{subtotal}</span>
                                        </div>
                                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
                                            <span>Delivery Fee</span><span>₹{serviceFee}</span>
                                        </div>
                                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 8 }}>
                                            <span>GST ({policy?.taxRatePercent || 5}%)</span><span>₹{taxAmount}</span>
                                        </div>
                                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 17, fontWeight: 800, borderTop: "1px solid var(--mw-border)", paddingTop: 8 }}>
                                            <span>Total</span>
                                            <span style={{ color: "var(--mw-teal)" }}>₹{totalAmount}</span>
                                        </div>
                                        <p style={{ fontSize: 11, color: "var(--mw-muted)", marginTop: 6 }}>
                                            {policy?.cancellationPolicy}
                                        </p>
                                    </div>

                                    {!isAuthenticated ? (
                                        <Link to="/login" className="btn btn-primary">
                                            Sign In to Place Order
                                        </Link>
                                    ) : (
                                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                            <button
                                                type="button"
                                                className="btn btn-primary"
                                                style={{ flex: 1 }}
                                                disabled={submitting || cartItems.length === 0}
                                                onClick={() => placeOrder(true)}
                                            >
                                                {submitting ? "Placing Order..." : "Place Order & Track Live"}
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-outline"
                                                disabled={submitting || cartItems.length === 0}
                                                onClick={() => placeOrder(false)}
                                            >
                                                Save Draft
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </section>
                        </div>
                    )}

                    {activeSection === "orders" && (
                        !isAuthenticated ? (
                            <div className="card" style={{ textAlign: "center", padding: 36 }}>
                                <h2>Sign in to view &amp; track your live orders</h2>
                                <p style={{ color: "var(--mw-muted)", margin: "8px 0 16px" }}>
                                    Your real-time order updates and live courier route map appear here automatically.
                                </p>
                                <Link to="/login" className="btn btn-primary">Sign In</Link>
                            </div>
                        ) : (
                            <section className="grid-2" style={{ alignItems: "start" }}>
                                <div className="card">
                                    <h2 style={{ fontSize: 20, marginBottom: 14 }}>Your Orders ({orders.length})</h2>
                                    {orders.length === 0 ? (
                                        <div>
                                            <p style={{ color: "var(--mw-muted)", marginBottom: 12 }}>You haven't placed an order yet.</p>
                                            <button type="button" className="btn btn-primary btn-sm" onClick={() => setActiveSection("shop")}>
                                                Browse Wellness Store
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ display: "grid", gap: 10 }}>
                                            {orders.map((ord) => (
                                                <button
                                                    key={ord._id}
                                                    type="button"
                                                    className="card-compact"
                                                    onClick={() => setSelectedOrder(ord)}
                                                    style={{
                                                        textAlign: "left",
                                                        borderColor: selectedOrder?._id === ord._id ? "var(--mw-teal)" : undefined,
                                                        background: selectedOrder?._id === ord._id ? "#F0FAFA" : "#fff"
                                                    }}
                                                >
                                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                                                        <strong>{ord.orderNumber}</strong>
                                                        <StatusBadge status={ord.status} />
                                                    </div>
                                                    <p style={{ fontSize: 13, color: "var(--mw-muted)", marginTop: 4 }}>
                                                        {ord.pharmacy?.name || "Pharmacy"} · Total ₹{ord.costBreakdown?.totalAmount} · {new Date(ord.createdAt).toLocaleTimeString()}
                                                    </p>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {selectedOrder && (
                                    <div className="card" style={{ display: "grid", gap: 16 }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                                            <div>
                                                <h2 style={{ fontSize: 20 }}>Order {selectedOrder.orderNumber}</h2>
                                                <p style={{ fontSize: 13, color: "var(--mw-muted)" }}>
                                                    Receipt: {selectedOrder.receiptNumber} · Courier: <strong>{selectedOrder.assignedCourier || "Assigning..."}</strong>
                                                </p>
                                            </div>
                                            <StatusBadge status={selectedOrder.status} />
                                        </div>

                                        {/* Visual Customer Progress Stepper */}
                                        {!["cancelled", "failed", "returned"].includes(selectedOrder.status) && (
                                            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, textAlign: "center" }}>
                                                {PROGRESS_STEPS.map((step, i) => {
                                                    const done = activeStepIndex >= i;
                                                    return (
                                                        <div key={step.key} style={{ padding: "8px 4px", borderRadius: 8, background: done ? "var(--mw-teal-soft)" : "#F1F5F9", border: `1px solid ${done ? "var(--mw-teal)" : "#E2E8F0"}` }}>
                                                            <div style={{ fontSize: 11, fontWeight: 700, color: done ? "var(--mw-teal)" : "var(--mw-muted)" }}>
                                                                {done ? "✓ " : ""}{step.label}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                            {selectedOrder.status === "draft" && (
                                                <button type="button" className="btn btn-primary btn-sm" onClick={() => transitionOrder(selectedOrder._id, "submitted", "Customer submitted order")}>
                                                    Submit Order
                                                </button>
                                            )}
                                            {["draft", "submitted", "accepted"].includes(selectedOrder.status) && (
                                                <button type="button" className="btn btn-danger btn-sm" onClick={() => transitionOrder(selectedOrder._id, "cancelled", "Cancelled before dispatch")}>
                                                    Cancel Order (Free Refund)
                                                </button>
                                            )}
                                        </div>

                                        <TrackingMapPanel
                                            tracking={tracking}
                                            isStale={isStale}
                                            onStep={handleStepTracking}
                                            onToggleStale={handleToggleStale}
                                            stepping={stepping}
                                        />

                                        <div>
                                            <h3 style={{ fontSize: 16, marginBottom: 10 }}>Live Order Updates</h3>
                                            <div className="timeline">
                                                {(selectedOrder.timeline || []).map((entry, idx) => (
                                                    <div key={idx} className={`timeline-item ${entry.isException ? "exception" : ""}`}>
                                                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                                            <strong style={{ fontSize: 13, textTransform: "uppercase" }}>{entry.status}</strong>
                                                            <span style={{ fontSize: 12, color: "var(--mw-muted)" }}>
                                                                {new Date(entry.timestamp).toLocaleTimeString()}
                                                            </span>
                                                        </div>
                                                        <p style={{ fontSize: 13, color: "var(--mw-muted)" }}>{entry.note}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <form onSubmit={submitDispute} style={{ display: "flex", gap: 8, flexWrap: "wrap", borderTop: "1px solid var(--mw-border)", paddingTop: 12 }}>
                                            <input
                                                type="text"
                                                aria-label="Order help note"
                                                placeholder="Need help with this order?"
                                                value={disputeReason}
                                                onChange={(e) => setDisputeReason(e.target.value)}
                                                style={{ flex: "1 1 200px", padding: "8px 10px", border: "1px solid #C6D8DA", borderRadius: 8 }}
                                            />
                                            <button type="submit" className="btn btn-outline btn-sm">Get Help</button>
                                        </form>
                                    </div>
                                )}
                            </section>
                        )
                    )}
                </>
            )}
        </div>
    );
}
