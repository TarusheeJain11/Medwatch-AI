import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../services/api";
import AuthBrandPanel, { ShieldPulseIcon, MailIcon } from "../components/AuthBrandPanel";
import "./AuthLayout.css";

export default function ForgotPassword() {
    const { user, loading: authLoading } = useAuth();
    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [fieldError, setFieldError] = useState("");
    const [status, setStatus] = useState({ type: "", message: "" });

    useEffect(() => {
        if (!authLoading && user) {
            navigate("/", { replace: true });
        }
    }, [user, authLoading, navigate]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus({ type: "", message: "" });
        if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            setFieldError("Enter a valid registered email address.");
            return;
        }
        setFieldError("");
        setLoading(true);

        try {
            const res = await apiRequest("/auth/forgot-password", {
                method: "POST",
                body: { email: email.trim().toLowerCase() }
            });
            setStatus({ type: "success", message: res.message });
        } catch (err) {
            setStatus({
                type: "error",
                message: err.message || "Unable to process password recovery request."
            });
        } finally {
            setLoading(false);
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

                    <h1>Reset your password</h1>
                    <p className="auth-subtitle">
                        Enter your registered email address and we will send a time-limited reset link if an account exists.
                    </p>

                    {status.message && (
                        <div className={`auth-alert ${status.type}`} role="alert">
                            {status.message}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} noValidate>
                        <div className="auth-field">
                            <label htmlFor="recoveryEmail">Email address</label>
                            <div className="auth-input-wrap">
                                <span className="auth-input-icon"><MailIcon /></span>
                                <input
                                    id="recoveryEmail"
                                    type="email"
                                    placeholder="you@example.com"
                                    value={email}
                                    onChange={(e) => {
                                        setEmail(e.target.value);
                                        if (fieldError) setFieldError("");
                                    }}
                                    autoComplete="email"
                                    aria-invalid={Boolean(fieldError)}
                                    disabled={loading}
                                    required
                                />
                            </div>
                            {fieldError && <p className="auth-field-error">{fieldError}</p>}
                        </div>

                        <button type="submit" className="auth-submit-btn" disabled={loading}>
                            {loading ? (
                                <>
                                    <span className="auth-spinner" aria-hidden="true" />
                                    <span>Sending reset link...</span>
                                </>
                            ) : (
                                "Send Reset Link"
                            )}
                        </button>
                    </form>

                    <div className="auth-footer-links">
                        <p>
                            Remembered your password?{" "}
                            <Link to="/login" className="auth-link">
                                Back to Sign In
                            </Link>
                        </p>
                        <Link to="/" className="auth-back-home">
                            ← Back to homepage
                        </Link>
                    </div>
                </div>
            </main>
        </div>
    );
}
