import { useEffect, useState, useCallback } from "react";
import { apiRequest } from "../services/api";
import { StatusBadge, SkeletonCards } from "../components/StatusBadge";

export default function AdminDashboard() {
    const [tab, setTab] = useState("overview");
    const [overview, setOverview] = useState(null);
    const [pharmacies, setPharmacies] = useState([]);
    const [users, setUsers] = useState([]);
    const [medicines, setMedicines] = useState([]);
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

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const [ov, ph, us, med, tk, src, fl, pr, aud] = await Promise.all([
                apiRequest("/admin/overview"),
                apiRequest("/pharmacies/all"),
                apiRequest("/admin/users"),
                apiRequest("/medicines"),
                apiRequest("/admin/tickets"),
                apiRequest("/admin/sources"),
                apiRequest("/admin/feature-flags"),
                apiRequest("/admin/privacy-requests"),
                apiRequest("/admin/audit")
            ]);
            setOverview(ov);
            setPharmacies(ph.data || []);
            setUsers(us.data || []);
            setMedicines(med.data || []);
            setTickets(tk.data || []);
            setSources(src.data || []);
            setFlags(fl.data || []);
            setPrivacyReqs(pr.data || []);
            setAuditLogs(aud.data || []);
        } catch (err) {
            setFeedback({ type: "error", message: err.message || "Failed to load admin console." });
        } finally {
            setLoading(false);
        }
    }, []);

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
        await loadAll();
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

    const resolveTicket = async (id, status) => {
        await apiRequest(`/admin/tickets/${id}`, {
            method: "PATCH",
            body: { status, resolutionNote: `Marked ${status} by Admin Governance.` }
        });
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

    const tabs = [
        { id: "overview", label: "Overview & Analytics" },
        { id: "verification", label: `Verification (${overview?.kpis?.pendingPharmacies || 0})` },
        { id: "catalog", label: "Catalog Editorial" },
        { id: "users", label: "Users & Roles" },
        { id: "tickets", label: `Tickets (${overview?.kpis?.openTickets || 0})` },
        { id: "sources", label: "Sources & Flags" },
        { id: "privacy", label: "Privacy & Audit" },
        { id: "ai", label: "AI Evaluation" }
    ];

    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
                <div>
                    <h1 style={{ fontSize: 28 }}>Admin Governance &amp; Operations Console</h1>
                    <p style={{ color: "var(--mw-muted)", fontSize: 14 }}>
                        Pharmacy Owner verification, editorial catalog governance, support triage, feature flags, DPDP privacy requests, and audit trail.
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
                                <span style={{ fontSize: 12, color: "var(--mw-muted)" }}>Verified Pharmacies</span>
                                <strong style={{ fontSize: 24, color: "var(--mw-teal)", display: "block" }}>
                                    {overview?.kpis?.verifiedPharmacies} / {overview?.kpis?.totalPharmacies}
                                </strong>
                            </div>
                            <div className="card-compact">
                                <span style={{ fontSize: 12, color: "var(--mw-muted)" }}>Pending Verifications</span>
                                <strong style={{ fontSize: 24, color: "var(--mw-amber)", display: "block" }}>
                                    {overview?.kpis?.pendingPharmacies}
                                </strong>
                            </div>
                            <div className="card-compact">
                                <span style={{ fontSize: 12, color: "var(--mw-muted)" }}>Demo Orders Completed</span>
                                <strong style={{ fontSize: 24, color: "var(--mw-teal)", display: "block" }}>
                                    {overview?.analytics?.orderCompletionRate}% ({overview?.kpis?.totalOrders})
                                </strong>
                            </div>
                            <div className="card-compact">
                                <span style={{ fontSize: 12, color: "var(--mw-muted)" }}>Support Resolution</span>
                                <strong style={{ fontSize: 24, color: "var(--mw-teal)", display: "block" }}>
                                    {overview?.analytics?.supportResolutionRate}%
                                </strong>
                            </div>
                        </div>

                        {tab === "overview" && (
                            <div className="grid-2" style={{ alignItems: "start" }}>
                                <section className="card">
                                    <h2 style={{ fontSize: 20, marginBottom: 10 }}>Pseudonymous Platform Metrics</h2>
                                    <ul style={{ paddingLeft: 18, fontSize: 14, display: "grid", gap: 6 }}>
                                        <li>Catalog Records: <strong>{overview?.kpis?.totalMedicines}</strong></li>
                                        <li>Registered Users: <strong>{overview?.kpis?.totalUsers}</strong></li>
                                        <li>Open Tickets &amp; Corrections: <strong>{overview?.kpis?.openTickets}</strong></li>
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
                        )}

                        {tab === "verification" && (
                            <section className="card">
                                <h2 style={{ fontSize: 20, marginBottom: 14 }}>Pharmacy Verification Queue</h2>
                                <div style={{ display: "grid", gap: 12 }}>
                                    {pharmacies.map((p) => (
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
                                    <h3 style={{ fontSize: 18, marginBottom: 10 }}>Catalog Editorial Status ({medicines.length})</h3>
                                    <div className="table-wrap">
                                        <table className="data-table">
                                            <thead><tr><th>Name</th><th>Source</th><th>Status</th><th>Action</th></tr></thead>
                                            <tbody>
                                                {medicines.map((m) => (
                                                    <tr key={m._id}>
                                                        <td><strong>{m.name}</strong></td>
                                                        <td>{m.sourceCitation}</td>
                                                        <td><StatusBadge status={m.editorialStatus || "verified"} /></td>
                                                        <td>
                                                            <button type="button" className="btn btn-outline btn-sm" onClick={() => toggleMedEditorial(m)}>
                                                                {m.editorialStatus === "flagged" ? "Mark Verified" : "Flag Review"}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </section>
                            </div>
                        )}

                        {tab === "users" && (
                            <section className="card">
                                <h2 style={{ fontSize: 20, marginBottom: 12 }}>User &amp; Role Governance</h2>
                                <div className="table-wrap">
                                    <table className="data-table">
                                        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
                                        <tbody>
                                            {users.map((u) => (
                                                <tr key={u._id}>
                                                    <td><strong>{u.name}</strong></td>
                                                    <td>{u.email}</td>
                                                    <td>
                                                        <select aria-label={`Role for ${u.email}`} value={u.role} onChange={(e) => updateUser(u._id, { role: e.target.value })} style={{ padding: 4, borderRadius: 6, border: "1px solid #C6D8DA" }}>
                                                            <option value="customer">customer</option>
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
                                                <div key={pr._id} className="card-compact" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                    <div>
                                                        <strong>{pr.requestType.toUpperCase()}</strong> — {pr.user?.email || "User"}
                                                        <p style={{ fontSize: 12, color: "var(--mw-muted)" }}>{new Date(pr.createdAt).toLocaleString()}</p>
                                                    </div>
                                                    <StatusBadge status={pr.status === "completed" ? "resolved" : pr.status} />
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
        </div>
    );
}
