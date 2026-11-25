import { useEffect, useState, useCallback } from "react";
import { apiRequest } from "../services/api";
import { StatusBadge, SkeletonCards } from "../components/StatusBadge";

const SAMPLE_CSV = `medicineName,sellingPrice,stockQuantity,batchNumber,expiryDate
Paracetamol 500mg,28,80,B-PARA-26,2027-06-30
Vitamin C,17,45,B-VITC-26,2027-03-15
Vitamin D3,21,8,B-VITD-26,2026-12-10`;

export default function PartnerDashboard() {
    const [tab, setTab] = useState("overview");
    const [pharmacies, setPharmacies] = useState([]);
    const [selectedPharmacyId, setSelectedPharmacyId] = useState("");
    const [medicines, setMedicines] = useState([]);
    const [medFilter, setMedFilter] = useState("");
    const [prices, setPrices] = useState([]);
    const [orders, setOrders] = useState([]);
    const [reports, setReports] = useState(null);
    const [insights, setInsights] = useState(null);
    const [auditLogs, setAuditLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [feedback, setFeedback] = useState({ type: "", message: "" });

    // Register pharmacy form
    const [regForm, setRegForm] = useState({
        name: "",
        address: "",
        city: "Jalandhar",
        phone: "",
        openingHours: "08:00 AM - 10:00 PM (Mon–Sun)",
        licenseNumber: "",
        licenseExpiry: "",
        serviceArea: "Central Sector",
        accessibilityFeatures: "Step-free entrance, Printed large-font labels"
    });

    // Price & inventory form
    const [invForm, setInvForm] = useState({
        medicine: "",
        sellingPrice: "",
        stockQuantity: 40,
        lowStockThreshold: 10,
        batchNumber: "DEMO-B101",
        expiryDate: "2027-06-30",
        supplierName: "Pilot Wellness Distributor",
        recallFlag: false,
        recallNotice: ""
    });

    // CSV & OCR
    const [csvText, setCsvText] = useState(SAMPLE_CSV);
    const [csvPreview, setCsvPreview] = useState(null);
    const [ocrText, setOcrText] = useState("Batch: B-ZINC-99 Exp: 2027-08-01 MRP: 32 Qty: 60");
    const [ocrExtracted, setOcrExtracted] = useState(null);

    // Branch / Staff / Supplier / Verification Docs
    const [branchForm, setBranchForm] = useState({ name: "", address: "", city: "Jalandhar", phone: "" });
    const [staffForm, setStaffForm] = useState({ name: "", email: "", staffRole: "pharmacist" });
    const [supplierForm, setSupplierForm] = useState({ name: "", licenseId: "", contact: "" });
    const [docForm, setDocForm] = useState({
        documentType: "drug_licence",
        title: "Retail Drug License Certificate",
        referenceNumber: "",
        fileName: ""
    });
    const [submittingDoc, setSubmittingDoc] = useState(false);

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const [phRes, medRes, prRes, ordRes, repRes, insRes] = await Promise.all([
                apiRequest("/pharmacies/my"),
                apiRequest("/medicines?limit=100"),
                apiRequest("/prices/my"),
                apiRequest("/orders/partner-queue"),
                apiRequest("/prices/my/reports"),
                apiRequest("/ai/partner-insights")
            ]);
            const phList = phRes.data || [];
            setPharmacies(phList);
            if (phList.length > 0 && !selectedPharmacyId) {
                setSelectedPharmacyId(phList[0]._id);
            }
            const meds = medRes.data || [];
            setMedicines(meds);
            if (meds.length > 0 && !invForm.medicine) {
                setInvForm((f) => ({ ...f, medicine: meds[0]._id }));
            }
            setPrices(prRes.data || []);
            setOrders(ordRes.data || []);
            setReports(repRes);
            setInsights(insRes.data || null);
        } catch (err) {
            setFeedback({ type: "error", message: err.message || "Failed to load pharmacy dashboard." });
        } finally {
            setLoading(false);
        }
    }, [selectedPharmacyId, invForm.medicine]);

    useEffect(() => {
        loadAll();
    }, []);

    useEffect(() => {
        if (selectedPharmacyId) {
            apiRequest(`/pharmacies/${selectedPharmacyId}/audit`)
                .then((res) => setAuditLogs(res.data || []))
                .catch(() => setAuditLogs([]));
        }
    }, [selectedPharmacyId]);

    const selectedPharmacy = pharmacies.find((p) => p._id === selectedPharmacyId) || pharmacies[0] || null;

    const registerPharmacy = async (e) => {
        e.preventDefault();
        setFeedback({ type: "", message: "" });
        try {
            const res = await apiRequest("/pharmacies/register", {
                method: "POST",
                body: {
                    ...regForm,
                    accessibilityFeatures: regForm.accessibilityFeatures
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean)
                }
            });
            setFeedback({ type: "success", message: res.message });
            setRegForm({ ...regForm, name: "", address: "", phone: "", licenseNumber: "" });
            await loadAll();
            if (res.data?._id) setSelectedPharmacyId(res.data._id);
        } catch (err) {
            setFeedback({ type: "error", message: err.message });
        }
    };

    const saveInventory = async (e) => {
        e.preventDefault();
        if (!selectedPharmacy) return;
        setFeedback({ type: "", message: "" });
        try {
            const res = await apiRequest("/prices", {
                method: "POST",
                body: {
                    medicine: invForm.medicine,
                    pharmacy: selectedPharmacy._id,
                    sellingPrice: Number(invForm.sellingPrice),
                    stockQuantity: Number(invForm.stockQuantity),
                    lowStockThreshold: Number(invForm.lowStockThreshold),
                    batchNumber: invForm.batchNumber,
                    expiryDate: invForm.expiryDate,
                    supplierName: invForm.supplierName,
                    recallFlag: invForm.recallFlag,
                    recallNotice: invForm.recallNotice,
                    isAvailable: true
                }
            });
            setFeedback({ type: "success", message: res.message });
            await loadAll();
        } catch (err) {
            setFeedback({ type: "error", message: err.message });
        }
    };

    const runCsvPreview = async () => {
        if (!selectedPharmacy) return;
        try {
            const res = await apiRequest("/prices/csv-preview", {
                method: "POST",
                body: { pharmacyId: selectedPharmacy._id, csvText }
            });
            setCsvPreview(res);
        } catch (err) {
            setFeedback({ type: "error", message: err.message });
        }
    };

    const commitCsvImport = async () => {
        if (!selectedPharmacy || !csvPreview) return;
        try {
            const res = await apiRequest("/prices/csv-import", {
                method: "POST",
                body: { pharmacyId: selectedPharmacy._id, rows: csvPreview.preview }
            });
            setFeedback({ type: "success", message: res.message });
            setCsvPreview(null);
            await loadAll();
        } catch (err) {
            setFeedback({ type: "error", message: err.message });
        }
    };

    const runOcrExtract = async () => {
        try {
            const res = await apiRequest("/ai/ocr-extract", {
                method: "POST",
                body: { labelText: ocrText }
            });
            setOcrExtracted(res);
        } catch (err) {
            setFeedback({ type: "error", message: err.message });
        }
    };

    const applyOcrToInventory = () => {
        if (!ocrExtracted?.extracted) return;
        const ext = ocrExtracted.extracted;
        setInvForm((f) => ({
            ...f,
            batchNumber: ext.batchNumber || f.batchNumber,
            expiryDate: ext.expiryDate || f.expiryDate,
            sellingPrice: ext.suggestedPrice ?? f.sellingPrice,
            stockQuantity: ext.stockQuantity ?? f.stockQuantity
        }));
        setTab("inventory");
        setFeedback({ type: "info", message: "Extracted fields copied to inventory form — confirm and save." });
    };

    const submitVerificationDocs = async (e) => {
        e.preventDefault();
        if (!selectedPharmacy) return;
        setSubmittingDoc(true);
        setFeedback({ type: "", message: "" });
        try {
            const res = await apiRequest(`/pharmacies/${selectedPharmacy._id}/submit-verification`, {
                method: "POST",
                body: docForm
            });
            setFeedback({ type: "success", message: res.message });
            setDocForm({
                documentType: "drug_licence",
                title: "Retail Drug License Certificate",
                referenceNumber: "",
                fileName: ""
            });
            await loadAll();
        } catch (err) {
            setFeedback({ type: "error", message: err.message });
        } finally {
            setSubmittingDoc(false);
        }
    };

    const transitionPartnerOrder = async (orderId, nextStatus, note = "", assignedCourier = undefined) => {
        try {
            const res = await apiRequest(`/orders/${orderId}/transition`, {
                method: "PATCH",
                body: { nextStatus, note, assignedCourier }
            });
            setFeedback({ type: "success", message: res.message });
            await loadAll();
        } catch (err) {
            setFeedback({ type: "error", message: err.message });
        }
    };

    const addBranch = async (e) => {
        e.preventDefault();
        if (!selectedPharmacy) return;
        try {
            await apiRequest(`/pharmacies/${selectedPharmacy._id}/branches`, { method: "POST", body: branchForm });
            setBranchForm({ name: "", address: "", city: "Jalandhar", phone: "" });
            await loadAll();
        } catch (err) {
            setFeedback({ type: "error", message: err.message });
        }
    };

    const addStaff = async (e) => {
        e.preventDefault();
        if (!selectedPharmacy) return;
        try {
            await apiRequest(`/pharmacies/${selectedPharmacy._id}/staff`, { method: "POST", body: staffForm });
            setStaffForm({ name: "", email: "", staffRole: "pharmacist" });
            await loadAll();
        } catch (err) {
            setFeedback({ type: "error", message: err.message });
        }
    };

    const addSupplier = async (e) => {
        e.preventDefault();
        if (!selectedPharmacy) return;
        try {
            await apiRequest(`/pharmacies/${selectedPharmacy._id}/suppliers`, { method: "POST", body: supplierForm });
            setSupplierForm({ name: "", licenseId: "", contact: "" });
            await loadAll();
        } catch (err) {
            setFeedback({ type: "error", message: err.message });
        }
    };

    const tabs = [
        { id: "overview", label: "Overview & Profile" },
        { id: "inventory", label: "Inventory & Pricing" },
        { id: "import", label: "CSV Import & OCR" },
        { id: "orders", label: `Order Queue (${orders.length})` },
        { id: "org", label: "Staff, Branches & POS" },
        { id: "insights", label: "Alerts & Change Log" }
    ];

    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
                <div>
                    <h1 style={{ fontSize: 28 }}>Pharmacy Owner Dashboard</h1>
                    <p style={{ color: "var(--mw-muted)", fontSize: 14 }}>
                        Manage your verified pharmacy profile, medicine listings, pricing, inventory batches, and order queue.
                    </p>
                </div>
                {pharmacies.length > 0 && (
                    <select
                        aria-label="Active pharmacy workspace"
                        value={selectedPharmacy?._id || ""}
                        onChange={(e) => setSelectedPharmacyId(e.target.value)}
                        style={{ padding: "9px 12px", border: "1px solid #C6D8DA", borderRadius: 8, fontWeight: 600 }}
                    >
                        {pharmacies.map((p) => (
                            <option key={p._id} value={p._id}>
                                {p.name} ({p.verificationStatus || (p.isVerified ? "verified" : "pending")})
                            </option>
                        ))}
                    </select>
                )}
            </div>

            {feedback.message && <div className={`alert-box ${feedback.type}`}>{feedback.message}</div>}

            {loading ? (
                <SkeletonCards count={4} />
            ) : (
                <div className="console-layout">
                    <aside className="console-sidebar" aria-label="Pharmacy dashboard sections">
                        {tabs.map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                className={`console-tab ${tab === t.id ? "active" : ""}`}
                                onClick={() => setTab(t.id)}
                            >
                                <span>{t.label}</span>
                            </button>
                        ))}
                    </aside>

                    <div style={{ display: "grid", gap: 20 }}>
                        {/* KPI Cards */}
                        <div className="grid-4">
                            <div className="card-compact">
                                <span style={{ fontSize: 12, color: "var(--mw-muted)" }}>Owned Pharmacies</span>
                                <strong style={{ fontSize: 24, color: "var(--mw-teal)", display: "block" }}>{pharmacies.length}</strong>
                            </div>
                            <div className="card-compact">
                                <span style={{ fontSize: 12, color: "var(--mw-muted)" }}>Verification</span>
                                <div style={{ marginTop: 6 }}>
                                    <StatusBadge status={selectedPharmacy?.isVerified ? "verified" : selectedPharmacy?.verificationStatus || "pending"} />
                                </div>
                            </div>
                            <div className="card-compact">
                                <span style={{ fontSize: 12, color: "var(--mw-muted)" }}>Managed SKUs</span>
                                <strong style={{ fontSize: 24, color: "var(--mw-teal)", display: "block" }}>{prices.length}</strong>
                            </div>
                            <div className="card-compact">
                                <span style={{ fontSize: 12, color: "var(--mw-muted)" }}>Low Stock / Expiry Alerts</span>
                                <strong style={{ fontSize: 24, color: "var(--mw-amber)", display: "block" }}>
                                    {(reports?.summary?.lowStockCount || 0) + (reports?.summary?.expiringSoonCount || 0)}
                                </strong>
                            </div>
                        </div>

                        {selectedPharmacy && !selectedPharmacy.isVerified && selectedPharmacy.verificationStatus === "pending" && (
                            <div className="alert-box warning" role="status">
                                <div>
                                    <strong>Verification Pending:</strong> Submit your pharmacy license and verification details below. Public medicine listings remain disabled until an administrator approves your pharmacy.
                                </div>
                            </div>
                        )}

                        {selectedPharmacy && !selectedPharmacy.isVerified && selectedPharmacy.verificationStatus === "under_review" && (
                            <div className="alert-box info" role="status">
                                <div>
                                    <strong>Verification Under Review:</strong> Your pharmacy documentation has been submitted and is currently being reviewed by our compliance team.
                                </div>
                            </div>
                        )}

                        {selectedPharmacy?.verificationStatus === "rejected" && (
                            <div className="alert-box error">
                                <div>
                                    <strong>Verification Rejected:</strong> {selectedPharmacy.rejectionReason || "Please update license details and resubmit verification documents."}
                                </div>
                            </div>
                        )}

                        {selectedPharmacy?.isVerified && (
                            <div className="alert-box success" role="status">
                                <div>
                                    <strong>Verified Pharmacy:</strong> Your pharmacy is verified and active. Published medicine prices are visible to customers.
                                </div>
                            </div>
                        )}

                        {selectedPharmacy?.renewalReminder && selectedPharmacy.renewalReminder !== "valid" && (
                            <div className="alert-box warning">
                                License renewal reminder: {selectedPharmacy.renewalReminder === "expired" ? "License expired!" : `Expires in ${selectedPharmacy.daysUntilExpiry} days.`}
                            </div>
                        )}

                        {tab === "overview" && (
                            <div className="grid-2" style={{ alignItems: "start" }}>
                                <section className="card">
                                    <h2 style={{ fontSize: 20, marginBottom: 12 }}>Active Business Profile</h2>
                                    {!selectedPharmacy ? (
                                        <p style={{ color: "var(--mw-muted)" }}>No pharmacy registered yet. Register your first pharmacy on the right.</p>
                                    ) : (
                                        <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
                                            <div><strong>Name:</strong> {selectedPharmacy.name}</div>
                                            <div><strong>Address:</strong> {selectedPharmacy.address}, {selectedPharmacy.city}{selectedPharmacy.state ? `, ${selectedPharmacy.state}` : ""}{selectedPharmacy.pinCode ? ` — ${selectedPharmacy.pinCode}` : ""}</div>
                                            <div><strong>Hours:</strong> {selectedPharmacy.openingHours}</div>
                                            <div><strong>License:</strong> {selectedPharmacy.licenseNumber || "Not provided"}</div>
                                            <div><strong>Accessibility:</strong> {(selectedPharmacy.accessibilityFeatures || []).join(", ")}</div>
                                            <div><strong>Sandbox POS Key:</strong> <code>{selectedPharmacy.posSandboxKey || "N/A"}</code></div>

                                            {!selectedPharmacy.isVerified && (
                                                <form onSubmit={submitVerificationDocs} style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #E2E8F0", display: "grid", gap: 10 }}>
                                                    <strong style={{ fontSize: 15 }}>Submit Verification Documents</strong>
                                                    <div className="grid-2">
                                                        <select
                                                            aria-label="Document type"
                                                            value={docForm.documentType}
                                                            onChange={(e) => setDocForm({ ...docForm, documentType: e.target.value })}
                                                            style={{ padding: 8, border: "1px solid #C6D8DA", borderRadius: 6 }}
                                                        >
                                                            <option value="drug_licence">Drug License Certificate</option>
                                                            <option value="gst_certificate">GST / Trade Registration</option>
                                                            <option value="pharmacy_registration">Pharmacy Registration</option>
                                                            <option value="owner_id">Authorized Owner ID</option>
                                                        </select>
                                                        <input
                                                            placeholder="Document reference / license ID"
                                                            value={docForm.referenceNumber}
                                                            onChange={(e) => setDocForm({ ...docForm, referenceNumber: e.target.value })}
                                                            style={{ padding: 8, border: "1px solid #C6D8DA", borderRadius: 6 }}
                                                            required
                                                        />
                                                    </div>
                                                    <input
                                                        placeholder="Document title (e.g., Retail Drug License Form 20/21)"
                                                        value={docForm.title}
                                                        onChange={(e) => setDocForm({ ...docForm, title: e.target.value })}
                                                        style={{ padding: 8, border: "1px solid #C6D8DA", borderRadius: 6 }}
                                                        required
                                                    />
                                                    <button type="submit" className="btn btn-primary btn-sm" disabled={submittingDoc}>
                                                        {submittingDoc ? "Submitting..." : "Submit for Verification Review"}
                                                    </button>
                                                </form>
                                            )}
                                        </div>
                                    )}
                                </section>

                                <section className="card">
                                    <h2 style={{ fontSize: 20, marginBottom: 12 }}>Register New Pharmacy Branch/Entity</h2>
                                    <form onSubmit={registerPharmacy} className="form-grid">
                                        <div className="field">
                                            <label htmlFor="pName">Pharmacy Name</label>
                                            <input id="pName" value={regForm.name} onChange={(e) => setRegForm({ ...regForm, name: e.target.value })} required />
                                        </div>
                                        <div className="field">
                                            <label htmlFor="pAddr">Address</label>
                                            <input id="pAddr" value={regForm.address} onChange={(e) => setRegForm({ ...regForm, address: e.target.value })} required />
                                        </div>
                                        <div className="grid-2">
                                            <div className="field">
                                                <label htmlFor="pCity">City</label>
                                                <input id="pCity" value={regForm.city} onChange={(e) => setRegForm({ ...regForm, city: e.target.value })} required />
                                            </div>
                                            <div className="field">
                                                <label htmlFor="pPhone">Phone</label>
                                                <input id="pPhone" value={regForm.phone} onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })} />
                                            </div>
                                        </div>
                                        <div className="grid-2">
                                            <div className="field">
                                                <label htmlFor="pLic">Drug License Number</label>
                                                <input id="pLic" value={regForm.licenseNumber} onChange={(e) => setRegForm({ ...regForm, licenseNumber: e.target.value })} placeholder="PB-JAL-2026-XXX" />
                                            </div>
                                            <div className="field">
                                                <label htmlFor="pExp">License Expiry</label>
                                                <input id="pExp" type="date" value={regForm.licenseExpiry} onChange={(e) => setRegForm({ ...regForm, licenseExpiry: e.target.value })} />
                                            </div>
                                        </div>
                                        <div className="field">
                                            <label htmlFor="pAcc">Accessibility Features (comma-separated)</label>
                                            <input id="pAcc" value={regForm.accessibilityFeatures} onChange={(e) => setRegForm({ ...regForm, accessibilityFeatures: e.target.value })} />
                                        </div>
                                        <button type="submit" className="btn btn-primary">Submit for Admin Verification</button>
                                    </form>
                                </section>
                            </div>
                        )}

                        {tab === "inventory" && (
                            <div style={{ display: "grid", gap: 20 }}>
                                <section className="card">
                                    <h2 style={{ fontSize: 20, marginBottom: 12 }}>Add / Update Inventory &amp; Simulated Price</h2>
                                    {!selectedPharmacy?.isVerified && (
                                        <div className="alert-box warning">
                                            Unverified pharmacies cannot publish prices to the public directory until approved by an admin.
                                        </div>
                                    )}
                                    <form onSubmit={saveInventory} className="grid-2">
                                        <div className="field">
                                            <label htmlFor="invMedSearch">Filter Catalog Medicines (Search 1,000+)</label>
                                            <div style={{ display: "flex", gap: 6 }}>
                                                <input
                                                    id="invMedSearch"
                                                    placeholder="Type medicine name..."
                                                    value={medFilter}
                                                    onChange={(e) => setMedFilter(e.target.value)}
                                                />
                                                <button
                                                    type="button"
                                                    className="btn btn-outline btn-sm"
                                                    onClick={async () => {
                                                        const res = await apiRequest(`/medicines?limit=100&q=${encodeURIComponent(medFilter.trim())}`);
                                                        const list = res.data || [];
                                                        setMedicines(list);
                                                        if (list.length > 0) setInvForm((f) => ({ ...f, medicine: list[0]._id }));
                                                    }}
                                                >
                                                    Search
                                                </button>
                                            </div>
                                        </div>
                                        <div className="field">
                                            <label htmlFor="invMed">Catalog Item ({medicines.length} loaded)</label>
                                            <select id="invMed" value={invForm.medicine} onChange={(e) => setInvForm({ ...invForm, medicine: e.target.value })}>
                                                {medicines.map((m) => (
                                                    <option key={m._id} value={m._id}>{m.name} (Sample MRP ₹{m.mrp})</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="field">
                                            <label htmlFor="invPrice">Simulated Selling Price (₹)</label>
                                            <input id="invPrice" type="number" min="1" step="0.5" value={invForm.sellingPrice} onChange={(e) => setInvForm({ ...invForm, sellingPrice: e.target.value })} required />
                                        </div>
                                        <div className="field">
                                            <label htmlFor="invBatch">Batch Number</label>
                                            <input id="invBatch" value={invForm.batchNumber} onChange={(e) => setInvForm({ ...invForm, batchNumber: e.target.value })} />
                                        </div>
                                        <div className="field">
                                            <label htmlFor="invExpiry">Expiry Date</label>
                                            <input id="invExpiry" type="date" value={invForm.expiryDate} onChange={(e) => setInvForm({ ...invForm, expiryDate: e.target.value })} />
                                        </div>
                                        <div className="field">
                                            <label htmlFor="invStock">Stock Quantity</label>
                                            <input id="invStock" type="number" min="0" value={invForm.stockQuantity} onChange={(e) => setInvForm({ ...invForm, stockQuantity: e.target.value })} />
                                        </div>
                                        <div className="field">
                                            <label htmlFor="invSupp">Supplier Name</label>
                                            <input id="invSupp" value={invForm.supplierName} onChange={(e) => setInvForm({ ...invForm, supplierName: e.target.value })} />
                                        </div>
                                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                                            <input type="checkbox" checked={invForm.recallFlag} onChange={(e) => setInvForm({ ...invForm, recallFlag: e.target.checked })} />
                                            Mark Recall Notice
                                        </label>
                                        <div className="field">
                                            <label htmlFor="invRecall">Recall Note (if flagged)</label>
                                            <input id="invRecall" value={invForm.recallNotice} onChange={(e) => setInvForm({ ...invForm, recallNotice: e.target.value })} />
                                        </div>
                                        <div style={{ gridColumn: "1 / -1" }}>
                                            <button type="submit" className="btn btn-primary" disabled={!selectedPharmacy?.isVerified}>
                                                Save Inventory &amp; Price
                                            </button>
                                        </div>
                                    </form>
                                </section>

                                <section className="card">
                                    <h3 style={{ fontSize: 18, marginBottom: 12 }}>Your Inventory &amp; Batch Table ({prices.length})</h3>
                                    <div className="table-wrap">
                                        <table className="data-table">
                                            <thead>
                                                <tr>
                                                    <th>Medicine</th>
                                                    <th>Price</th>
                                                    <th>Stock</th>
                                                    <th>Batch &amp; Expiry</th>
                                                    <th>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {prices.map((p) => (
                                                    <tr key={p._id}>
                                                        <td><strong>{p.medicine?.name}</strong></td>
                                                        <td>₹{p.sellingPrice}</td>
                                                        <td>{p.stockQuantity ?? 50}</td>
                                                        <td>{p.batchNumber} · {p.expiryDate ? new Date(p.expiryDate).toLocaleDateString() : "N/A"}</td>
                                                        <td>
                                                            {p.recallFlag ? <StatusBadge status="rejected" label="Recalled" /> : (p.stockQuantity ?? 50) <= (p.lowStockThreshold ?? 10) ? <StatusBadge status="pending" label="Low Stock" /> : <StatusBadge status="verified" label="Healthy" />}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </section>
                            </div>
                        )}

                        {tab === "import" && (
                            <div className="grid-2" style={{ alignItems: "start" }}>
                                <section className="card">
                                    <h2 style={{ fontSize: 20, marginBottom: 10 }}>CSV Import with Validation &amp; Preview</h2>
                                    <div className="field" style={{ marginBottom: 12 }}>
                                        <label htmlFor="csvInput">CSV Data (medicineName,sellingPrice,stockQuantity,batchNumber,expiryDate)</label>
                                        <textarea id="csvInput" rows={6} value={csvText} onChange={(e) => setCsvText(e.target.value)} />
                                    </div>
                                    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                                        <button type="button" className="btn btn-secondary btn-sm" onClick={runCsvPreview}>Validate &amp; Preview</button>
                                        {csvPreview && csvPreview.validCount > 0 && (
                                            <button type="button" className="btn btn-primary btn-sm" onClick={commitCsvImport} disabled={!csvPreview.pharmacyVerified}>
                                                Import {csvPreview.validCount} Valid Rows
                                            </button>
                                        )}
                                    </div>
                                    {csvPreview && (
                                        <div className="table-wrap">
                                            <table className="data-table">
                                                <thead>
                                                    <tr><th>Row</th><th>Medicine</th><th>Price</th><th>Validation</th></tr>
                                                </thead>
                                                <tbody>
                                                    {csvPreview.preview.map((r) => (
                                                        <tr key={r.rowNumber}>
                                                            <td>{r.rowNumber}</td>
                                                            <td>{r.medicineName}</td>
                                                            <td>₹{r.sellingPrice}</td>
                                                            <td>{r.valid ? <StatusBadge status="verified" label="Valid" /> : <StatusBadge status="rejected" label={r.errors.join("; ")} />}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </section>

                                <section className="card">
                                    <h2 style={{ fontSize: 20, marginBottom: 10 }}>OCR Label Metadata Extractor (Human-in-the-Loop)</h2>
                                    <p style={{ fontSize: 13, color: "var(--mw-muted)", marginBottom: 10 }}>
                                        Paste non-sensitive packaging or invoice text to extract batch, expiry, and MRP. Always requires human confirmation before saving.
                                    </p>
                                    <div className="field" style={{ marginBottom: 10 }}>
                                        <label htmlFor="ocrInput">Label / Invoice Text</label>
                                        <textarea id="ocrInput" rows={4} value={ocrText} onChange={(e) => setOcrText(e.target.value)} />
                                    </div>
                                    <button type="button" className="btn btn-secondary btn-sm" onClick={runOcrExtract}>Extract Metadata</button>
                                    {ocrExtracted && (
                                        <div className="card-compact" style={{ marginTop: 12, background: "var(--mw-bg)" }}>
                                            <p style={{ fontSize: 13 }}>Batch: <strong>{ocrExtracted.extracted.batchNumber}</strong></p>
                                            <p style={{ fontSize: 13 }}>Expiry: <strong>{ocrExtracted.extracted.expiryDate || "Not detected"}</strong></p>
                                            <p style={{ fontSize: 13 }}>Price: <strong>{ocrExtracted.extracted.suggestedPrice ?? "N/A"}</strong> · Qty: <strong>{ocrExtracted.extracted.stockQuantity ?? "N/A"}</strong></p>
                                            <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={applyOcrToInventory}>
                                                Confirm &amp; Prefill Inventory Form
                                            </button>
                                        </div>
                                    )}
                                </section>
                            </div>
                        )}

                        {tab === "orders" && (
                            <section className="card">
                                <h2 style={{ fontSize: 20, marginBottom: 14 }}>Pharmacy Fulfillment Queue</h2>
                                {orders.length === 0 ? (
                                    <p style={{ color: "var(--mw-muted)" }}>No orders assigned to your pharmacies yet.</p>
                                ) : (
                                    <div style={{ display: "grid", gap: 12 }}>
                                        {orders.map((ord) => (
                                            <div key={ord._id} className="card-compact">
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                                                    <div>
                                                        <strong>{ord.orderNumber}</strong> · Customer: {ord.customer?.name || "Customer"} · Zone: {ord.serviceArea}
                                                    </div>
                                                    <StatusBadge status={ord.status} />
                                                </div>
                                                <p style={{ fontSize: 13, color: "var(--mw-muted)", marginBottom: 10 }}>
                                                    Items: {(ord.items || []).map((i) => `${i.name} x${i.quantity}`).join(", ")} · Total ₹{ord.costBreakdown?.totalAmount} · Payment: <strong>{ord.paymentStatus}</strong> ({ord.paymentMethod || "Gateway"})
                                                    {ord.deliveryDetails?.addressLine ? ` · Address: ${ord.deliveryDetails.addressLine}` : ""}
                                                </p>
                                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                                    {ord.status === "submitted" && (
                                                        <button type="button" className="btn btn-primary btn-sm" onClick={() => transitionPartnerOrder(ord._id, "accepted", "Accepted by pharmacy")}>Accept</button>
                                                    )}
                                                    {ord.status === "accepted" && (
                                                        <button type="button" className="btn btn-primary btn-sm" onClick={() => transitionPartnerOrder(ord._id, "preparing", "Packing wellness kit")}>Start Preparing</button>
                                                    )}
                                                    {ord.status === "preparing" && (
                                                        <button type="button" className="btn btn-primary btn-sm" onClick={() => transitionPartnerOrder(ord._id, "dispatched", "Dispatched with local courier", "Courier #04")}>Dispatch Courier</button>
                                                    )}
                                                    {["dispatched", "delayed", "rescheduled"].includes(ord.status) && (
                                                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => transitionPartnerOrder(ord._id, "delivered", "Delivered at drop point")}>Mark Delivered</button>
                                                    )}
                                                    {["accepted", "preparing", "dispatched"].includes(ord.status) && (
                                                        <button type="button" className="btn btn-outline btn-sm" onClick={() => transitionPartnerOrder(ord._id, "delayed", "Pharmacy flagged delivery delay")}>Flag Delayed</button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>
                        )}

                        {tab === "org" && selectedPharmacy && (
                            <div className="grid-3" style={{ alignItems: "start" }}>
                                <section className="card">
                                    <h3 style={{ fontSize: 17, marginBottom: 10 }}>Branches ({selectedPharmacy.branches?.length || 0})</h3>
                                    <form onSubmit={addBranch} className="form-grid" style={{ marginBottom: 12 }}>
                                        <input placeholder="Branch name" value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} required style={{ padding: 8, border: "1px solid #C6D8DA", borderRadius: 6 }} />
                                        <input placeholder="Address" value={branchForm.address} onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })} required style={{ padding: 8, border: "1px solid #C6D8DA", borderRadius: 6 }} />
                                        <input placeholder="City" value={branchForm.city} onChange={(e) => setBranchForm({ ...branchForm, city: e.target.value })} required style={{ padding: 8, border: "1px solid #C6D8DA", borderRadius: 6 }} />
                                        <button type="submit" className="btn btn-secondary btn-sm">Add Branch</button>
                                    </form>
                                    <ul style={{ paddingLeft: 16, fontSize: 13 }}>
                                        {(selectedPharmacy.branches || []).map((b) => (
                                            <li key={b._id}>{b.name} — {b.city}</li>
                                        ))}
                                    </ul>
                                </section>

                                <section className="card">
                                    <h3 style={{ fontSize: 17, marginBottom: 10 }}>Staff Roles ({selectedPharmacy.staff?.length || 0})</h3>
                                    <form onSubmit={addStaff} className="form-grid" style={{ marginBottom: 12 }}>
                                        <input placeholder="Staff name" value={staffForm.name} onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })} required style={{ padding: 8, border: "1px solid #C6D8DA", borderRadius: 6 }} />
                                        <input type="email" placeholder="Staff email" value={staffForm.email} onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })} required style={{ padding: 8, border: "1px solid #C6D8DA", borderRadius: 6 }} />
                                        <select value={staffForm.staffRole} onChange={(e) => setStaffForm({ ...staffForm, staffRole: e.target.value })} style={{ padding: 8, border: "1px solid #C6D8DA", borderRadius: 6 }}>
                                            <option value="pharmacist">Pharmacist</option>
                                            <option value="manager">Manager</option>
                                            <option value="dispatcher">Dispatcher</option>
                                        </select>
                                        <button type="submit" className="btn btn-secondary btn-sm">Add Staff</button>
                                    </form>
                                    <ul style={{ paddingLeft: 16, fontSize: 13 }}>
                                        {(selectedPharmacy.staff || []).map((s) => (
                                            <li key={s._id}>{s.name} ({s.staffRole})</li>
                                        ))}
                                    </ul>
                                </section>

                                <section className="card">
                                    <h3 style={{ fontSize: 17, marginBottom: 10 }}>Suppliers ({selectedPharmacy.suppliers?.length || 0})</h3>
                                    <form onSubmit={addSupplier} className="form-grid" style={{ marginBottom: 12 }}>
                                        <input placeholder="Supplier name" value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} required style={{ padding: 8, border: "1px solid #C6D8DA", borderRadius: 6 }} />
                                        <input placeholder="License ID" value={supplierForm.licenseId} onChange={(e) => setSupplierForm({ ...supplierForm, licenseId: e.target.value })} style={{ padding: 8, border: "1px solid #C6D8DA", borderRadius: 6 }} />
                                        <button type="submit" className="btn btn-secondary btn-sm">Add Supplier</button>
                                    </form>
                                    <ul style={{ paddingLeft: 16, fontSize: 13 }}>
                                        {(selectedPharmacy.suppliers || []).map((s) => (
                                            <li key={s._id}>{s.name} ({s.status})</li>
                                        ))}
                                    </ul>
                                </section>
                            </div>
                        )}

                        {tab === "insights" && (
                            <div className="grid-2" style={{ alignItems: "start" }}>
                                <section className="card">
                                    <h2 style={{ fontSize: 18, marginBottom: 12 }}>Operational Intelligence &amp; Expiry Risk</h2>
                                    <p style={{ fontSize: 13, color: "var(--mw-muted)", marginBottom: 8 }}>
                                        Expiry Risks: <strong>{insights?.expiryRisks?.length || 0}</strong> · Low Stock: <strong>{insights?.lowStockAlerts?.length || 0}</strong> · Price Anomalies: <strong>{insights?.priceAnomalies?.length || 0}</strong>
                                    </p>
                                    <div style={{ display: "grid", gap: 8 }}>
                                        {(insights?.lowStockAlerts || []).map((a, idx) => (
                                            <div key={idx} className="alert-box warning" style={{ marginBottom: 0 }}>
                                                Low stock: {a.medicine} ({a.stockQuantity} left, threshold {a.threshold})
                                            </div>
                                        ))}
                                        {(insights?.expiryRisks || []).map((r, idx) => (
                                            <div key={idx} className="alert-box error" style={{ marginBottom: 0 }}>
                                                {r.severity}: {r.medicine} (Batch {r.batchNumber})
                                            </div>
                                        ))}
                                    </div>
                                </section>

                                <section className="card">
                                    <h2 style={{ fontSize: 18, marginBottom: 12 }}>Change History (Audit Feed)</h2>
                                    {auditLogs.length === 0 ? (
                                        <p style={{ color: "var(--mw-muted)" }}>No change history events yet.</p>
                                    ) : (
                                        <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
                                            {auditLogs.map((log) => (
                                                <div key={log._id} className="card-compact" style={{ padding: 10 }}>
                                                    <strong>{log.action}</strong>
                                                    <p style={{ color: "var(--mw-muted)" }}>{log.summary}</p>
                                                    <small style={{ color: "var(--mw-muted)" }}>{new Date(log.createdAt).toLocaleString()}</small>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </section>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
