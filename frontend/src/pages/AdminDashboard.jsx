import { useEffect, useState, useCallback } from "react";
import { apiRequest } from "../services/api";
import { StatusBadge, SkeletonCards } from "../components/StatusBadge";
import SmartImage from "../components/SmartImage";
import InvoiceModal from "../components/InvoiceModal";

export default function AdminDashboard() {
    const [tab, setTab] = useState("overview");
    const [overview, setOverview] = useState(null);
    const [pharmacies, setPharmacies] = useState([]);
    const [phFilter, setPhFilter] = useState("all");
    const [users, setUsers] = useState([]);
    const [userQuery, setUserQuery] = useState("");

    const [medicines, setMedicines] = useState([]);
    const [medTotal, setMedTotal] = useState(0);
    const [medQuery, setMedQuery] = useState("");
    const [medPage, setMedPage] = useState(1);

    const [allOrders, setAllOrders] = useState([]);
    const [orderStatusFilter, setOrderStatusFilter] = useState("all");
    const [paymentData, setPaymentData] = useState({ summary: null, data: [] });
    const [invoiceOrder, setInvoiceOrder] = useState(null);

    const [recalls, setRecalls] = useState([]);
    const [tickets, setTickets] = useState([]);
    const [sources, setSources] = useState([]);
    const [flags, setFlags] = useState([]);
    const [privacyReqs, setPrivacyReqs] = useState([]);
    const [auditLogs, setAuditLogs] = useState([]);
    const [aiEval, setAiEval] = useState(null);
    const [loading, setLoading] = useState(true);
    const [feedback, setFeedback] = useState({ type: "", message: "" });

    const [rejectionReasons, setRejectionReasons] = useState({});
    const [newMed, setNewMed] = useState({
        name: "",
        genericName: "",
        manufacturer: "Pilot Verified Source",
        mrp: "",
        category: "Vitamins and Minerals",
        dosage: "Standard",
        sourceCitation: "MedWatch Editorial Review"
    });
    const [broadcast, setBroadcast] = useState({ title: "", message: "", roleTarget: "all" });

    const loadCatalogPage = useCallback(async (qVal = medQuery, pageVal = medPage) => {
        const params = new URLSearchParams({ limit: "20", page: String(pageVal) });
        if (qVal.trim()) params.set("q", qVal.trim());
        const med = await apiRequest(`/medicines?${params.toString()}`);
        setMedicines(med.data || []);
        setMedTotal(med.total || 0);
    }, [medQuery, medPage]);

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const [ov, ph, us, med, tk, src, fl, pr, aud, ordRes, payRes, recRes] = await Promise.all([
                apiRequest("/admin/overview"),
                apiRequest("/pharmacies/all?limit=100"),
                apiRequest("/admin/users"),
                apiRequest(`/medicines?limit=20&page=${medPage}${medQuery.trim() ? `&q=${encodeURIComponent(medQuery.trim())}` : ""}`),
                apiRequest("/admin/tickets"),
                apiRequest("/admin/sources"),
                apiRequest("/admin/feature-flags"),
                apiRequest("/admin/privacy-requests"),
                apiRequest("/admin/audit"),
                apiRequest("/orders/admin/all"),
                apiRequest("/payments/admin/all"),
                apiRequest("/medicines/recalls/live?limit=8").catch(() => ({ data: [] }))
            ]);
            setOverview(ov);
            setPharmacies(ph.data || []);
            setUsers(us.data || []);
            setMedicines(med.data || []);
            setMedTotal(med.total || 0);
            setTickets(tk.data || []);
            setSources(src.data || []);
            setFlags(fl.data || []);
            setPrivacyReqs(pr.data || []);
            setAuditLogs(aud.data || []);
            setAllOrders(ordRes.data || []);
            setPaymentData({ summary: payRes.summary || null, data: payRes.data || [] });
            setRecalls(recRes.data || []);
        } catch (err) {
            setFeedback({ type: "error", message: err.message || "Failed to load admin console." });
        } finally {
            setLoading(false);
        }
    }, [medPage, medQuery]);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    const verifyPharmacy = async (id, nextStatus) => {
        setFeedback({ type: "", message: "" });
        try {
            const approve = nextStatus === "verified";
            const reason = rejectionReasons[id] || "";
            const res = await apiRequest(`/pharmacies/${id}/verify`, {
                method: "PATCH",
                body: {
                    isVerified: approve,
                    verificationStatus: nextStatus,
                    rejectionReason:
                        nextStatus === "rejected"
                            ? reason || "Documentation incomplete during verification review."
                            : ""
                }
            });
            setFeedback({ type: "success", message: res.message });
            await loadAll();
        } catch (err) {
            setFeedback({ type: "error", message: err.message });
        }
    };

    const addMedicine = async (e) => {
        e.preventDefault();
        try {
            const res = await apiRequest("/medicines", {
                method: "POST",
                body: { ...newMed, mrp: Number(newMed.mrp) }
            });
            setFeedback({ type: "success", message: res.message });
            setNewMed({ ...newMed, name: "", genericName: "", mrp: "" });
            await loadAll();
        } catch (err) {
            setFeedback({ type: "error", message: err.message });
        }
    };

    const toggleMedEditorial = async (med) => {
        const nextStatus = med.editorialStatus === "verified" ? "flagged" : "verified";
        await apiRequest(`/medicines/${med._id}`, {
            method: "PATCH",
            body: { editorialStatus: nextStatus }
        });
        await loadCatalogPage(medQuery, medPage);
    };

    const updateMedMrp = async (med) => {
        const raw = window.prompt(`Enter updated Sample MRP (₹) for ${med.name}:`, String(med.mrp));
        if (!raw) return;
        const val = Number(raw);
        if (!Number.isFinite(val) || val < 0) return;
        await apiRequest(`/medicines/${med._id}`, { method: "PATCH", body: { mrp: val } });
        setFeedback({ type: "success", message: `Updated ${med.name} MRP to ₹${val}.` });
        await loadCatalogPage(medQuery, medPage);
    };

    const updateUser = async (id, patch) => {
        try {
            await apiRequest(`/admin/users/${id}`, { method: "PATCH", body: patch });
            setFeedback({ type: "success", message: "User updated." });
            await loadAll();
        } catch (err) {
            setFeedback({ type: "error", message: err.message });
        }
    };

    const transitionAdminOrder = async (orderId, nextStatus) => {
        try {
            const res = await apiRequest(`/orders/${orderId}/transition`, {
                method: "PATCH",
                body: { nextStatus, note: `Admin transitioned order to ${nextStatus}` }
            });
            setFeedback({ type: "success", message: res.message });
            await loadAll();
        } catch (err) {
            setFeedback({ type: "error", message: err.message });
        }
    };

    const refundAdminOrder = async (orderId) => {
        try {
            const res = await apiRequest(`/payments/${orderId}/refund`, { method: "POST" });
            setFeedback({ type: "success", message: res.message });
            await loadAll();
        } catch (err) {
            setFeedback({ type: "error", message: err.message });
        }
    };

    const resolveTicket = async (id, status) => {
        await apiRequest(`/admin/tickets/${id}`, {
            method: "PATCH",
            body: { status, resolutionNote: `Marked ${status} by Admin Governance.` }
        });
        await loadAll();
    };

    const updatePrivacyRequest = async (id, status) => {
        await apiRequest(`/admin/privacy-requests/${id}`, { method: "PATCH", body: { status } });
        setFeedback({ type: "success", message: `Privacy request marked ${status}.` });
        await loadAll();
    };

    const syncSource = async (id, simulateFailure = false) => {
        await apiRequest(`/admin/sources/${id}/sync`, {
            method: "POST",
            body: { simulateFailure }
        });
        await loadAll();
    };

    const syncLiveOpenFda = async () => {
        setFeedback({ type: "", message: "" });
        try {
            const res = await apiRequest("/admin/sources/sync-live", { method: "POST" });
            setFeedback({ type: "success", message: `Live OpenFDA sync complete: checked ${res.fetched}, added ${res.inserted} new records.` });
            await loadAll();
        } catch (err) {
            setFeedback({ type: "error", message: err.message });
        }
    };

    const toggleFlag = async (flag) => {
        try {
            await apiRequest(`/admin/feature-flags/${flag.key}`, {
                method: "PATCH",
                body: { enabled: !flag.enabled }
            });
            await loadAll();
        } catch (err) {
            setFeedback({ type: "error", message: err.message });
        }
    };

    const sendBroadcast = async (e) => {
        e.preventDefault();
        await apiRequest("/admin/notifications/broadcast", { method: "POST", body: broadcast });
        setBroadcast({ title: "", message: "", roleTarget: "all" });
        setFeedback({ type: "success", message: "Notification broadcast sent." });
    };

    const runAiEval = async () => {
        const res = await apiRequest("/ai/evaluate", { method: "POST" });
        setAiEval(res.data);
    };

    const filteredPharmacies = pharmacies.filter((p) => {
        if (phFilter === "all") return true;
        if (phFilter === "verified") return p.isVerified;
        return (p.verificationStatus || "pending") === phFilter;
    });

    const filteredUsers = users.filter((u) => {
        if (!userQuery.trim()) return true;
        const q = userQuery.toLowerCase();
        return u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.role?.toLowerCase().includes(q);
    });

    const filteredOrders = allOrders.filter((o) => orderStatusFilter === "all" || o.status === orderStatusFilter);

    const statusEntries = Object.entries(overview?.analytics?.statusBreakdown || {});
    const maxStatusCount = Math.max(1, ...statusEntries.map(([, c]) => c));
    const payEntries = Object.entries(overview?.analytics?.paymentBreakdown || {});
    const maxPayCount = Math.max(1, ...payEntries.map(([, c]) => c));

    const tabs = [
        { id: "overview", label: "Overview & Analytics" },
        { id: "orders", label: `Orders & Payments (${allOrders.length})` },
        { id: "verification", label: `Verification (${overview?.kpis?.pendingPharmacies || 0})` },
        { id: "catalog", label: `Catalog (${medTotal.toLocaleString()})` },
        { id: "recalls", label: `Live FDA Recalls (${recalls.length})` },
        { id: "users", label: `Users & Roles (${users.length})` },
        { id: "tickets", label: `Tickets (${overview?.kpis?.openTickets || 0})` },
        { id: "sources", label: "Sources & Flags" },
        { id: "privacy", label: "Privacy & Audit" },
        { id: "ai", label: "AI Evaluation" }
    ];

    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
                <div>
                    <h1 style={{ fontSize: 28 }}>Admin Governance, Revenue &amp; Operations Console</h1>
                    <p style={{ color: "var(--mw-muted)", fontSize: 14 }}>
                        Live orders &amp; payment gateway ledger, pharmacy verification, 1,000+ catalog governance, FDA recall monitoring, DPDP privacy, and AI safety.
                    </p>
                </div>
                <a href="/api/admin/export-report" className="btn btn-outline btn-sm">
                    Export Audited Order CSV
                </a>
            </div>

            {feedback.message && <div className={`alert-box ${feedback.type}`}>{feedback.message}</div>}

            {loading ? (
                <SkeletonCards count={4} />
            ) : (
                <div className="console-layout">
                    <aside className="console-sidebar" aria-label="Admin console sections">
                        {tabs.map((t) => (
                            <button key={t.id} type="button" className={`console-tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
                                <span>{t.label}</span>
                            </button>
                        ))}
                    </aside>

                    <div style={{ display: "grid", gap: 20 }}>
                        <div className="grid-4">
                            <div className="card-compact">
                                <span style={{ fontSize: 12, color: "var(--mw-muted)" }}>Captured Gateway Revenue</span>
                                <strong style={{ fontSize: 24, color: "var(--mw-teal)", display: "block" }}>
                                    ₹{(overview?.kpis?.capturedRevenue || 0).toLocaleString()}
                                </strong>
                                <small style={{ fontSize: 11, color: "var(--mw-muted)" }}>Gross Orders: ₹{(overview?.kpis?.grossOrderValue || 0).toLocaleString()}</small>
                            </div>
                            <div className="card-compact">
                                <span style={{ fontSize: 12, color: "var(--mw-muted)" }}>Verified Pharmacies</span>
                                <strong style={{ fontSize: 24, color: "var(--mw-teal)", display: "block" }}>
                                    {overview?.kpis?.verifiedPharmacies} / {overview?.kpis?.totalPharmacies}
                                </strong>
                                <small style={{ fontSize: 11, color: "var(--mw-amber)" }}>{overview?.kpis?.pendingPharmacies} pending</small>
                            </div>
                            <div className="card-compact">
                                <span style={{ fontSize: 12, color: "var(--mw-muted)" }}>Order Completion Rate</span>
                                <strong style={{ fontSize: 24, color: "var(--mw-teal)", display: "block" }}>
                                    {overview?.analytics?.orderCompletionRate}% ({overview?.kpis?.totalOrders})
                                </strong>
                                <small style={{ fontSize: 11, color: "var(--mw-muted)" }}>Refunded: ₹{(overview?.kpis?.refundedAmount || 0).toLocaleString()}</small>
                            </div>
                            <div className="card-compact">
                                <span style={{ fontSize: 12, color: "var(--mw-muted)" }}>Support Resolution</span>
                                <strong style={{ fontSize: 24, color: "var(--mw-teal)", display: "block" }}>
                                    {overview?.analytics?.supportResolutionRate}%
                                </strong>
                                <small style={{ fontSize: 11, color: "var(--mw-muted)" }}>{overview?.kpis?.openTickets} open tickets</small>
                            </div>
                        </div>

                        {tab === "overview" && (
                            <div style={{ display: "grid", gap: 20 }}>
                                <div className="grid-2" style={{ alignItems: "start" }}>
                                    <section className="card">
                                        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Order Lifecycle Breakdown</h2>
                                        {statusEntries.length === 0 ? (
                                            <p style={{ fontSize: 13, color: "var(--mw-muted)" }}>No orders placed yet.</p>
                                        ) : (
                                            <div style={{ display: "grid", gap: 10 }}>
                                                {statusEntries.map(([st, cnt]) => (
                                                    <div key={st}>
                                                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                                                            <strong style={{ textTransform: "uppercase" }}>{st}</strong>
                                                            <span>{cnt}</span>
                                                        </div>
                                                        <div className="bar-track">
                                                            <div className="bar-fill" style={{ width: `${Math.round((cnt / maxStatusCount) * 100)}%` }} />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </section>

                                    <section className="card">
                                        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Payment Gateway Method Mix</h2>
                                        {payEntries.length === 0 ? (
                                            <p style={{ fontSize: 13, color: "var(--mw-muted)" }}>No gateway transactions recorded yet.</p>
                                        ) : (
                                            <div style={{ display: "grid", gap: 10 }}>
                                                {payEntries.map(([m, cnt]) => (
                                                    <div key={m}>
                                                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                                                            <strong style={{ textTransform: "uppercase" }}>{m}</strong>
                                                            <span>{cnt} txns</span>
                                                        </div>
                                                        <div className="bar-track">
                                                            <div className="bar-fill" style={{ width: `${Math.round((cnt / maxPayCount) * 100)}%` }} />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </section>
                                </div>

                                <div className="grid-2" style={{ alignItems: "start" }}>
                                    <section className="card">
                                        <h2 style={{ fontSize: 20, marginBottom: 10 }}>Platform Operations Summary</h2>
                                        <ul style={{ paddingLeft: 18, fontSize: 14, display: "grid", gap: 6 }}>
                                            <li>Catalog Records: <strong>{overview?.kpis?.totalMedicines?.toLocaleString()}</strong></li>
                                            <li>Registered Users: <strong>{overview?.kpis?.totalUsers}</strong></li>
                                            <li>Gateway Transactions: <strong>{overview?.kpis?.totalTransactions || 0}</strong></li>
                                            <li>Failed / Dead-Letter Sources: <strong>{overview?.kpis?.failedSources}</strong></li>
                                            <li>Delivery SSE Latency Target: <strong>{overview?.analytics?.deliveryEventLatencyTarget}</strong></li>
                                        </ul>
                                    </section>
                                    <section className="card">
                                        <h2 style={{ fontSize: 20, marginBottom: 10 }}>Broadcast System Notification</h2>
                                        <form onSubmit={sendBroadcast} className="form-grid">
                                            <input placeholder="Title" value={broadcast.title} onChange={(e) => setBroadcast({ ...broadcast, title: e.target.value })} required style={{ padding: 10, border: "1px solid #C6D8DA", borderRadius: 8 }} />
                                            <textarea rows={2} placeholder="Message" value={broadcast.message} onChange={(e) => setBroadcast({ ...broadcast, message: e.target.value })} required style={{ padding: 10, border: "1px solid #C6D8DA", borderRadius: 8 }} />
                                            <select value={broadcast.roleTarget} onChange={(e) => setBroadcast({ ...broadcast, roleTarget: e.target.value })} style={{ padding: 10, border: "1px solid #C6D8DA", borderRadius: 8 }}>
                                                <option value="all">All Users</option>
                                                <option value="customer">Customers</option>
                                                <option value="pharmacy">Pharmacy Owners</option>
                                            </select>
                                            <button type="submit" className="btn btn-primary btn-sm">Send Broadcast</button>
                                        </form>
                                    </section>
                                </div>
                            </div>
                        )}

                        {tab === "orders" && (
                            <div style={{ display: "grid", gap: 20 }}>
                                <section className="card">
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
                                        <h2 style={{ fontSize: 20 }}>Platform Orders Management ({filteredOrders.length})</h2>
                                        <select value={orderStatusFilter} onChange={(e) => setOrderStatusFilter(e.target.value)} style={{ padding: "8px 10px", border: "1px solid #C6D8DA", borderRadius: 8 }}>
                                            <option value="all">All Statuses</option>
                                            <option value="submitted">Submitted</option>
                                            <option value="accepted">Accepted</option>
                                            <option value="preparing">Preparing</option>
                                            <option value="dispatched">Dispatched</option>
                                            <option value="delivered">Delivered</option>
                                            <option value="cancelled">Cancelled</option>
                                        </select>
                                    </div>
                                    {filteredOrders.length === 0 ? (
                                        <p style={{ color: "var(--mw-muted)" }}>No orders match this status filter.</p>
                                    ) : (
                                        <div style={{ display: "grid", gap: 10 }}>
                                            {filteredOrders.map((ord) => (
                                                <div key={ord._id} className="card-compact" style={{ display: "grid", gap: 8 }}>
                                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                                                        <div>
                                                            <strong>{ord.orderNumber}</strong> · Customer: {ord.customer?.name || "Customer"} ({ord.customer?.email || ""}) → <strong>{ord.pharmacy?.name}</strong>
                                                        </div>
                                                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                                            <StatusBadge status={ord.paymentStatus?.includes("refunded") ? "rejected" : "verified"} label={ord.paymentStatus} />
                                                            <StatusBadge status={ord.status} />
                                                        </div>
                                                    </div>
                                                    <p style={{ fontSize: 13, color: "var(--mw-muted)" }}>
                                                        Total: <strong>₹{ord.costBreakdown?.totalAmount}</strong> · Method: {ord.paymentMethod || "Gateway"} · Zone: {ord.serviceArea}
                                                    </p>
                                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setInvoiceOrder(ord)}>Invoice</button>
                                                        {ord.status === "submitted" && (
                                                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => transitionAdminOrder(ord._id, "accepted")}>Accept</button>
                                                        )}
                                                        {["accepted", "preparing"].includes(ord.status) && (
                                                            <button type="button" className="btn btn-primary btn-sm" onClick={() => transitionAdminOrder(ord._id, "dispatched")}>Dispatch</button>
                                                        )}
                                                        {ord.status === "dispatched" && (
                                                            <button type="button" className="btn btn-primary btn-sm" onClick={() => transitionAdminOrder(ord._id, "delivered")}>Mark Delivered</button>
                                                        )}
                                                        {["paid_sandbox", "paid_gateway"].includes(ord.paymentStatus) && (
                                                            <button type="button" className="btn btn-danger btn-sm" onClick={() => refundAdminOrder(ord._id)}>Issue Refund</button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </section>

                                <section className="card">
                                    <h2 style={{ fontSize: 20, marginBottom: 10 }}>Payment Gateway Transaction Ledger ({paymentData.data.length})</h2>
                                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, marginBottom: 12 }}>
                                        <span>Captured: <strong style={{ color: "var(--mw-success)" }}>₹{paymentData.summary?.capturedRevenue || 0}</strong></span>
                                        <span>COD Pending: <strong>₹{paymentData.summary?.codPending || 0}</strong></span>
                                        <span>Refunded: <strong style={{ color: "var(--mw-red)" }}>₹{paymentData.summary?.refundedAmount || 0}</strong></span>
                                    </div>
                                    <div className="table-wrap">
                                        <table className="data-table">
                                            <thead>
                                                <tr><th>Txn ID</th><th>Customer</th><th>Method</th><th>Amount</th><th>Status</th><th>Time</th></tr>
                                            </thead>
                                            <tbody>
                                                {paymentData.data.map((tx) => (
                                                    <tr key={tx._id}>
                                                        <td><code>{tx.transactionId}</code></td>
                                                        <td>{tx.customer?.email || "User"}</td>
                                                        <td>{tx.methodDetails?.label || tx.method}</td>
                                                        <td><strong>₹{tx.costBreakdown?.totalAmount}</strong></td>
                                                        <td><StatusBadge status={tx.status === "captured" ? "verified" : tx.status === "refunded" ? "rejected" : "pending"} label={tx.status} /></td>
                                                        <td>{new Date(tx.createdAt).toLocaleString()}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </section>
                            </div>
                        )}

                        {tab === "verification" && (
                            <section className="card">
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                                    <h2 style={{ fontSize: 20 }}>Pharmacy Verification Queue ({filteredPharmacies.length})</h2>
                                    <div className="pill-tabs" style={{ marginBottom: 0 }}>
                                        {["all", "pending", "under_review", "verified", "rejected"].map((f) => (
                                            <button key={f} type="button" className={`pill-tab ${phFilter === f ? "active" : ""}`} onClick={() => setPhFilter(f)}>
                                                {f.replace("_", " ")}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div style={{ display: "grid", gap: 12 }}>
                                    {filteredPharmacies.map((p) => (
                                        <div key={p._id} className="card-compact" style={{ display: "grid", gap: 8 }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                                                <div>
                                                    <strong>{p.name}</strong> ({p.city}{p.state ? `, ${p.state}` : ""}) — Owner: {p.owner?.email || "Catalog Record"}
                                                </div>
                                                <StatusBadge status={p.isVerified ? "verified" : p.verificationStatus || "pending"} />
                                            </div>
                                            <p style={{ fontSize: 13, color: "var(--mw-muted)" }}>
                                                License: {p.licenseNumber || "N/A"} · Address: {p.address}{p.pinCode ? ` (PIN ${p.pinCode})` : ""}
                                            </p>
                                            {p.verificationDocuments?.length > 0 && (
                                                <div style={{ fontSize: 12, color: "#0F766E", background: "#F0FDFA", padding: "6px 10px", borderRadius: 6 }}>
                                                    Submitted Documents: {p.verificationDocuments.map((d) => `${d.title} (${d.referenceNumber || d.documentType})`).join(" · ")}
                                                </div>
                                            )}
                                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                                <input
                                                    type="text"
                                                    placeholder="Rejection reason (required if rejecting)..."
                                                    value={rejectionReasons[p._id] || ""}
                                                    onChange={(e) => setRejectionReasons({ ...rejectionReasons, [p._id]: e.target.value })}
                                                    style={{ flex: "1 1 220px", padding: "7px 10px", border: "1px solid #C6D8DA", borderRadius: 6 }}
                                                />
                                                <button type="button" className="btn btn-primary btn-sm" onClick={() => verifyPharmacy(p._id, "verified")}>Approve</button>
                                                <button type="button" className="btn btn-outline btn-sm" onClick={() => verifyPharmacy(p._id, "under_review")}>Under Review</button>
                                                <button type="button" className="btn btn-danger btn-sm" onClick={() => verifyPharmacy(p._id, "rejected")}>Reject / Revoke</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {tab === "catalog" && (
                            <div style={{ display: "grid", gap: 20 }}>
                                <section className="card">
                                    <h2 style={{ fontSize: 20, marginBottom: 12 }}>Add Verified Catalog Record</h2>
                                    <form onSubmit={addMedicine} className="grid-3">
                                        <input placeholder="Medicine Name" value={newMed.name} onChange={(e) => setNewMed({ ...newMed, name: e.target.value })} required style={{ padding: 9, border: "1px solid #C6D8DA", borderRadius: 8 }} />
                                        <input placeholder="Generic Name" value={newMed.genericName} onChange={(e) => setNewMed({ ...newMed, genericName: e.target.value })} style={{ padding: 9, border: "1px solid #C6D8DA", borderRadius: 8 }} />
                                        <input type="number" placeholder="Sample MRP (₹)" value={newMed.mrp} onChange={(e) => setNewMed({ ...newMed, mrp: e.target.value })} required style={{ padding: 9, border: "1px solid #C6D8DA", borderRadius: 8 }} />
                                        <input placeholder="Category" value={newMed.category} onChange={(e) => setNewMed({ ...newMed, category: e.target.value })} style={{ padding: 9, border: "1px solid #C6D8DA", borderRadius: 8 }} />
                                        <input placeholder="Source Citation" value={newMed.sourceCitation} onChange={(e) => setNewMed({ ...newMed, sourceCitation: e.target.value })} style={{ padding: 9, border: "1px solid #C6D8DA", borderRadius: 8 }} />
                                        <button type="submit" className="btn btn-primary btn-sm">Add Record</button>
                                    </form>
                                </section>
                                <section className="card">
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                                        <h3 style={{ fontSize: 18 }}>Catalog Editorial Status ({medTotal.toLocaleString()} total)</h3>
                                        <form onSubmit={(e) => { e.preventDefault(); setMedPage(1); loadCatalogPage(medQuery, 1); }} style={{ display: "flex", gap: 6 }}>
                                            <input placeholder="Search catalog..." value={medQuery} onChange={(e) => setMedQuery(e.target.value)} style={{ padding: "6px 10px", border: "1px solid #C6D8DA", borderRadius: 8 }} />
                                            <button type="submit" className="btn btn-secondary btn-sm">Filter</button>
                                        </form>
                                    </div>
                                    <div className="table-wrap">
                                        <table className="data-table">
                                            <thead><tr><th>Img</th><th>Name</th><th>MRP</th><th>Source</th><th>Status</th><th>Actions</th></tr></thead>
                                            <tbody>
                                                {medicines.map((m) => (
                                                    <tr key={m._id}>
                                                        <td><SmartImage src={m.imageUrl} fallbackSrc="/images/meds/tablet.svg" alt={m.name} height={38} style={{ width: 52 }} /></td>
                                                        <td><strong>{m.name}</strong><br /><small style={{ color: "var(--mw-muted)" }}>{m.genericName}</small></td>
                                                        <td>₹{m.mrp}</td>
                                                        <td style={{ fontSize: 12 }}>{m.sourceCitation}</td>
                                                        <td><StatusBadge status={m.editorialStatus || "verified"} /></td>
                                                        <td>
                                                            <div style={{ display: "flex", gap: 6 }}>
                                                                <button type="button" className="btn btn-outline btn-sm" onClick={() => updateMedMrp(m)}>Edit MRP</button>
                                                                <button type="button" className="btn btn-outline btn-sm" onClick={() => toggleMedEditorial(m)}>
                                                                    {m.editorialStatus === "flagged" ? "Verify" : "Flag"}
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 12 }}>
                                        <button type="button" className="btn btn-outline btn-sm" disabled={medPage <= 1} onClick={() => setMedPage((p) => p - 1)}>← Prev</button>
                                        <span style={{ fontSize: 13 }}>Page {medPage}</span>
                                        <button type="button" className="btn btn-outline btn-sm" disabled={medPage * 20 >= medTotal} onClick={() => setMedPage((p) => p + 1)}>Next →</button>
                                    </div>
                                </section>
                            </div>
                        )}

                        {tab === "recalls" && (
                            <section className="card">
                                <h2 style={{ fontSize: 20, marginBottom: 8 }}>Live OpenFDA Drug Enforcement &amp; Recall Monitor</h2>
                                <p style={{ fontSize: 13, color: "var(--mw-muted)", marginBottom: 14 }}>
                                    Real-time safety enforcement reports retrieved directly from <code>api.fda.gov/drug/enforcement.json</code>.
                                </p>
                                <div style={{ display: "grid", gap: 10 }}>
                                    {recalls.map((rec, i) => (
                                        <div key={rec.recallNumber || i} className="card-compact" style={{ background: "#FFFBEB", borderColor: "#FDE68A" }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                                                <strong>{rec.recallingFirm} · {rec.recallNumber}</strong>
                                                <StatusBadge status="pending" label={`${rec.classification} (${rec.status})`} />
                                            </div>
                                            <p style={{ fontSize: 13, marginTop: 4 }}>{rec.productDescription}</p>
                                            <p style={{ fontSize: 12, color: "var(--mw-amber)", marginTop: 4 }}>
                                                <strong>Reason:</strong> {rec.reasonForRecall} · Report Date: {rec.reportDate}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {tab === "users" && (
                            <section className="card">
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                                    <h2 style={{ fontSize: 20 }}>User &amp; Role Governance ({filteredUsers.length})</h2>
                                    <input
                                        placeholder="Search user name, email, or role..."
                                        value={userQuery}
                                        onChange={(e) => setUserQuery(e.target.value)}
                                        style={{ padding: "7px 10px", border: "1px solid #C6D8DA", borderRadius: 8 }}
                                    />
                                </div>
                                <div className="table-wrap">
                                    <table className="data-table">
                                        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
                                        <tbody>
                                            {filteredUsers.map((u) => (
                                                <tr key={u._id}>
                                                    <td><strong>{u.name}</strong></td>
                                                    <td>{u.email}</td>
                                                    <td>
                                                        <select aria-label={`Role for ${u.email}`} value={u.role} onChange={(e) => updateUser(u._id, { role: e.target.value })} style={{ padding: 4, borderRadius: 6, border: "1px solid #C6D8DA" }}>
                                                            <option value="customer">customer</option>
                                                            <option value="pharmacy_owner">pharmacy_owner</option>
                                                            <option value="pharmacy">pharmacy</option>
                                                            <option value="admin">admin</option>
                                                        </select>
                                                    </td>
                                                    <td><StatusBadge status={u.isActive ? "verified" : "rejected"} label={u.isActive ? "Active" : "Suspended"} /></td>
                                                    <td>
                                                        <button type="button" className="btn btn-outline btn-sm" onClick={() => updateUser(u._id, { isActive: !u.isActive, suspensionReason: u.isActive ? "Suspended by Admin" : "" })}>
                                                            {u.isActive ? "Suspend" : "Activate"}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        )}

                        {tab === "tickets" && (
                            <section className="card">
                                <h2 style={{ fontSize: 20, marginBottom: 12 }}>Support, Correction &amp; Dispute Triage</h2>
                                <div style={{ display: "grid", gap: 10 }}>
                                    {tickets.map((tk) => (
                                        <div key={tk._id} className="card-compact">
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                                                <strong>{tk.ticketNumber} ({tk.type}) — {tk.subject}</strong>
                                                <StatusBadge status={tk.status} />
                                            </div>
                                            <p style={{ fontSize: 13, color: "var(--mw-muted)", margin: "6px 0" }}>{tk.description}</p>
                                            <div style={{ display: "flex", gap: 8 }}>
                                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => resolveTicket(tk._id, "in_review")}>In Review</button>
                                                <button type="button" className="btn btn-primary btn-sm" onClick={() => resolveTicket(tk._id, "resolved")}>Resolve</button>
                                                <button type="button" className="btn btn-outline btn-sm" onClick={() => resolveTicket(tk._id, "dismissed")}>Dismiss</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        {tab === "sources" && (
                            <div style={{ display: "grid", gap: 20 }}>
                                <section className="card">
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                                        <h2 style={{ fontSize: 20 }}>Data Source Ingestion &amp; Live API Sync</h2>
                                        <button type="button" className="btn btn-primary btn-sm" onClick={syncLiveOpenFda}>
                                            Sync Live OpenFDA Feed Now
                                        </button>
                                    </div>
                                    <div style={{ display: "grid", gap: 10 }}>
                                        {sources.map((s) => (
                                            <div key={s._id} className="card-compact" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                                                <div>
                                                    <strong>{s.sourceName}</strong> ({s.sourceType})
                                                    <p style={{ fontSize: 12, color: "var(--mw-muted)" }}>
                                                        Retries: {s.retryCount} · {s.errorMessage || s.provenanceNote}
                                                    </p>
                                                </div>
                                                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                                    <StatusBadge status={s.status} />
                                                    <button type="button" className="btn btn-primary btn-sm" onClick={() => syncSource(s._id, false)}>Sync Now</button>
                                                    <button type="button" className="btn btn-outline btn-sm" onClick={() => syncSource(s._id, true)}>Simulate Failure</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                                <section className="card">
                                    <h2 style={{ fontSize: 20, marginBottom: 12 }}>Feature Flags &amp; Release Controls</h2>
                                    <div style={{ display: "grid", gap: 10 }}>
                                        {flags.map((f) => (
                                            <div key={f.key} className="card-compact" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                                                <div>
                                                    <strong>{f.label}</strong> <code>({f.key})</code>
                                                    <p style={{ fontSize: 12, color: "var(--mw-muted)" }}>{f.description}</p>
                                                </div>
                                                <button type="button" className="btn btn-outline btn-sm" onClick={() => toggleFlag(f)} disabled={f.key === "regulated_checkout"}>
                                                    {f.enabled ? "Enabled (Disable)" : "Disabled (Enable)"}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            </div>
                        )}

                        {tab === "privacy" && (
                            <div className="grid-2" style={{ alignItems: "start" }}>
                                <section className="card">
                                    <h2 style={{ fontSize: 18, marginBottom: 12 }}>DPDP Privacy Requests ({privacyReqs.length})</h2>
                                    {privacyReqs.length === 0 ? (
                                        <p style={{ color: "var(--mw-muted)" }}>No privacy requests logged.</p>
                                    ) : (
                                        <div style={{ display: "grid", gap: 8 }}>
                                            {privacyReqs.map((pr) => (
                                                <div key={pr._id} className="card-compact" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                                    <div>
                                                        <strong>{pr.requestType.toUpperCase()}</strong> — {pr.user?.email || "User"}
                                                        <p style={{ fontSize: 12, color: "var(--mw-muted)" }}>{new Date(pr.createdAt).toLocaleString()}</p>
                                                    </div>
                                                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                                        <StatusBadge status={pr.status === "completed" ? "resolved" : pr.status} />
                                                        {pr.status === "pending" && (
                                                            <button type="button" className="btn btn-primary btn-sm" onClick={() => updatePrivacyRequest(pr._id, "completed")}>Complete</button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </section>
                                <section className="card">
                                    <h2 style={{ fontSize: 18, marginBottom: 12 }}>Immutable Audit Trail ({auditLogs.length})</h2>
                                    <div style={{ display: "grid", gap: 8, maxHeight: 440, overflowY: "auto" }}>
                                        {auditLogs.map((log) => (
                                            <div key={log._id} className="card-compact" style={{ padding: 10, fontSize: 13 }}>
                                                <strong>{log.action}</strong> <span className="status-badge neutral">{log.domain}</span>
                                                <p style={{ color: "var(--mw-muted)", marginTop: 4 }}>{log.summary}</p>
                                                <small style={{ color: "var(--mw-muted)" }}>{log.actorRole} · {new Date(log.createdAt).toLocaleString()}</small>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            </div>
                        )}

                        {tab === "ai" && (
                            <section className="card">
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                                    <div>
                                        <h2 style={{ fontSize: 20 }}>AI Safety &amp; Grounding Evaluation Suite</h2>
                                        <p style={{ fontSize: 13, color: "var(--mw-muted)" }}>
                                            Tests clinical abstention, prompt injection defense, PII redaction, grounded citations, and missing-evidence abstention.
                                        </p>
                                    </div>
                                    <button type="button" className="btn btn-primary" onClick={runAiEval}>Run Evaluation Suite</button>
                                </div>
                                {aiEval && (
                                    <div>
                                        <div className="alert-box success">
                                            Passed {aiEval.passed} / {aiEval.total} automated safety &amp; grounding checks ({new Date(aiEval.runAt).toLocaleTimeString()}).
                                        </div>
                                        <div className="table-wrap">
                                            <table className="data-table">
                                                <thead><tr><th>Test Case</th><th>Reason</th><th>Citations</th><th>Result</th></tr></thead>
                                                <tbody>
                                                    {aiEval.results.map((r, i) => (
                                                        <tr key={i}>
                                                            <td><strong>{r.name}</strong></td>
                                                            <td><code>{r.reason}</code></td>
                                                            <td>{r.citationsCount}</td>
                                                            <td><StatusBadge status={r.passed ? "verified" : "rejected"} label={r.passed ? "PASS" : "FAIL"} /></td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </section>
                        )}
                    </div>
                </div>
            )}

            <InvoiceModal order={invoiceOrder} onClose={() => setInvoiceOrder(null)} />
        </div>
    );
}
