import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AuthBrandPanel, {
    ShieldPulseIcon,
    MailIcon,
    LockIcon,
    UserFieldIcon,
    StoreIcon,
    CheckSmallIcon,
    EyeIcon
} from "../components/AuthBrandPanel";
import "./AuthLayout.css";

const ROLE_OPTIONS = [
    {
        id: "customer",
        title: "Customer",
        description: "Find and compare medicine prices.",
        Icon: UserFieldIcon
    },
    {
        id: "pharmacy_owner",
        title: "Pharmacy Owner",
        description: "Manage your pharmacy and medicine listings.",
        Icon: StoreIcon
    }
];

export default function Login() {
    const { login, user, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const initialAccountType =
        location.state?.accountType === "pharmacy_owner" ? "pharmacy_owner" : "customer";

    const [accountType, setAccountType] = useState(initialAccountType);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [rememberMe, setRememberMe] = useState(false);
    const [mfaCode, setMfaCode] = useState("");
    const [mfaRequired, setMfaRequired] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({});
    const [error, setError] = useState("");

    // Redirect already authenticated users away from Login
    useEffect(() => {
        if (!authLoading && user) {
            if (user.role === "admin") navigate("/admin/dashboard", { replace: true });
            else if (user.role === "pharmacy_owner" || user.role === "pharmacy") {
                navigate("/pharmacy/dashboard", { replace: true });
            } else {
                navigate("/", { replace: true });
            }
        }
    }, [user, authLoading, navigate]);

    const validateForm = () => {
        const errs = {};
        if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            errs.email = "Enter a valid email address.";
        }
        if (!password) {
            errs.password = "Enter your password.";
        }
        if (mfaRequired && !mfaCode.trim()) {
            errs.mfaCode = "Enter your multi-factor verification code.";
        }
        setFieldErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        if (!validateForm()) return;

        setLoading(true);
        try {
            const loggedInUser = await login(
                email.trim().toLowerCase(),
                password,
                mfaCode,
                rememberMe,
                accountType
            );
            const redirectTo = location.state?.from;
            if (redirectTo) {
                navigate(redirectTo, { replace: true });
            } else if (loggedInUser.role === "admin") {
                navigate("/admin/dashboard", { replace: true });
            } else if (loggedInUser.role === "pharmacy_owner" || loggedInUser.role === "pharmacy") {
                navigate("/pharmacy/dashboard", { replace: true });
            } else {
                navigate("/", { replace: true });
            }
        } catch (err) {
            if (err.mfaRequired) setMfaRequired(true);
            setError(err.message || "Unable to sign in. Please check your credentials.");
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

                    <h1>Welcome back</h1>
                    <p className="auth-subtitle">Sign in to continue to MedWatch AI.</p>

                    {error && (
                        <div className="auth-alert error" role="alert">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} noValidate>
                        <div className="role-selector-wrap" role="radiogroup" aria-label="Sign in as">
                            <span className="role-selector-label">Sign in as</span>
                            <div className="role-cards-grid">
                                {ROLE_OPTIONS.map(({ id, title, description, Icon }) => {
                                    const selected = accountType === id;
                                    return (
                                        <button
                                            key={id}
                                            type="button"
                                            role="radio"
                                            aria-checked={selected}
                                            className={`role-card ${selected ? "selected" : ""}`}
                                            onClick={() => {
                                                setAccountType(id);
                                                if (error) setError("");
                                            }}
                                            disabled={loading}
                                        >
                                            <div className="role-card-top">
                                                <span className="role-card-icon">
                                                    <Icon size={16} />
                                                </span>
                                                <span className="role-card-check" aria-hidden="true">
                                                    <CheckSmallIcon size={12} />
                                                </span>
                                            </div>
                                            <span className="role-card-title">{title}</span>
                                            <span className="role-card-desc">{description}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="auth-field">
                            <label htmlFor="email">Email address</label>
                            <div className="auth-input-wrap">
                                <span className="auth-input-icon"><MailIcon /></span>
                                <input
                                    id="email"
                                    type="email"
                                    placeholder={accountType === "pharmacy_owner" ? "pharmacy@example.com" : "you@example.com"}
                                    value={email}
                                    onChange={(e) => {
                                        setEmail(e.target.value);
                                        if (fieldErrors.email) setFieldErrors({ ...fieldErrors, email: "" });
                                    }}
                                    autoComplete="email"
                                    aria-invalid={Boolean(fieldErrors.email)}
                                    disabled={loading}
                                    required
                                />
                            </div>
                            {fieldErrors.email && <p className="auth-field-error">{fieldErrors.email}</p>}
                        </div>

                        <div className="auth-field">
                            <label htmlFor="password">Password</label>
                            <div className="auth-input-wrap has-toggle">
                                <span className="auth-input-icon"><LockIcon /></span>
                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Enter your password"
                                    value={password}
                                    onChange={(e) => {
                                        setPassword(e.target.value);
                                        if (fieldErrors.password) setFieldErrors({ ...fieldErrors, password: "" });
                                    }}
                                    autoComplete="current-password"
                                    aria-invalid={Boolean(fieldErrors.password)}
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
                            {fieldErrors.password && <p className="auth-field-error">{fieldErrors.password}</p>}
                        </div>

                        {mfaRequired && (
                            <div className="auth-field">
                                <label htmlFor="mfaCode">Multi-factor verification code</label>
                                <div className="auth-input-wrap">
                                    <span className="auth-input-icon"><LockIcon /></span>
                                    <input
                                        id="mfaCode"
                                        type="text"
                                        inputMode="numeric"
                                        placeholder="Enter 6-digit code"
                                        value={mfaCode}
                                        onChange={(e) => setMfaCode(e.target.value)}
                                        aria-invalid={Boolean(fieldErrors.mfaCode)}
                                        disabled={loading}
                                        required
                                    />
                                </div>
                                {fieldErrors.mfaCode && <p className="auth-field-error">{fieldErrors.mfaCode}</p>}
                            </div>
                        )}

                        <div className="auth-row-between">
                            <label className="auth-checkbox">
                                <input
                                    type="checkbox"
                                    checked={rememberMe}
                                    onChange={(e) => setRememberMe(e.target.checked)}
                                    disabled={loading}
                                />
                                <span>Remember me</span>
                            </label>
                            <Link to="/forgot-password" className="auth-link">
                                Forgot password?
                            </Link>
                        </div>

                        <button type="submit" className="auth-submit-btn" disabled={loading}>
                            {loading ? (
                                <>
                                    <span className="auth-spinner" aria-hidden="true" />
                                    <span>Signing in...</span>
                                </>
                            ) : (
                                `Sign In as ${accountType === "pharmacy_owner" ? "Pharmacy Owner" : "Customer"}`
                            )}
                        </button>
                    </form>

                    <div className="auth-footer-links">
                        <p>
                            Don&apos;t have an account?{" "}
                            <Link to="/register" className="auth-link">
                                Create an account
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
