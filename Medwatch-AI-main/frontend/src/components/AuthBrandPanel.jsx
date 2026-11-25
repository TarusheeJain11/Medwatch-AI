import { Link } from "react-router-dom";

export function ShieldPulseIcon({ size = 22 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M8 12h2l1.5-3 2 6 1.5-3H17" />
        </svg>
    );
}

export function MailIcon({ size = 17 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect width="20" height="16" x="2" y="4" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
    );
}

export function LockIcon({ size = 17 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
    );
}

export function UserFieldIcon({ size = 17 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="8" r="5" />
            <path d="M20 21a8 8 0 0 0-16 0" />
        </svg>
    );
}

export function StoreIcon({ size = 17 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" />
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" />
            <path d="M2 7h20" />
            <path d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7" />
        </svg>
    );
}

export function PhoneIcon({ size = 17 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
    );
}

export function CheckSmallIcon({ size = 12 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
        </svg>
    );
}

export function EyeIcon({ off = false, size = 17 }) {
    if (off) {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                <line x1="2" x2="22" y1="2" y2="22" />
            </svg>
        );
    }
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    );
}

export default function AuthBrandPanel() {
    return (
        <aside className="auth-brand-panel" aria-label="MedWatch AI platform overview">
            <Link to="/" className="auth-logo-link">
                <span className="auth-logo-badge">
                    <ShieldPulseIcon size={22} />
                </span>
                <span>MedWatch AI</span>
            </Link>

            <div className="auth-brand-content">
                <h2>Smarter Healthcare. Transparent Medicine Prices.</h2>
                <p>
                    Compare medicine prices, discover verified pharmacies, and make informed healthcare decisions.
                </p>

                <div className="auth-illustration-wrap">
                    <svg viewBox="0 0 420 155" width="100%" height="145" role="img" aria-label="Healthcare price transparency illustration">
                        <rect x="6" y="10" width="235" height="135" rx="12" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.22)" />
                        <text x="22" y="34" fill="#99F6E4" fontSize="10" fontWeight="700">PHARMACY PRICE COMPARISON</text>
                        <rect x="22" y="48" width="145" height="12" rx="6" fill="#14B8A6" />
                        <rect x="22" y="68" width="185" height="12" rx="6" fill="rgba(255,255,255,0.35)" />
                        <rect x="22" y="88" width="165" height="12" rx="6" fill="rgba(255,255,255,0.24)" />
                        <rect x="22" y="112" width="110" height="20" rx="6" fill="rgba(20,184,166,0.35)" />
                        <text x="32" y="125" fill="#FFFFFF" fontSize="10" fontWeight="600">Source Verified</text>

                        <rect x="256" y="10" width="156" height="135" rx="12" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.22)" />
                        <circle cx="334" cy="58" r="24" fill="rgba(20,184,166,0.35)" stroke="#5EEAD4" strokeWidth="2" />
                        <path d="M334 45 L334 71 M321 58 L347 58" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" />
                        <text x="334" y="104" textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="700">Verified Pharmacies</text>
                        <text x="334" y="122" textAnchor="middle" fill="#CCFBF1" fontSize="10">Clear Source Attribution</text>
                    </svg>
                </div>

                <div className="auth-features-grid">
                    <div className="auth-feature-item">
                        <span className="auth-feature-icon">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>
                        </span>
                        <span>Medicine Price Comparison</span>
                    </div>
                    <div className="auth-feature-item">
                        <span className="auth-feature-icon">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>
                        </span>
                        <span>Verified Pharmacy Information</span>
                    </div>
                    <div className="auth-feature-item">
                        <span className="auth-feature-icon">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" /></svg>
                        </span>
                        <span>AI-Powered Price Insights</span>
                    </div>
                    <div className="auth-feature-item">
                        <span className="auth-feature-icon">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
                        </span>
                        <span>Healthcare Transparency</span>
                    </div>
                </div>
            </div>

            <div className="auth-brand-footer">
                MedWatch AI · Intelligent Medicine Price Monitoring &amp; Healthcare Transparency
            </div>
        </aside>
    );
}
