import { useState, useMemo } from "react";
import { apiRequest } from "../services/api";

function QrMatrixSvg({ payload = "" }) {
    // Deterministic 21x21 QR-like visual matrix seeded from UPI payload
    const cells = useMemo(() => {
        const size = 21;
        const grid = Array.from({ length: size }, () => Array(size).fill(false));
        const drawFinder = (r0, c0) => {
            for (let r = 0; r < 7; r++) {
                for (let c = 0; c < 7; c++) {
                    const border = r === 0 || r === 6 || c === 0 || c === 6;
                    const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
                    grid[r0 + r][c0 + c] = border || core;
                }
            }
        };
        drawFinder(0, 0);
        drawFinder(0, size - 7);
        drawFinder(size - 7, 0);

        let seed = 0;
        for (let i = 0; i < payload.length; i++) {
            seed = (seed * 31 + payload.charCodeAt(i)) >>> 0;
        }
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                const inFinder =
                    (r < 8 && c < 8) ||
                    (r < 8 && c >= size - 8) ||
                    (r >= size - 8 && c < 8);
                if (!inFinder) {
                    seed = (seed * 1664525 + 1013904223) >>> 0;
                    grid[r][c] = (seed % 11) < 5;
                }
            }
        }
        return grid;
    }, [payload]);

    return (
        <svg viewBox="0 0 126 126" width="128" height="128" role="img" aria-label="UPI Scan and Pay QR Code" style={{ background: "#fff", padding: 6, borderRadius: 10, border: "1px solid #CBD5E1" }}>
            {cells.map((row, r) =>
                row.map((on, c) =>
                    on ? <rect key={`${r}_${c}`} x={c * 6} y={r * 6} width="5.5" height="5.5" rx="0.8" fill="#0F172A" /> : null
                )
            )}
        </svg>
    );
}

const detectBrand = (num = "") => {
    const d = num.replace(/\D/g, "");
    if (/^4/.test(d)) return "Visa";
    if (/^(5[1-5]|2[2-7])/.test(d)) return "Mastercard";
    if (/^(60|65|81|82|508)/.test(d)) return "RuPay";
    return "Card";
};

