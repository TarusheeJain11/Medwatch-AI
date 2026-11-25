import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { t } from "../services/i18n";
import {
    ShieldCrossIcon,
    BellIcon,
    BuildingIcon,
    TruckIcon,
    UserIcon,
    SparkleIcon,
    SearchIcon
} from "./Icons";

export default function Layout({ children }) {
    const {
        user,
        isAuthenticated,
        isAdmin,
        isPharmacy,
        logout,
        language,
        updatePreferences,
        lowBandwidth,
        isOnline,
        sseStatus,
        reconnectSse,
        unreadNotifications,
        cartCount
    } = useAuth();

    return (
        <div className="app-shell">
            <a href="#main-content" className="skip-link">
                Skip to main content
            </a>

            {!isOnline && (
                <div className="connectivity-banner red" role="status" aria-live="polite">
                    {t(language, "offlineBanner")}
                </div>
            )}

            {isOnline && sseStatus === "reconnecting" && (
                <div className="connectivity-banner amber" role="status" aria-live="polite">
                    <span>{t(language, "reconnectingBanner")}</span>
                    <button type="button" className="btn btn-outline btn-sm" onClick={reconnectSse}>
                        Retry Now
                    </button>
                </div>
            )}

            {isOnline && sseStatus === "unavailable" && (
                <div className="connectivity-banner red" role="status" aria-live="polite">
                    <span>Live updates unavailable — backend server could not be reached.</span>
                    <button type="button" className="btn btn-outline btn-sm" onClick={reconnectSse}>
                        Reconnect
                    </button>
                </div>
            )}

            <header className="navbar">
                <Link to="/" className="brand">
                    <span className="brand-mark">
                        <ShieldCrossIcon size={18} />
                    </span>
                    {t(language, "brand")} <span>AI</span>
                </Link>

                <nav className="nav-links" aria-label="Primary navigation">
                    <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                        {t(language, "navHome")}
                    </NavLink>
                    <NavLink to="/catalog" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                        {t(language, "navCatalog")}
                    </NavLink>
                    <NavLink to="/directory" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                        {t(language, "navDirectory")}
                    </NavLink>
                    <NavLink to="/orders" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                        {t(language, "navOrders")}
                    </NavLink>
                    <NavLink to="/help" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                        {t(language, "navHelp")}
                    </NavLink>
                    {isPharmacy && (
                        <NavLink to="/pharmacy/dashboard" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                            {t(language, "navPartner")}
                        </NavLink>
                    )}
                    {isAdmin && (
                        <NavLink to="/admin/dashboard" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                            {t(language, "navAdmin")}
                        </NavLink>
                    )}
                </nav>

                <div className="nav-actions">
                    <Link to="/orders#checkout" className="icon-pill-btn" aria-label={`Shopping cart with ${cartCount} items`}>
                        <TruckIcon size={15} />
                        <span>Cart</span>
                        {cartCount > 0 && <span className="badge-count">{cartCount}</span>}
                    </Link>

                    <select
                        aria-label="Select language"
                        className="lang-select"
                        value={language}
                        onChange={(e) => updatePreferences({ language: e.target.value })}
                    >
                        <option value="en">EN</option>
                        <option value="hi">हिं</option>
                        <option value="pa">ਪੰ</option>
                    </select>

                    <button
                        type="button"
                        className={`icon-pill-btn ${lowBandwidth ? "active" : ""}`}
                        onClick={() => updatePreferences({ lowBandwidthMode: !lowBandwidth })}
                        title="Toggle low-bandwidth lite mode"
                        aria-pressed={lowBandwidth}
                    >
                        {t(language, "lowBandwidth")}
                    </button>

                    {isAuthenticated ? (
                        <>
                            <Link to="/account" className="icon-pill-btn" aria-label="Account and notifications">
                                <BellIcon size={15} />
                                <span>{user?.name?.split(" ")[0]}</span>
                                {unreadNotifications > 0 && (
                                    <span className="badge-count">{unreadNotifications}</span>
                                )}
                            </Link>
                            <button type="button" className="btn btn-outline btn-sm" onClick={logout}>
                                {t(language, "logout")}
                            </button>
                        </>
                    ) : (
                        <>
                            <Link to="/login" className="btn btn-secondary btn-sm">
                                {t(language, "login")}
                            </Link>
                            <Link to="/register" className="btn btn-primary btn-sm">
                                {t(language, "register")}
                            </Link>
                        </>
                    )}
                </div>
            </header>

            <main id="main-content" className="main-container" tabIndex={-1}>
                {children}
            </main>

            <footer className="site-footer">
                <div className="footer-grid">
                    <div>
                        <h4>MedWatch AI — Healthcare Catalog &amp; Live Tracking</h4>
                        <p>
                            Powered by OpenFDA Drug NDC, NIH RxTerms, and OpenStreetMap OSRM routing.
                            Educational reference &amp; sandbox checkout only — consult a licensed doctor for medical advice.
                        </p>
                    </div>
                    <div>
                        <h4>Customer Services</h4>
                        <Link to="/catalog">Search 1,000+ Medicines</Link>
                        <Link to="/directory">Find Nearby Verified Pharmacies</Link>
                        <Link to="/orders">Wellness Store &amp; Live Order Tracker</Link>
                        <Link to="/help">Care AI Assistant &amp; Help</Link>
                    </div>
                    <div>
                        <h4>Trust, Privacy &amp; APIs</h4>
                        <Link to="/status">Live Service Status &amp; Data Sources</Link>
                        <Link to="/account">DPDP Privacy &amp; Data Export</Link>
                        <a href="/api/docs/openapi.json" target="_blank" rel="noreferrer">
                            OpenAPI Specification (JSON)
                        </a>
                    </div>
                </div>
            </footer>

            <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
                <NavLink to="/" end className={({ isActive }) => `mobile-nav-item ${isActive ? "active" : ""}`}>
                    <SearchIcon size={18} />
                    <span>{t(language, "navHome")}</span>
                </NavLink>
                <NavLink to="/catalog" className={({ isActive }) => `mobile-nav-item ${isActive ? "active" : ""}`}>
                    <ShieldCrossIcon size={18} />
                    <span>{t(language, "navCatalog")}</span>
                </NavLink>
                <NavLink to="/directory" className={({ isActive }) => `mobile-nav-item ${isActive ? "active" : ""}`}>
                    <BuildingIcon size={18} />
                    <span>{t(language, "navDirectory")}</span>
                </NavLink>
                <NavLink to="/orders" className={({ isActive }) => `mobile-nav-item ${isActive ? "active" : ""}`}>
                    <TruckIcon size={18} />
                    <span>Cart ({cartCount})</span>
                </NavLink>
                <NavLink
                    to={isPharmacy ? "/pharmacy/dashboard" : isAdmin ? "/admin/dashboard" : isAuthenticated ? "/account" : "/help"}
                    className={({ isActive }) => `mobile-nav-item ${isActive ? "active" : ""}`}
                >
                    {isAuthenticated ? <UserIcon size={18} /> : <SparkleIcon size={18} />}
                    <span>{isPharmacy ? "Pharmacy" : isAdmin ? "Admin" : isAuthenticated ? "Account" : "Help"}</span>
                </NavLink>
            </nav>
        </div>
    );
}
