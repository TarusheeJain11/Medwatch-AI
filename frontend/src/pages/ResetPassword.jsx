import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiRequest } from "../services/api";
import AuthBrandPanel, {
    ShieldPulseIcon,
    LockIcon,
    EyeIcon
} from "../components/AuthBrandPanel";
import "./AuthLayout.css";

function evaluatePassword(pw) {
    const checks = {
        length: pw.length >= 12,
        upper: /[A-Z]/.test(pw),
        lower: /[a-z]/.test(pw),
        number: /[0-9]/.test(pw),
        special: /[^A-Za-z0-9]/.test(pw)
    };
    const score = Object.values(checks).filter(Boolean).length;
    const label =
        score <= 2 ? "Weak" : score === 3 ? "Fair" : score === 4 ? "Good" : "Strong";
    const color =
        score <= 2 ? "#DC2626" : score === 3 ? "#D97706" : score === 4 ? "#0D9488" : "#16A34A";
    return { checks, score, label, color, percent: (score / 5) * 100 };
}

export default function ResetPassword() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get("token") || "";

    const [validating, setValidating] = useState(true);
    const [tokenValid, setTokenValid] = useState(false);
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState({ type: "", message: "" });
    const [fieldErrors, setFieldErrors] = useState({});

    useEffect(() => {
        if (!token) {
            setValidating(false);
            setTokenValid(false);
            setStatus({ type: "error", message: "Missing password reset token." });
            return;
        }

        apiRequest(`/auth/reset-password/validate?token=${encodeURIComponent(token)}`)
            .then((res) => {
                setTokenValid(Boolean(res.valid));
            })
            .catch((err) => {
                setTokenValid(false);
                setStatus({
                    type: "error",
                    message: err.message || "This password reset link is invalid or has expired."
                });
            })
            .finally(() => setValidating(false));
    }, [token]);

    const strength = evaluatePassword(newPassword);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus({ type: "", message: "" });
        const errs = {};
        if (strength.score < 5) {
            errs.newPassword = "Please meet all password strength requirements.";
        }
        if (newPassword !== confirmPassword) {
            errs.confirmPassword = "Passwords do not match.";
        }
        setFieldErrors(errs);
        if (Object.keys(errs).length > 0) return;

        setLoading(true);
        try {
            const res = await apiRequest("/auth/reset-password", {
                method: "POST",
                body: { token, newPassword, confirmPassword }
            });
            setStatus({ type: "success", message: res.message });
            setTimeout(() => navigate("/login", { replace: true }), 1800);
        } catch (err) {
            setStatus({
                type: "error",
                message: err.message || "Could not reset password."
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

                    <h1>Set a new password</h1>
                    <p className="auth-subtitle">
                        Choose a strong password that you have not used before on MedWatch AI.
                    </p>

                    {status.message && (
                        <div className={`auth-alert ${status.type}`} role="alert">
                            {status.message}
                        </div>
                    )}

                    {validating ? (
                        <p style={{ fontSize: 14, color: "var(--auth-muted)" }}>Validating reset link...</p>
                    ) : !tokenValid ? (
                        <div style={{ display: "grid", gap: 12 }}>
                            <Link to="/forgot-password" className="auth-submit-btn">
                                Request a New Reset Link
                            </Link>
                            <Link to="/login" className="auth-back-home">← Back to Sign In</Link>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} noValidate>
                            <div className="auth-field">
                                <label htmlFor="newPassword">New password</label>
                                <div className="auth-input-wrap has-toggle">
                                    <span className="auth-input-icon"><LockIcon /></span>
                                    <input
                                        id="newPassword"
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Minimum 12 characters"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        autoComplete="new-password"
                                        aria-invalid={Boolean(fieldErrors.newPassword)}
                                        disabled={loading}
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="auth-pw-toggle"
                                        onClick={() => setShowPassword((prev) => !prev)}
                                        aria-label={showPassword ? "Hide password" : "Show password"}
                                    >
                                        <EyeIcon off={showPassword} />
                                    </button>
                                </div>

                                {newPassword && (
                                    <div className="pw-strength-wrap">
                                        <div className="pw-strength-bar">
                                            <div className="pw-strength-fill" style={{ width: `${strength.percent}%`, backgroundColor: strength.color }} />
                                        </div>
                                        <div className="pw-strength-label" style={{ color: strength.color }}>
                                            <span>Password strength</span>
                                            <span>{strength.label}</span>
                                        </div>
                                    </div>
                                )}

                                <ul className="pw-req-list">
                                    <li className={`pw-req-item ${strength.checks.length ? "met" : ""}`}><span>{strength.checks.length ? "✓" : "•"}</span> 12+ characters</li>
                                    <li className={`pw-req-item ${strength.checks.upper ? "met" : ""}`}><span>{strength.checks.upper ? "✓" : "•"}</span> Uppercase</li>
                                    <li className={`pw-req-item ${strength.checks.lower ? "met" : ""}`}><span>{strength.checks.lower ? "✓" : "•"}</span> Lowercase</li>
                                    <li className={`pw-req-item ${strength.checks.number ? "met" : ""}`}><span>{strength.checks.number ? "✓" : "•"}</span> Number</li>
                                    <li className={`pw-req-item ${strength.checks.special ? "met" : ""}`}><span>{strength.checks.special ? "✓" : "•"}</span> Special char</li>
                                </ul>
                                {fieldErrors.newPassword && <p className="auth-field-error">{fieldErrors.newPassword}</p>}
                            </div>

                            <div className="auth-field">
                                <label htmlFor="confirmPassword">Confirm new password</label>
                                <div className="auth-input-wrap">
                                    <span className="auth-input-icon"><LockIcon /></span>
                                    <input
                                        id="confirmPassword"
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Re-enter your new password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        autoComplete="new-password"
                                        aria-invalid={Boolean(fieldErrors.confirmPassword)}
                                        disabled={loading}
                                        required
                                    />
                                </div>
                                {fieldErrors.confirmPassword && <p className="auth-field-error">{fieldErrors.confirmPassword}</p>}
                            </div>

                            <button type="submit" className="auth-submit-btn" disabled={loading}>
                                {loading ? "Updating password..." : "Reset Password"}
                            </button>
                        </form>
                    )}
                </div>
            </main>
        </div>
    );
}
