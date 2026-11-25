import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest } from "../services/api";
import AuthBrandPanel, { ShieldPulseIcon, MailIcon } from "../components/AuthBrandPanel";
import "./AuthLayout.css";

export default function VerifyEmail() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get("token") || "";

    const [verifying, setVerifying] = useState(Boolean(token));
    const [status, setStatus] = useState({ type: "", message: "" });
    const [resendEmail, setResendEmail] = useState("");
    const [resending, setResending] = useState(false);

    useEffect(() => {
        if (!token) return;
        apiRequest("/auth/verify-email", {
            method: "POST",
            body: { token }
        })
            .then((res) => {
                setStatus({ type: "success", message: res.message });
            })
            .catch((err) => {
                setStatus({
                    type: "error",
                    message: err.message || "Verification link is invalid or has expired."
                });
            })
            .finally(() => setVerifying(false));
    }, [token]);

    const handleResend = async (e) => {
        e.preventDefault();
        setResending(true);
        try {
            const res = await apiRequest("/auth/resend-verification", {
                method: "POST",
                body: { email: resendEmail.trim().toLowerCase() }
            });
            setStatus({ type: "success", message: res.message });
        } catch (err) {
            setStatus({
                type: "error",
                message: err.message || "Unable to send verification email."
            });
        } finally {
            setResending(false);
        }
    };

    return (
        <div className="auth-page">
            <AuthBrandPanel />

            <main className="auth-form-panel">
                <div className="auth-form-card">
                    <Link to="/" className="auth-mobile-brand">
                        <span className="auth-mobile-brand-icon">
                            <ShieldPulseIcon size={18} />
                        </span>
                        <span>MedWatch AI</span>
                    </Link>

                    <h1>Email verification</h1>
                    <p className="auth-subtitle">Confirm your email address for MedWatch AI.</p>

                    {verifying ? (
                        <p style={{ fontSize: 14, color: "var(--auth-muted)" }}>Verifying your email...</p>
                    ) : (
                        <>
                            {status.message && (
                                <div className={`auth-alert ${status.type}`} role="status">
                                    {status.message}
                                </div>
                            )}

                            {status.type === "success" ? (
                                <Link to="/login" className="auth-submit-btn">
                                    Continue to Sign In
                                </Link>
                            ) : (
                                <form onSubmit={handleResend}>
                                    <div className="auth-field">
                                        <label htmlFor="resendEmail">Resend verification link</label>
                                        <div className="auth-input-wrap">
                                            <span className="auth-input-icon"><MailIcon /></span>
                                            <input
                                                id="resendEmail"
                                                type="email"
                                                placeholder="Enter your registered email"
                                                value={resendEmail}
                                                onChange={(e) => setResendEmail(e.target.value)}
                                                required
                                            />
                                        </div>
                                    </div>
                                    <button type="submit" className="auth-submit-btn" disabled={resending}>
                                        {resending ? "Sending..." : "Resend Verification Email"}
                                    </button>
                                </form>
                            )}
                        </>
                    )}

                    <div className="auth-footer-links">
                        <Link to="/login" className="auth-link">Back to Sign In</Link>
                        <Link to="/" className="auth-back-home">← Back to homepage</Link>
                    </div>
                </div>
            </main>
        </div>
    );
}
