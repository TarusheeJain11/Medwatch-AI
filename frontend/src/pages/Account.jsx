import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../services/api";
import { StatusBadge } from "../components/StatusBadge";
import SmartImage from "../components/SmartImage";

export default function Account() {
    const {
        user,
        setUser,
        logout,
        language,
        lowBandwidth,
        updatePreferences,
        refreshNotifications
    } = useAuth();
    const navigate = useNavigate();

    const [name, setName] = useState(user?.name || "");
    const [phone, setPhone] = useState(user?.phone || "");
    const [city, setCity] = useState(user?.preferences?.city || "Jalandhar");
    const [accessibilityNeeds, setAccessibilityNeeds] = useState(user?.preferences?.accessibilityNeeds || "");
    const [analyticsOptIn, setAnalyticsOptIn] = useState(Boolean(user?.dpdpConsent?.analyticsOptIn));
    const [notificationsOptIn, setNotificationsOptIn] = useState(user?.dpdpConsent?.notificationsOptIn !== false);

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [mfaCodeHint, setMfaCodeHint] = useState("");

    const [addresses, setAddresses] = useState(user?.savedAddresses || []);
    const [newAddr, setNewAddr] = useState({ label: "Home", addressLine: "", locality: "", city: "Jalandhar", pinCode: "" });
    const [savedMeds, setSavedMeds] = useState([]);
    const [payments, setPayments] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [feedback, setFeedback] = useState({ type: "", message: "" });

    const loadNotifications = async () => {
        try {
            const res = await apiRequest("/support/notifications");
            setNotifications(res.data || []);
        } catch {
            // ignore
        }
    };

    const loadExtras = async () => {
        const [addrRes, medRes, payRes] = await Promise.allSettled([
            apiRequest("/auth/addresses"),
            apiRequest("/auth/saved-medicines"),
            apiRequest("/payments/my")
        ]);
        if (addrRes.status === "fulfilled") setAddresses(addrRes.value.data || []);
        if (medRes.status === "fulfilled") setSavedMeds(medRes.value.data || []);
        if (payRes.status === "fulfilled") setPayments(payRes.value.data || []);
    };

    useEffect(() => {
        loadNotifications();
        loadExtras();
    }, []);

    const saveProfile = async (e) => {
        e.preventDefault();
        setFeedback({ type: "", message: "" });
        try {
            await updatePreferences({
                name,
                phone,
                language,
                lowBandwidthMode: lowBandwidth,
                preferences: { city, accessibilityNeeds },
                dpdpConsent: { analyticsOptIn, notificationsOptIn }
            });
            setFeedback({ type: "success", message: "Profile & DPDP privacy preferences saved." });
        } catch (err) {
            setFeedback({ type: "error", message: err.message });
        }
    };

    const addAddress = async (e) => {
        e.preventDefault();
        try {
            const res = await apiRequest("/auth/addresses", {
                method: "POST",
                body: { ...newAddr, isDefault: addresses.length === 0 }
            });
            setAddresses(res.data || []);
            if (res.user) setUser(res.user);
            setNewAddr({ label: "Home", addressLine: "", locality: "", city: "Jalandhar", pinCode: "" });
            setFeedback({ type: "success", message: "Delivery address saved." });
        } catch (err) {
            setFeedback({ type: "error", message: err.message });
        }
    };

    const removeAddress = async (id) => {
        try {
            const res = await apiRequest(`/auth/addresses/${id}`, { method: "DELETE" });
            setAddresses(res.data || []);
            if (res.user) setUser(res.user);
        } catch (err) {
            setFeedback({ type: "error", message: err.message });
        }
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        setFeedback({ type: "", message: "" });
        try {
            const res = await apiRequest("/auth/change-password", {
                method: "POST",
                body: { currentPassword, newPassword }
            });
            setCurrentPassword("");
            setNewPassword("");
            setFeedback({ type: "success", message: res.message });
        } catch (err) {
            setFeedback({ type: "error", message: err.message });
        }
    };

    const handleVerifyEmail = async () => {
        try {
            const res = await apiRequest("/auth/resend-verification", {
                method: "POST",
                body: { email: user?.email }
            });
            setFeedback({ type: "success", message: res.message });
        } catch (err) {
            setFeedback({ type: "error", message: err.message });
        }
    };

    const handleToggleMfa = async () => {
        try {
            const res = await apiRequest("/auth/mfa/toggle", { method: "POST", body: {} });
            if (res.user) setUser(res.user);
            setMfaCodeHint(res.pilotVerificationCode || "");
            setFeedback({ type: "success", message: res.message });
        } catch (err) {
            setFeedback({ type: "error", message: err.message });
        }
    };

    const handleRevokeSessions = async () => {
        try {
            await apiRequest("/auth/revoke-sessions", { method: "POST" });
            setUser(null);
            navigate("/login");
        } catch (err) {
            setFeedback({ type: "error", message: err.message });
        }
    };

    const handleExportData = async () => {
        try {
            const res = await apiRequest("/privacy/export");
            const blob = new Blob([JSON.stringify(res, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `medwatch-dpdp-export-${user?.id || "account"}.json`;
            a.click();
            URL.revokeObjectURL(url);
            setFeedback({ type: "success", message: "Personal data JSON export downloaded." });
        } catch (err) {
            setFeedback({ type: "error", message: err.message });
        }
    };

    const handleDeactivateAccount = async () => {
        if (!window.confirm("Deactivate your account and revoke all sessions under DPDP Act erasure?")) return;
        try {
            await apiRequest("/privacy/delete-account", { method: "POST" });
            await logout();
            navigate("/");
        } catch (err) {
            setFeedback({ type: "error", message: err.message });
        }
    };

    const markAllRead = async () => {
        await apiRequest("/support/notifications/read-all", { method: "POST" });
        await loadNotifications();
        refreshNotifications();
    };

    const markOneRead = async (id) => {
        await apiRequest(`/support/notifications/${id}/read`, { method: "PATCH" });
        await loadNotifications();
        refreshNotifications();
    };

    return (
        <div style={{ display: "grid", gap: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div>
                    <h1 style={{ fontSize: 28 }}>Customer Account, Payments, Addresses &amp; Privacy</h1>
                    <p style={{ color: "var(--mw-muted)", fontSize: 14 }}>
                        Signed in as <strong>{user?.email}</strong> · Role: <strong>{user?.role}</strong>
                    </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <StatusBadge status={user?.emailVerified ? "verified" : "pending"} label={user?.emailVerified ? "Email Verified" : "Email Unverified"} />
                    <StatusBadge status={user?.mfaEnabled ? "verified" : "neutral"} label={user?.mfaEnabled ? "MFA Active" : "MFA Off"} />
                </div>
            </div>

            {feedback.message && <div className={`alert-box ${feedback.type}`}>{feedback.message}</div>}

            <div className="grid-2" style={{ alignItems: "start" }}>
                {/* Profile & Accessibility Preferences */}
                <section className="card">
                    <h2 style={{ fontSize: 20, marginBottom: 14 }}>Profile &amp; Preferences</h2>
                    <form onSubmit={saveProfile} className="form-grid">
                        <div className="grid-2">
                            <div className="field">
                                <label htmlFor="profName">Full Name</label>
                                <input id="profName" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
                            </div>
                            <div className="field">
                                <label htmlFor="profPhone">Phone Number</label>
                                <input id="profPhone" type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91-98..." />
                            </div>
                        </div>
                        <div className="field">
                            <label htmlFor="profCity">Preferred City</label>
                            <input id="profCity" type="text" value={city} onChange={(e) => setCity(e.target.value)} />
                        </div>
                        <div className="field">
                            <label htmlFor="profAcc">Accessibility Needs (Optional)</label>
                            <input id="profAcc" type="text" value={accessibilityNeeds} onChange={(e) => setAccessibilityNeeds(e.target.value)} placeholder="e.g. Large font, wheelchair access" />
                        </div>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                            <input type="checkbox" checked={analyticsOptIn} onChange={(e) => setAnalyticsOptIn(e.target.checked)} />
                            Allow pseudonymous service quality analytics (DPDP opt-in)
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                            <input type="checkbox" checked={notificationsOptIn} onChange={(e) => setNotificationsOptIn(e.target.checked)} />
                            Receive operational order &amp; verification notifications
                        </label>
                        <button type="submit" className="btn btn-primary">Save Preferences</button>
                    </form>
                </section>

                {/* Security: Password, MFA, Email Verify, Session Revocation */}
                <section className="card" style={{ display: "grid", gap: 16 }}>
                    <h2 style={{ fontSize: 20 }}>Account Security (OWASP Baseline)</h2>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {!user?.emailVerified && (
                            <button type="button" className="btn btn-secondary btn-sm" onClick={handleVerifyEmail}>
                                Resend Verification Email
                            </button>
                        )}
                        <button type="button" className="btn btn-outline btn-sm" onClick={handleToggleMfa}>
                            {user?.mfaEnabled ? "Disable MFA" : "Enable Pilot MFA"}
                        </button>
                        <button type="button" className="btn btn-outline btn-sm" onClick={handleRevokeSessions}>
                            Revoke All Sessions
                        </button>
                    </div>

                    {mfaCodeHint && (
                        <div className="alert-box info">
                            Pilot MFA enabled! Use verification code <strong>{mfaCodeHint}</strong> on your next login.
                        </div>
                    )}

                    <form onSubmit={handleChangePassword} className="form-grid">
                        <div className="field">
                            <label htmlFor="currPw">Current Password</label>
                            <input id="currPw" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
                        </div>
                        <div className="field">
                            <label htmlFor="newPw">New Password (12+ chars)</label>
                            <input id="newPw" type="password" minLength={12} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
                        </div>
                        <button type="submit" className="btn btn-outline">Update Password</button>
                    </form>
                </section>
            </div>

            {/* Saved Delivery Addresses & Bookmarked Medicines */}
            <div className="grid-2" style={{ alignItems: "start" }}>
                <section className="card">
                    <h2 style={{ fontSize: 20, marginBottom: 12 }}>Saved Delivery Addresses ({addresses.length})</h2>
                    {addresses.length > 0 && (
                        <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
                            {addresses.map((a) => (
                                <div key={a._id} className="card-compact" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                                    <div>
                                        <strong>{a.label}</strong> {a.isDefault && <span className="status-badge verified">Default</span>}
                                        <p style={{ fontSize: 12, color: "var(--mw-muted)", marginTop: 2 }}>
                                            {a.addressLine}, {a.locality}, {a.city} {a.pinCode}
                                        </p>
                                    </div>
                                    <button type="button" className="btn btn-outline btn-sm" onClick={() => removeAddress(a._id)}>Remove</button>
                                </div>
                            ))}
                        </div>
                    )}
                    <form onSubmit={addAddress} className="form-grid" style={{ gap: 10 }}>
                        <div className="grid-2">
                            <input placeholder="Label (Home / Work)" value={newAddr.label} onChange={(e) => setNewAddr({ ...newAddr, label: e.target.value })} style={{ padding: 8, border: "1px solid #C6D8DA", borderRadius: 8 }} />
                            <input placeholder="PIN Code" value={newAddr.pinCode} onChange={(e) => setNewAddr({ ...newAddr, pinCode: e.target.value })} style={{ padding: 8, border: "1px solid #C6D8DA", borderRadius: 8 }} />
                        </div>
                        <input placeholder="Street / House / Landmark" value={newAddr.addressLine} onChange={(e) => setNewAddr({ ...newAddr, addressLine: e.target.value })} required style={{ padding: 8, border: "1px solid #C6D8DA", borderRadius: 8 }} />
                        <div className="grid-2">
                            <input placeholder="Locality" value={newAddr.locality} onChange={(e) => setNewAddr({ ...newAddr, locality: e.target.value })} style={{ padding: 8, border: "1px solid #C6D8DA", borderRadius: 8 }} />
                            <input placeholder="City" value={newAddr.city} onChange={(e) => setNewAddr({ ...newAddr, city: e.target.value })} style={{ padding: 8, border: "1px solid #C6D8DA", borderRadius: 8 }} />
                        </div>
                        <button type="submit" className="btn btn-secondary btn-sm">+ Add Delivery Address</button>
                    </form>
                </section>

                <section className="card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <h2 style={{ fontSize: 20 }}>Saved Medicines &amp; Health List ({savedMeds.length})</h2>
                        <Link to="/catalog" className="btn btn-outline btn-sm">Browse Catalog</Link>
                    </div>
                    {savedMeds.length === 0 ? (
                        <p style={{ color: "var(--mw-muted)", fontSize: 13 }}>Bookmark medicines from the Catalog using the ☆ button to keep quick references here.</p>
                    ) : (
                        <div style={{ display: "grid", gap: 8 }}>
                            {savedMeds.map((m) => (
                                <Link key={m._id} to={`/catalog?q=${encodeURIComponent(m.name)}`} className="card-compact" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <SmartImage src={m.imageUrl} fallbackSrc="/images/meds/tablet.svg" alt={m.name} height={48} style={{ width: 64 }} />
                                    <div style={{ flex: 1 }}>
                                        <strong>{m.name}</strong>
                                        <p style={{ fontSize: 12, color: "var(--mw-muted)" }}>{m.genericName} · {m.category}</p>
                                    </div>
                                    <strong style={{ color: "var(--mw-teal)" }}>₹{m.mrp}</strong>
                                </Link>
                            ))}
                        </div>
                    )}
                </section>
            </div>

            {/* Payment Transaction History */}
            <section className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h2 style={{ fontSize: 20 }}>Payment Transactions &amp; Receipts ({payments.length})</h2>
                    <Link to="/orders" className="btn btn-outline btn-sm">Open Orders</Link>
                </div>
                {payments.length === 0 ? (
                    <p style={{ color: "var(--mw-muted)", fontSize: 13 }}>No gateway transactions yet.</p>
                ) : (
                    <div className="table-wrap">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Transaction ID</th>
                                    <th>Order</th>
                                    <th>Method</th>
                                    <th>Amount</th>
                                    <th>Status</th>
                                    <th>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {payments.map((tx) => (
                                    <tr key={tx._id}>
                                        <td><code>{tx.transactionId}</code></td>
                                        <td>{tx.order?.orderNumber || "Pending"}</td>
                                        <td>{tx.methodDetails?.label || tx.method}</td>
                                        <td><strong>₹{tx.costBreakdown?.totalAmount || 0}</strong></td>
                                        <td><StatusBadge status={tx.status === "captured" ? "verified" : tx.status === "refunded" ? "rejected" : "pending"} label={tx.status} /></td>
                                        <td>{new Date(tx.createdAt).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* Notification Center */}
            <section className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <h2 style={{ fontSize: 20 }}>Notification Center</h2>
                    <button type="button" className="btn btn-outline btn-sm" onClick={markAllRead}>
                        Mark All Read
                    </button>
                </div>
                {notifications.length === 0 ? (
                    <p style={{ color: "var(--mw-muted)" }}>No notifications yet.</p>
                ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                        {notifications.map((n) => (
                            <div key={n._id} className="card-compact" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, background: n.isRead ? "#fff" : "#F0FAFA" }}>
                                <div>
                                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                        <strong>{n.title}</strong>
                                        <span className="status-badge neutral">{n.category}</span>
                                        {!n.isRead && <span className="status-badge active">New</span>}
                                    </div>
                                    <p style={{ fontSize: 13, color: "var(--mw-muted)", marginTop: 4 }}>{n.message}</p>
                                </div>
                                {!n.isRead && (
                                    <button type="button" className="btn btn-outline btn-sm" onClick={() => markOneRead(n._id)}>
                                        Mark Read
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* DPDP Privacy Rights */}
            <section className="card">
                <h2 style={{ fontSize: 20, marginBottom: 8 }}>DPDP Act 2023 &amp; Data Rights</h2>
                <p style={{ fontSize: 13, color: "var(--mw-muted)", marginBottom: 14 }}>
                    You can export all personal records stored in this platform or request account deactivation and session revocation at any time.
                </p>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <button type="button" className="btn btn-secondary" onClick={handleExportData}>
                        Download My Data (JSON Export)
                    </button>
                    {user?.role !== "admin" && (
                        <button type="button" className="btn btn-danger" onClick={handleDeactivateAccount}>
                            Deactivate &amp; Erase Account
                        </button>
                    )}
                </div>
            </section>
        </div>
    );
}
