import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../services/api";
import AuthBrandPanel, {
    ShieldPulseIcon,
    UserFieldIcon,
    StoreIcon,
    MailIcon,
    PhoneIcon,
    LockIcon,
    CheckSmallIcon,
    EyeIcon
} from "../components/AuthBrandPanel";
import "./AuthLayout.css";

const ACCOUNT_TYPES = [
    {
        id: "customer",
        title: "Customer",
        description: "Search medicines, compare prices, and track orders.",
        Icon: UserFieldIcon
    },
    {
        id: "pharmacy_owner",
        title: "Pharmacy Owner",
        description: "Register your pharmacy, manage inventory, and update prices.",
        Icon: StoreIcon
    }
];

const PHARMACY_STEPS = [
    { num: 1, label: "Account Info" },
    { num: 2, label: "Pharmacy Details" },
    { num: 3, label: "Review & Submit" }
];

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
    const percent = (score / 5) * 100;
    return { checks, score, label, color, percent };
}

export default function Register() {
    const { user, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const initialType =
        searchParams.get("type") === "pharmacy_owner" ? "pharmacy_owner" : "customer";

    const [accountType, setAccountType] = useState(initialType);
    const [step, setStep] = useState(1);

    // Common & personal fields
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [termsAccepted, setTermsAccepted] = useState(false);

    // Pharmacy Owner fields
    const [pharmacyName, setPharmacyName] = useState("");
    const [licenseNumber, setLicenseNumber] = useState("");
    const [address, setAddress] = useState("");
    const [city, setCity] = useState("");
    const [stateName, setStateName] = useState("");
    const [pinCode, setPinCode] = useState("");

    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({});
    const [error, setError] = useState("");
    const [createdResult, setCreatedResult] = useState(null);

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

    const strength = evaluatePassword(password);

    const clearFieldError = (field) => {
        if (fieldErrors[field]) {
            setFieldErrors((prev) => ({ ...prev, [field]: "" }));
        }
    };

    const validateAccountStep = ({ includePhone = false } = {}) => {
        const errs = {};
        if (!name.trim() || name.trim().length < 2) {
            errs.name = "Enter your full name (at least 2 characters).";
        }
        if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            errs.email = "Enter a valid email address.";
        }
        if (includePhone && phone.replace(/[^0-9]/g, "").length < 10) {
            errs.phone = "Enter a valid 10-digit phone number.";
        }
        if (strength.score < 5 || new TextEncoder().encode(password).length > 72) {
            errs.password = "Please satisfy all password requirements below.";
        }
        if (password !== confirmPassword) {
            errs.confirmPassword = "Passwords do not match.";
        }
        setFieldErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const validatePharmacyStep = () => {
        const errs = {};
        if (!pharmacyName.trim() || pharmacyName.trim().length < 3) {
            errs.pharmacyName = "Enter your official pharmacy name.";
        }
        if (!licenseNumber.trim() || licenseNumber.trim().length < 4) {
            errs.licenseNumber = "Enter a valid pharmacy drug license number.";
        }
        if (!address.trim() || address.trim().length < 5) {
            errs.address = "Enter the complete street address.";
        }
        if (!city.trim() || city.trim().length < 2) {
            errs.city = "Enter the city.";
        }
        if (!stateName.trim() || stateName.trim().length < 2) {
            errs.state = "Enter the state.";
        }
        if (!/^[0-9]{6}$/.test(pinCode.trim())) {
            errs.pinCode = "Enter a valid 6-digit PIN code.";
        }
        setFieldErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleNextStep = () => {
        setError("");
        if (step === 1 && validateAccountStep({ includePhone: true })) {
            setStep(2);
        } else if (step === 2 && validatePharmacyStep()) {
            setStep(3);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        if (accountType === "customer") {
            const ok = validateAccountStep({ includePhone: false });
            if (!termsAccepted) {
                setFieldErrors((prev) => ({
                    ...prev,
                    termsAccepted: "Please accept the Terms of Service and Privacy Policy."
                }));
                return;
            }
            if (!ok) return;
        } else {
            if (!termsAccepted) {
                setFieldErrors({
                    termsAccepted: "Please accept the Terms of Service and Privacy Policy."
                });
                return;
            }
        }

        setLoading(true);
        try {
            const payload =
                accountType === "pharmacy_owner"
                    ? {
                        accountType: "pharmacy_owner",
                        name: name.trim(),
                        email: email.trim().toLowerCase(),
                        phone: phone.trim(),
                        password,
                        confirmPassword,
                        termsAccepted: true,
                        pharmacyName: pharmacyName.trim(),
                        licenseNumber: licenseNumber.trim(),
                        address: address.trim(),
                        city: city.trim(),
                        state: stateName.trim(),
                        pinCode: pinCode.trim()
                    }
                    : {
                        accountType: "customer",
                        name: name.trim(),
                        email: email.trim().toLowerCase(),
                        password,
                        confirmPassword,
                        termsAccepted: true
                    };

            const res = await apiRequest("/auth/register", {
                method: "POST",
                body: payload
            });
            setCreatedResult(res);
        } catch (err) {
            setError(err.message || "Could not create your account. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const passwordBlock = (
        <>
            <div className="auth-field">
                <label htmlFor="password">Password</label>
                <div className="auth-input-wrap has-toggle">
                    <span className="auth-input-icon"><LockIcon /></span>
                    <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Minimum 12 characters"
                        value={password}
                        onChange={(e) => {
                            setPassword(e.target.value);
                            clearFieldError("password");
                        }}
                        autoComplete="new-password"
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

                {password && (
                    <div className="pw-strength-wrap" aria-live="polite">
                        <div className="pw-strength-bar">
                            <div
                                className="pw-strength-fill"
                                style={{ width: `${strength.percent}%`, backgroundColor: strength.color }}
                            />
                        </div>
                        <div className="pw-strength-label" style={{ color: strength.color }}>
                            <span>Password strength</span>
                            <span>{strength.label}</span>
                        </div>
                    </div>
                )}

                <ul className="pw-req-list" aria-label="Password requirements">
                    <li className={`pw-req-item ${strength.checks.length ? "met" : ""}`}>
                        <span>{strength.checks.length ? "✓" : "•"}</span> 12+ characters
                    </li>
                    <li className={`pw-req-item ${strength.checks.upper ? "met" : ""}`}>
                        <span>{strength.checks.upper ? "✓" : "•"}</span> Uppercase letter
                    </li>
                    <li className={`pw-req-item ${strength.checks.lower ? "met" : ""}`}>
                        <span>{strength.checks.lower ? "✓" : "•"}</span> Lowercase letter
                    </li>
                    <li className={`pw-req-item ${strength.checks.number ? "met" : ""}`}>
                        <span>{strength.checks.number ? "✓" : "•"}</span> Number (0–9)
                    </li>
                    <li className={`pw-req-item ${strength.checks.special ? "met" : ""}`}>
                        <span>{strength.checks.special ? "✓" : "•"}</span> Special character
                    </li>
                </ul>
                {fieldErrors.password && <p className="auth-field-error">{fieldErrors.password}</p>}
            </div>

            <div className="auth-field">
                <label htmlFor="confirmPassword">Confirm password</label>
                <div className="auth-input-wrap">
                    <span className="auth-input-icon"><LockIcon /></span>
                    <input
                        id="confirmPassword"
                        type={showPassword ? "text" : "password"}
                        placeholder="Re-enter your password"
                        value={confirmPassword}
                        onChange={(e) => {
                            setConfirmPassword(e.target.value);
                            clearFieldError("confirmPassword");
                        }}
                        autoComplete="new-password"
                        aria-invalid={Boolean(fieldErrors.confirmPassword)}
                        disabled={loading}
                        required
                    />
                </div>
                {fieldErrors.confirmPassword && (
                    <p className="auth-field-error">{fieldErrors.confirmPassword}</p>
                )}
            </div>
        </>
    );

    const termsBlock = (
        <div className="auth-field">
            <label className="auth-checkbox">
                <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => {
                        setTermsAccepted(e.target.checked);
                        clearFieldError("termsAccepted");
                    }}
                    disabled={loading}
                />
                <span>
                    I agree to the{" "}
                    <Link to="/help" className="auth-link" target="_blank" rel="noreferrer">
                        Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link to="/help" className="auth-link" target="_blank" rel="noreferrer">
                        Privacy Policy
                    </Link>
                    .
                </span>
            </label>
            {fieldErrors.termsAccepted && (
                <p className="auth-field-error">{fieldErrors.termsAccepted}</p>
            )}
        </div>
    );

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

                    <h1>Create your account</h1>
                    <p className="auth-subtitle">
                        Join MedWatch AI to compare prices or manage your verified pharmacy.
                    </p>

                    {createdResult ? (
                        <div>
                            <div className={`auth-alert ${createdResult.emailSent ? "success" : "info"}`} role="status">
                                <strong>
                                    {accountType === "pharmacy_owner"
                                        ? "Pharmacy registration submitted!"
                                        : "Account created!"}
                                </strong>
                                <p style={{ marginTop: 6 }}>{createdResult.message}</p>
                                {createdResult.pharmacy && (
                                    <p style={{ marginTop: 6 }}>
                                        <strong>Pharmacy:</strong> {createdResult.pharmacy.name} (Status:{" "}
                                        {createdResult.pharmacy.verificationStatus || "pending"})
                                    </p>
                                )}
                            </div>
                            <Link
                                to="/login"
                                state={{ accountType }}
                                className="auth-submit-btn"
                            >
                                Continue to Sign In
                            </Link>
                            <div className="auth-footer-links">
                                <Link to="/" className="auth-back-home">← Back to homepage</Link>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="role-selector-wrap" role="radiogroup" aria-label="Choose your account type">
                                <span className="role-selector-label">Choose your account type</span>
                                <div className="role-cards-grid">
                                    {ACCOUNT_TYPES.map(({ id, title, description, Icon }) => {
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
                                                    setStep(1);
                                                    setFieldErrors({});
                                                    setError("");
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

                            {accountType === "pharmacy_owner" && (
                                <>
                                    <div className="role-info-banner" role="note">
                                        <span style={{ flexShrink: 0, marginTop: 1 }}>
                                            <ShieldPulseIcon size={16} />
                                        </span>
                                        <span>
                                            Pharmacy accounts require verification before medicine listings can be published.
                                        </span>
                                    </div>

                                    <div className="step-progress" aria-label="Registration steps">
                                        {PHARMACY_STEPS.map((s) => {
                                            const statusClass =
                                                step > s.num ? "done" : step === s.num ? "active" : "";
                                            return (
                                                <div key={s.num} className={`step-pill ${statusClass}`}>
                                                    <div className="step-pill-bar" />
                                                    <span className="step-pill-text">
                                                        Step {s.num}: {s.label}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}

                            {error && (
                                <div className="auth-alert error" role="alert">
                                    {error}
                                </div>
                            )}

                            <form onSubmit={handleSubmit} noValidate>
                                {accountType === "customer" && (
                                    <>
                                        <div className="auth-field">
                                            <label htmlFor="name">Full name</label>
                                            <div className="auth-input-wrap">
                                                <span className="auth-input-icon"><UserFieldIcon /></span>
                                                <input
                                                    id="name"
                                                    type="text"
                                                    placeholder="Enter your full name"
                                                    value={name}
                                                    onChange={(e) => {
                                                        setName(e.target.value);
                                                        clearFieldError("name");
                                                    }}
                                                    autoComplete="name"
                                                    aria-invalid={Boolean(fieldErrors.name)}
                                                    disabled={loading}
                                                    required
                                                />
                                            </div>
                                            {fieldErrors.name && <p className="auth-field-error">{fieldErrors.name}</p>}
                                        </div>

                                        <div className="auth-field">
                                            <label htmlFor="email">Email address</label>
                                            <div className="auth-input-wrap">
                                                <span className="auth-input-icon"><MailIcon /></span>
                                                <input
                                                    id="email"
                                                    type="email"
                                                    placeholder="you@example.com"
                                                    value={email}
                                                    onChange={(e) => {
                                                        setEmail(e.target.value);
                                                        clearFieldError("email");
                                                    }}
                                                    autoComplete="email"
                                                    aria-invalid={Boolean(fieldErrors.email)}
                                                    disabled={loading}
                                                    required
                                                />
                                            </div>
                                            {fieldErrors.email && <p className="auth-field-error">{fieldErrors.email}</p>}
                                        </div>

                                        {passwordBlock}
                                        {termsBlock}

                                        <button type="submit" className="auth-submit-btn" disabled={loading}>
                                            {loading ? (
                                                <>
                                                    <span className="auth-spinner" aria-hidden="true" />
                                                    <span>Creating account...</span>
                                                </>
                                            ) : (
                                                "Create Customer Account"
                                            )}
                                        </button>
                                    </>
                                )}

                                {accountType === "pharmacy_owner" && step === 1 && (
                                    <>
                                        <div className="auth-field">
                                            <label htmlFor="ownerName">Full name</label>
                                            <div className="auth-input-wrap">
                                                <span className="auth-input-icon"><UserFieldIcon /></span>
                                                <input
                                                    id="ownerName"
                                                    type="text"
                                                    placeholder="Owner / Authorized person name"
                                                    value={name}
                                                    onChange={(e) => {
                                                        setName(e.target.value);
                                                        clearFieldError("name");
                                                    }}
                                                    autoComplete="name"
                                                    aria-invalid={Boolean(fieldErrors.name)}
                                                    disabled={loading}
                                                    required
                                                />
                                            </div>
                                            {fieldErrors.name && <p className="auth-field-error">{fieldErrors.name}</p>}
                                        </div>

                                        <div className="auth-row-2">
                                            <div className="auth-field">
                                                <label htmlFor="ownerEmail">Email address</label>
                                                <div className="auth-input-wrap">
                                                    <span className="auth-input-icon"><MailIcon /></span>
                                                    <input
                                                        id="ownerEmail"
                                                        type="email"
                                                        placeholder="pharmacy@example.com"
                                                        value={email}
                                                        onChange={(e) => {
                                                            setEmail(e.target.value);
                                                            clearFieldError("email");
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
                                                <label htmlFor="ownerPhone">Phone number</label>
                                                <div className="auth-input-wrap">
                                                    <span className="auth-input-icon"><PhoneIcon /></span>
                                                    <input
                                                        id="ownerPhone"
                                                        type="tel"
                                                        placeholder="9876543210"
                                                        value={phone}
                                                        onChange={(e) => {
                                                            setPhone(e.target.value);
                                                            clearFieldError("phone");
                                                        }}
                                                        autoComplete="tel"
                                                        aria-invalid={Boolean(fieldErrors.phone)}
                                                        disabled={loading}
                                                        required
                                                    />
                                                </div>
                                                {fieldErrors.phone && <p className="auth-field-error">{fieldErrors.phone}</p>}
                                            </div>
                                        </div>

                                        {passwordBlock}

                                        <button
                                            type="button"
                                            className="auth-submit-btn"
                                            onClick={handleNextStep}
                                        >
                                            Continue to Pharmacy Details
                                        </button>
                                    </>
                                )}

                                {accountType === "pharmacy_owner" && step === 2 && (
                                    <>
                                        <div className="auth-field">
                                            <label htmlFor="pharmacyName">Pharmacy name</label>
                                            <div className="auth-input-wrap">
                                                <span className="auth-input-icon"><StoreIcon /></span>
                                                <input
                                                    id="pharmacyName"
                                                    type="text"
                                                    placeholder="e.g., CarePlus Medical Store"
                                                    value={pharmacyName}
                                                    onChange={(e) => {
                                                        setPharmacyName(e.target.value);
                                                        clearFieldError("pharmacyName");
                                                    }}
                                                    aria-invalid={Boolean(fieldErrors.pharmacyName)}
                                                    required
                                                />
                                            </div>
                                            {fieldErrors.pharmacyName && (
                                                <p className="auth-field-error">{fieldErrors.pharmacyName}</p>
                                            )}
                                        </div>

                                        <div className="auth-field">
                                            <label htmlFor="licenseNumber">Pharmacy Drug License Number</label>
                                            <div className="auth-input-wrap">
                                                <span className="auth-input-icon"><ShieldPulseIcon size={17} /></span>
                                                <input
                                                    id="licenseNumber"
                                                    type="text"
                                                    placeholder="e.g., PB-JAL-2026-4410"
                                                    value={licenseNumber}
                                                    onChange={(e) => {
                                                        setLicenseNumber(e.target.value);
                                                        clearFieldError("licenseNumber");
                                                    }}
                                                    aria-invalid={Boolean(fieldErrors.licenseNumber)}
                                                    required
                                                />
                                            </div>
                                            {fieldErrors.licenseNumber && (
                                                <p className="auth-field-error">{fieldErrors.licenseNumber}</p>
                                            )}
                                        </div>

                                        <div className="auth-field">
                                            <label htmlFor="pharmacyAddress">Pharmacy street address</label>
                                            <div className="auth-input-wrap">
                                                <span className="auth-input-icon"><StoreIcon /></span>
                                                <input
                                                    id="pharmacyAddress"
                                                    type="text"
                                                    placeholder="Shop No., Road, Landmark"
                                                    value={address}
                                                    onChange={(e) => {
                                                        setAddress(e.target.value);
                                                        clearFieldError("address");
                                                    }}
                                                    aria-invalid={Boolean(fieldErrors.address)}
                                                    required
                                                />
                                            </div>
                                            {fieldErrors.address && (
                                                <p className="auth-field-error">{fieldErrors.address}</p>
                                            )}
                                        </div>

                                        <div className="auth-row-2">
                                            <div className="auth-field">
                                                <label htmlFor="pharmacyCity">City</label>
                                                <div className="auth-input-wrap">
                                                    <span className="auth-input-icon"><UserFieldIcon /></span>
                                                    <input
                                                        id="pharmacyCity"
                                                        type="text"
                                                        placeholder="City"
                                                        value={city}
                                                        onChange={(e) => {
                                                            setCity(e.target.value);
                                                            clearFieldError("city");
                                                        }}
                                                        aria-invalid={Boolean(fieldErrors.city)}
                                                        required
                                                    />
                                                </div>
                                                {fieldErrors.city && (
                                                    <p className="auth-field-error">{fieldErrors.city}</p>
                                                )}
                                            </div>

                                            <div className="auth-field">
                                                <label htmlFor="pharmacyState">State</label>
                                                <div className="auth-input-wrap">
                                                    <span className="auth-input-icon"><UserFieldIcon /></span>
                                                    <input
                                                        id="pharmacyState"
                                                        type="text"
                                                        placeholder="State"
                                                        value={stateName}
                                                        onChange={(e) => {
                                                            setStateName(e.target.value);
                                                            clearFieldError("state");
                                                        }}
                                                        aria-invalid={Boolean(fieldErrors.state)}
                                                        required
                                                    />
                                                </div>
                                                {fieldErrors.state && (
                                                    <p className="auth-field-error">{fieldErrors.state}</p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="auth-field">
                                            <label htmlFor="pinCode">6-digit PIN Code</label>
                                            <div className="auth-input-wrap">
                                                <span className="auth-input-icon"><ShieldPulseIcon size={17} /></span>
                                                <input
                                                    id="pinCode"
                                                    type="text"
                                                    inputMode="numeric"
                                                    maxLength={6}
                                                    placeholder="144001"
                                                    value={pinCode}
                                                    onChange={(e) => {
                                                        setPinCode(e.target.value.replace(/[^0-9]/g, ""));
                                                        clearFieldError("pinCode");
                                                    }}
                                                    aria-invalid={Boolean(fieldErrors.pinCode)}
                                                    required
                                                />
                                            </div>
                                            {fieldErrors.pinCode && (
                                                <p className="auth-field-error">{fieldErrors.pinCode}</p>
                                            )}
                                        </div>

                                        <div className="auth-actions-row">
                                            <button
                                                type="button"
                                                className="auth-btn-secondary"
                                                onClick={() => setStep(1)}
                                            >
                                                Back
                                            </button>
                                            <button
                                                type="button"
                                                className="auth-submit-btn"
                                                style={{ flex: 1 }}
                                                onClick={handleNextStep}
                                            >
                                                Continue to Review
                                            </button>
                                        </div>
                                    </>
                                )}

                                {accountType === "pharmacy_owner" && step === 3 && (
                                    <>
                                        <div className="review-summary-box" aria-label="Registration summary">
                                            <div className="review-summary-row">
                                                <span>Owner Name</span>
                                                <strong>{name}</strong>
                                            </div>
                                            <div className="review-summary-row">
                                                <span>Email &amp; Phone</span>
                                                <strong>{email} · {phone}</strong>
                                            </div>
                                            <div className="review-summary-row">
                                                <span>Pharmacy Name</span>
                                                <strong>{pharmacyName}</strong>
                                            </div>
                                            <div className="review-summary-row">
                                                <span>Drug License No.</span>
                                                <strong>{licenseNumber}</strong>
                                            </div>
                                            <div className="review-summary-row">
                                                <span>Location</span>
                                                <strong>{address}, {city}, {stateName} — {pinCode}</strong>
                                            </div>
                                            <div className="review-summary-row">
                                                <span>Initial Status</span>
                                                <strong>Pending Verification</strong>
                                            </div>
                                        </div>

                                        {termsBlock}

                                        <div className="auth-actions-row">
                                            <button
                                                type="button"
                                                className="auth-btn-secondary"
                                                onClick={() => setStep(2)}
                                                disabled={loading}
                                            >
                                                Back
                                            </button>
                                            <button
                                                type="submit"
                                                className="auth-submit-btn"
                                                style={{ flex: 1 }}
                                                disabled={loading}
                                            >
                                                {loading ? (
                                                    <>
                                                        <span className="auth-spinner" aria-hidden="true" />
                                                        <span>Submitting...</span>
                                                    </>
                                                ) : (
                                                    "Register Pharmacy"
                                                )}
                                            </button>
                                        </div>
                                    </>
                                )}
                            </form>

                            <div className="auth-footer-links">
                                <p>
                                    Already have an account?{" "}
                                    <Link to="/login" className="auth-link">
                                        Sign In
                                    </Link>
                                </p>
                                <Link to="/" className="auth-back-home">
                                    ← Back to homepage
                                </Link>
                            </div>
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}
