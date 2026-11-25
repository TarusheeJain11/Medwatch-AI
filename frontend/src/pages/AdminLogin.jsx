import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../services/api";
import AuthBrandPanel, {
    ShieldPulseIcon,
    MailIcon,
    LockIcon,
    EyeIcon
} from "../components/AuthBrandPanel";
import "./AuthLayout.css";

export default function AdminLogin() {
    const { user, setUser, loading: authLoading, refreshNotifications } = useAuth();
    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [mfaCode, setMfaCode] = useState("");
    const [mfaRequired, setMfaRequired] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!authLoading && user) {
            if (user.role === "admin") navigate("/admin/dashboard", { replace: true });
            else navigate("/", { replace: true });
        }
    }, [user, authLoading, navigate]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            const res = await apiRequest("/auth/admin/login", {
                method: "POST",
                body: {
                    email: email.trim().toLowerCase(),
                    password,
                    mfaCode
                }
            });
            if (res.user) {
                setUser(res.user);
                refreshNotifications();
                navigate("/admin/dashboard", { replace: true });
            }
        } catch (err) {
            if (err.data?.mfaRequired) setMfaRequired(true);
            setError(err.message || "Administrator sign in failed.");
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

                    <h1>Administrator Portal</h1>
                    <p className="auth-subtitle">
                        Authorized governance personnel only. Access attempts are audited.
                    </p>

                    {error && (
                        <div className="auth-alert error" role="alert">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit}>
                        <div className="auth-field">
                            <label htmlFor="adminEmail">Administrator email</label>
                            <div className="auth-input-wrap">
                                <span className="auth-input-icon"><MailIcon /></span>
                                <input
                                    id="adminEmail"
                                    type="email"
                                    placeholder="admin@medwatch.example"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    autoComplete="email"
                                    disabled={loading}
                                    required
                                />
                            </div>
                        </div>

                        <div className="auth-field">
                            <label htmlFor="adminPassword">Password</label>
                            <div className="auth-input-wrap has-toggle">
                                <span className="auth-input-icon"><LockIcon /></span>
                                <input
                                    id="adminPassword"
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Enter administrator password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoComplete="current-password"
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
                        </div>

                        {mfaRequired && (
                            <div className="auth-field">
                                <label htmlFor="adminMfa">MFA verification code</label>
                                <div className="auth-input-wrap">
                                    <span className="auth-input-icon"><LockIcon /></span>
                                    <input
                                        id="adminMfa"
                                        type="text"
                                        inputMode="numeric"
                                        placeholder="Enter 6-digit MFA code"
                                        value={mfaCode}
                                        onChange={(e) => setMfaCode(e.target.value)}
                                        disabled={loading}
                                        required
                                    />
                                </div>
                            </div>
                        )}

                        <button type="submit" className="auth-submit-btn" disabled={loading}>
                            {loading ? (
                                <>
                                    <span className="auth-spinner" aria-hidden="true" />
                                    <span>Verifying...</span>
                                </>
                            ) : (
                                "Sign In as Administrator"
                            )}
                        </button>
                    </form>

                    <div className="auth-footer-links">
                        <Link to="/login" className="auth-link">Standard User Sign In</Link>
                        <Link to="/" className="auth-back-home">← Back to homepage</Link>
                    </div>
                </div>
            </main>
        </div>
    );
}