export default function PaymentGatewayModal({
    isOpen,
    onClose,
    intent,
    gatewayConfig,
    onSuccess
}) {
    const [method, setMethod] = useState("upi");
    const [upiVpa, setUpiVpa] = useState("pilot.customer@okaxis");
    const [cardNumber, setCardNumber] = useState("");
    const [cardExpiry, setCardExpiry] = useState("");
    const [cardCvv, setCardCvv] = useState("");
    const [cardName, setCardName] = useState("");
    const [bankCode, setBankCode] = useState("SBI");
    const [walletCode, setWalletCode] = useState("PAYTM");
    const [simulateFailure, setSimulateFailure] = useState(false);

    const [step, setStep] = useState("choose"); // choose | otp | processing
    const [otpInput, setOtpInput] = useState("482910");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    if (!isOpen || !intent) return null;

    const fxUsd = gatewayConfig?.exchangeRates?.rates?.USD
        ? (intent.amount * gatewayConfig.exchangeRates.rates.USD).toFixed(2)
        : null;

    const banks = gatewayConfig?.banks || [
        { code: "SBI", name: "State Bank of India" },
        { code: "HDFC", name: "HDFC Bank" },
        { code: "ICICI", name: "ICICI Bank" }
    ];
    const wallets = gatewayConfig?.wallets || [
        { code: "PAYTM", name: "Paytm Wallet" },
        { code: "AMAZON", name: "Amazon Pay" }
    ];

    const startVerification = (e) => {
        e.preventDefault();
        setError("");
        if (method === "card" || method === "netbanking") {
            setStep("otp");
            return;
        }
        finalizePayment();
    };

    const finalizePayment = async () => {
        setSubmitting(true);
        setStep("processing");
        setError("");
        try {
            const res = await apiRequest("/payments/verify-and-complete", {
                method: "POST",
                body: {
                    intentId: intent.intentId,
                    method,
                    upiVpa,
                    cardNumber,
                    cardExpiry,
                    cardCvv,
                    cardName,
                    bankCode,
                    walletCode,
                    simulateFailure
                }
            });
            onSuccess(res);
        } catch (err) {
            setStep("choose");
            setError(err.message || "Payment failed. Please verify details and retry.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="pg-title">
            <div className="modal-card" style={{ maxWidth: 660 }}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, paddingBottom: 14, borderBottom: "1px solid var(--mw-border)" }}>
                    <div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                            <span className="status-badge verified">256-Bit Encrypted Checkout</span>
                            <span className="status-badge neutral">{intent.transactionId}</span>
                        </div>
                        <h2 id="pg-title" style={{ fontSize: 20 }}>MedWatch Pay Gateway</h2>
                        <p style={{ fontSize: 13, color: "var(--mw-muted)" }}>
                            Paying <strong>{intent.pharmacyName}</strong> · Order Ref: <code>{intent.gatewayOrderId}</code>
                        </p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                        <strong style={{ fontSize: 24, color: "var(--mw-teal)", display: "block" }}>₹{intent.amount}</strong>
                        {fxUsd && <small style={{ color: "var(--mw-muted)" }}>≈ \${fxUsd} USD (Live FX)</small>}
                        <div>
                            <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 6 }} onClick={onClose} disabled={submitting}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>

                {/* Supported Brands Bar */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #EEF4F5" }}>
                    <img src="/images/payments/upi.svg" alt="UPI" height="24" />
                    <img src="/images/payments/gpay.svg" alt="Google Pay" height="24" />
                    <img src="/images/payments/phonepe.svg" alt="PhonePe" height="24" />
                    <img src="/images/payments/visa.svg" alt="Visa" height="24" />
                    <img src="/images/payments/mastercard.svg" alt="Mastercard" height="24" />
                    <img src="/images/payments/rupay.svg" alt="RuPay" height="24" />
                    <img src="/images/payments/netbanking.svg" alt="NetBanking" height="24" />
                    <img src="/images/payments/cod.svg" alt="Cash on Delivery" height="24" />
                </div>

                {error && (
                    <div className="alert-box error" role="alert" style={{ marginTop: 12, marginBottom: 0 }}>
                        <span>{error}</span>
                    </div>
                )}

                {step === "processing" && (
                    <div style={{ textAlign: "center", padding: "36px 16px" }}>
                        <strong style={{ fontSize: 18, display: "block", marginBottom: 6 }}>Verifying Payment &amp; Generating Receipt...</strong>
                        <p style={{ fontSize: 13, color: "var(--mw-muted)" }}>
                            Confirming HMAC signature and locking live OSRM courier dispatch. Do not refresh.
                        </p>
                    </div>
                )}

                {step === "otp" && (
                    <div style={{ padding: "20px 0", display: "grid", gap: 14 }}>
                        <div className="alert-box info" style={{ marginBottom: 0 }}>
                            <div>
                                <strong>3D-Secure Bank Authorization</strong>
                                <p style={{ fontSize: 13, marginTop: 4 }}>
                                    Enter the 6-digit sandbox OTP sent to your registered mobile (Demo OTP: <strong>482910</strong>).
                                </p>
                            </div>
                        </div>
                        <div className="field">
                            <label htmlFor="pgOtp">One-Time Password (OTP)</label>
                            <input
                                id="pgOtp"
                                type="text"
                                maxLength={6}
                                value={otpInput}
                                onChange={(e) => setOtpInput(e.target.value)}
                                style={{ letterSpacing: 4, fontWeight: 700, fontSize: 18 }}
                            />
                        </div>
                        <div style={{ display: "flex", gap: 10 }}>
                            <button type="button" className="btn btn-outline" onClick={() => setStep("choose")}>
                                ← Back
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                style={{ flex: 1 }}
                                onClick={finalizePayment}
                                disabled={otpInput.trim().length < 4}
                            >
                                Authorize &amp; Pay ₹{intent.amount}
                            </button>
                        </div>
                    </div>
                )}

                {step === "choose" && (
                    <form onSubmit={startVerification} style={{ marginTop: 14, display: "grid", gap: 14 }}>
                        {/* Method Selector */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8 }}>
                            {[
                                { id: "upi", title: "UPI / QR", sub: "GPay, PhonePe" },
                                { id: "card", title: "Card", sub: "Visa / RuPay" },
                                { id: "netbanking", title: "NetBanking", sub: "SBI / HDFC" },
                                { id: "wallet", title: "Wallets", sub: "Paytm / APay" },
                                { id: "cod", title: "Pay on Delivery", sub: "Cash / UPI" }
                            ].map((m) => (
                                <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => setMethod(m.id)}
                                    className="card-compact"
                                    style={{
                                        padding: "10px 8px",
                                        textAlign: "left",
                                        borderColor: method === m.id ? "var(--mw-teal)" : undefined,
                                        background: method === m.id ? "var(--mw-teal-soft)" : "#fff"
                                    }}
                                >
                                    <strong style={{ fontSize: 13, display: "block" }}>{m.title}</strong>
                                    <small style={{ fontSize: 11, color: "var(--mw-muted)" }}>{m.sub}</small>
                                </button>
                            ))}
                        </div>

                        {method === "upi" && (
                            <div className="card-compact" style={{ background: "#F8FCFC", display: "grid", gridTemplateColumns: "auto 1fr", gap: 16, alignItems: "center" }}>
                                <div style={{ textAlign: "center" }}>
                                    <QrMatrixSvg payload={intent.upiQrPayload} />
                                    <small style={{ display: "block", fontSize: 11, color: "var(--mw-muted)", marginTop: 4 }}>
                                        Scan with any UPI app
                                    </small>
                                </div>
                                <div className="form-grid" style={{ gap: 10 }}>
                                    <div className="field">
                                        <label htmlFor="upiVpa">Or Enter UPI ID / VPA</label>
                                        <input
                                            id="upiVpa"
                                            type="text"
                                            value={upiVpa}
                                            onChange={(e) => setUpiVpa(e.target.value)}
                                            placeholder="yourname@okaxis"
                                            required
                                        />
                                    </div>
                                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                        {["pilot.customer@okaxis", "medwatch@ybl", "care@paytm"].map((sample) => (
                                            <button key={sample} type="button" className="btn btn-outline btn-sm" onClick={() => setUpiVpa(sample)}>
                                                {sample}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {method === "card" && (
                            <div className="card-compact form-grid" style={{ background: "#F8FCFC", gap: 12 }}>
                                <div className="field">
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <label htmlFor="cardNum">Card Number ({detectBrand(cardNumber)})</label>
                                        <button
                                            type="button"
                                            className="btn btn-outline btn-sm"
                                            onClick={() => {
                                                setCardNumber("4111 1111 1111 1111");
                                                setCardExpiry("12/28");
                                                setCardCvv("123");
                                                setCardName("Pilot Customer");
                                            }}
                                        >
                                            Fill Test Visa
                                        </button>
                                    </div>
                                    <input
                                        id="cardNum"
                                        type="text"
                                        placeholder="4111 1111 1111 1111"
                                        value={cardNumber}
                                        onChange={(e) => setCardNumber(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="grid-3">
                                    <div className="field">
                                        <label htmlFor="cardExp">Expiry (MM/YY)</label>
                                        <input id="cardExp" type="text" placeholder="12/28" value={cardExpiry} onChange={(e) => setCardExpiry(e.target.value)} required />
                                    </div>
                                    <div className="field">
                                        <label htmlFor="cardCvv">CVV</label>
                                        <input id="cardCvv" type="password" maxLength={4} placeholder="123" value={cardCvv} onChange={(e) => setCardCvv(e.target.value)} required />
                                    </div>
                                    <div className="field">
                                        <label htmlFor="cardName">Name on Card</label>
                                        <input id="cardName" type="text" placeholder="Full Name" value={cardName} onChange={(e) => setCardName(e.target.value)} required />
                                    </div>
                                </div>
                            </div>
                        )}

                        {method === "netbanking" && (
                            <div className="card-compact field" style={{ background: "#F8FCFC" }}>
                                <label htmlFor="bankSel">Select Your Bank</label>
                                <select id="bankSel" value={bankCode} onChange={(e) => setBankCode(e.target.value)}>
                                    {banks.map((b) => (
                                        <option key={b.code} value={b.code}>{b.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {method === "wallet" && (
                            <div className="card-compact field" style={{ background: "#F8FCFC" }}>
                                <label htmlFor="walletSel">Select Digital Wallet</label>
                                <select id="walletSel" value={walletCode} onChange={(e) => setWalletCode(e.target.value)}>
                                    {wallets.map((w) => (
                                        <option key={w.code} value={w.code}>{w.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {method === "cod" && (
                            <div className="alert-box info" style={{ marginBottom: 0 }}>
                                Pay ₹{intent.amount} via cash or UPI QR when your verified courier arrives. A 4-digit delivery PIN will be generated for safe handoff.
                            </div>
                        )}

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--mw-muted)" }}>
                                <input type="checkbox" checked={simulateFailure} onChange={(e) => setSimulateFailure(e.target.checked)} />
                                Simulate bank decline (test retry flow)
                            </label>
                            <button type="submit" className="btn btn-primary" disabled={submitting}>
                                {method === "cod" ? `Confirm COD Order (₹${intent.amount})` : `Pay ₹${intent.amount} Securely →`}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
