import {
    createContext,
    useContext,
    useState,
    useEffect,
    useRef,
    useCallback
} from "react";
import { apiRequest, getApiBase } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [authError, setAuthError] = useState("");
    const [language, setLanguage] = useState(() => localStorage.getItem("mw_lang") || "en");
    const [lowBandwidth, setLowBandwidth] = useState(
        () => localStorage.getItem("mw_lite") === "true"
    );
    const [isOnline, setIsOnline] = useState(() => navigator.onLine);
    const [sseStatus, setSseStatus] = useState("connecting");
    const [sseAttempt, setSseAttempt] = useState(0);
    const [liveEvents, setLiveEvents] = useState([]);
    const [unreadNotifications, setUnreadNotifications] = useState(0);
    const [featureFlags, setFeatureFlags] = useState({
        ai_assistant: true,
        demo_orders: true,
        live_tracking_sim: true,
        multilingual_ui: true,
        regulated_checkout: false
    });

    const [cartItems, setCartItems] = useState(() => {
        try {
            const raw = localStorage.getItem("mw_cart_v1");
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    });
    const [preferredPharmacyId, setPreferredPharmacyId] = useState(
        () => localStorage.getItem("mw_pref_pharmacy") || ""
    );

    const requestId = useRef(0);
    const sseTriggerRef = useRef(0);

    useEffect(() => {
        try {
            localStorage.setItem("mw_cart_v1", JSON.stringify(cartItems));
        } catch {
            // ignore
        }
    }, [cartItems]);

    useEffect(() => {
        if (preferredPharmacyId) {
            localStorage.setItem("mw_pref_pharmacy", preferredPharmacyId);
        }
    }, [preferredPharmacyId]);

    const addToCart = useCallback((product, delta = 1) => {
        setCartItems((prev) => {
            const idx = prev.findIndex((i) => i.product._id === product._id);
            if (idx >= 0) {
                const nextQty = Math.min(product.maxQuantity || 6, prev[idx].quantity + delta);
                if (nextQty <= 0) return prev.filter((_, i) => i !== idx);
                return prev.map((item, i) => (i === idx ? { ...item, quantity: nextQty } : item));
            }
            if (delta <= 0) return prev;
            return [...prev, { product, quantity: Math.min(product.maxQuantity || 6, delta) }];
        });
    }, []);

    const setCartItemQty = useCallback((productId, qty) => {
        setCartItems((prev) =>
            qty <= 0
                ? prev.filter((i) => i.product._id !== productId)
                : prev.map((i) =>
                    i.product._id === productId
                        ? { ...i, quantity: Math.min(i.product.maxQuantity || 6, qty) }
                        : i
                )
        );
    }, []);

    const clearCart = useCallback(() => setCartItems([]), []);
    const cartCount = cartItems.reduce((sum, i) => sum + i.quantity, 0);

    useEffect(() => {
        document.body.classList.toggle("low-bandwidth", lowBandwidth);
        localStorage.setItem("mw_lite", String(lowBandwidth));
    }, [lowBandwidth]);

    useEffect(() => {
        localStorage.setItem("mw_lang", language);
        document.documentElement.lang = language;
    }, [language]);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);
        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, []);

    const refreshNotifications = useCallback(async () => {
        try {
            const res = await apiRequest("/support/notifications");
            if (res.success) {
                setUnreadNotifications(res.unreadCount || 0);
            }
        } catch {
            // Ignore when signed out or unavailable
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        const id = ++requestId.current;

        const init = async () => {
            try {
                const statusRes = await apiRequest("/status", { cacheKey: "status", signal: controller.signal });
                if (statusRes?.featureFlags) {
                    setFeatureFlags(statusRes.featureFlags);
                }
            } catch {
                // Keep defaults
            }

            try {
                const data = await apiRequest("/auth/me", { signal: controller.signal });
                if (id !== requestId.current) return;
                if (data.success && data.user) {
                    setUser(data.user);
                    if (data.user.language) setLanguage(data.user.language);
                    if (typeof data.user.lowBandwidthMode === "boolean") {
                        setLowBandwidth(data.user.lowBandwidthMode);
                    }
                    refreshNotifications();
                } else {
                    setUser(null);
                }
            } catch (error) {
                if (error.name !== "AbortError" && id === requestId.current) {
                    setUser(null);
                    if (error.status && error.status !== 401) {
                        setAuthError("Unable to verify session with backend.");
                    }
                }
            } finally {
                if (!controller.signal.aborted && id === requestId.current) {
                    setLoading(false);
                }
            }
        };

        init();
        return () => controller.abort();
    }, [refreshNotifications]);

    // Controlled SSE with exponential backoff (never loops forever on 502)
    useEffect(() => {
        if (!isOnline) {
            setSseStatus("offline");
            return;
        }

        let es;
        let closed = false;
        let retryTimer;
        let failures = 0;

        const connectSse = () => {
            if (closed) return;
            setSseStatus((prev) => (prev === "connected" ? "connected" : "connecting"));
            es = new EventSource(`${getApiBase()}/events/stream`, { withCredentials: true });

            es.addEventListener("connected", (e) => {
                failures = 0;
                setSseStatus("connected");
                try {
                    const parsed = JSON.parse(e.data);
                    if (Array.isArray(parsed.recentEvents)) {
                        setLiveEvents(parsed.recentEvents);
                    }
                } catch {
                    // ignore
                }
            });

            const onDomainEvent = (e) => {
                try {
                    const evt = JSON.parse(e.data);
                    setLiveEvents((prev) => {
                        if (prev.some((p) => p.id === evt.id)) return prev;
                        return [...prev.slice(-29), evt];
                    });
                    if (user) refreshNotifications();
                    if (evt.type === "system.flags_updated") {
                        setFeatureFlags((prev) => ({
                            ...prev,
                            [evt.payload.key]: evt.payload.enabled
                        }));
                    }
                } catch {
                    // ignore
                }
            };

            [
                "order.created",
                "order.updated",
                "tracking.updated",
                "partner.verification_updated",
                "notification.broadcast",
                "system.flags_updated"
            ].forEach((type) => es.addEventListener(type, onDomainEvent));

            es.onerror = () => {
                es.close();
                if (closed) return;
                failures += 1;
                if (failures >= 4) {
                    // Stop hammering a down backend; show clear manual Reconnect action
                    setSseStatus("unavailable");
                    return;
                }
                setSseStatus("reconnecting");
                const backoffMs = Math.min(16000, 2000 * Math.pow(2, failures - 1));
                retryTimer = setTimeout(connectSse, backoffMs);
            };
        };

        const initTimer = setTimeout(connectSse, 80);
        return () => {
            closed = true;
            clearTimeout(initTimer);
            clearTimeout(retryTimer);
            es?.close();
        };
    }, [isOnline, user?.id, refreshNotifications, sseAttempt]);

    const reconnectSse = useCallback(() => {
        sseTriggerRef.current += 1;
        setSseAttempt((n) => n + 1);
    }, []);

    const login = async (email, password, mfaCode = "", rememberMe = false, accountType = undefined) => {
        const id = ++requestId.current;
        setAuthError("");

        const res = await fetch(`${getApiBase()}/auth/login`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, mfaCode, rememberMe, ...(accountType ? { accountType } : {}) })
        });
        const data = await res.json().catch(() => ({}));

        if (res.status === 202 && data.mfaRequired) {
            const err = new Error(data.message || "MFA code required.");
            err.mfaRequired = true;
            throw err;
        }
        if (!res.ok || !data.success || !data.user) {
            const err = new Error(data.message || `Login failed (HTTP ${res.status}).`);
            err.mfaRequired = Boolean(data.mfaRequired);
            throw err;
        }

        if (id === requestId.current) {
            setUser(data.user);
            if (data.user.language) setLanguage(data.user.language);
            if (typeof data.user.lowBandwidthMode === "boolean") {
                setLowBandwidth(data.user.lowBandwidthMode);
            }
            refreshNotifications();
        }
        return data.user;
    };

    const logout = async () => {
        const id = ++requestId.current;
        setAuthError("");
        try {
            await apiRequest("/auth/logout", { method: "POST" });
            if (id === requestId.current) {
                setUser(null);
                setUnreadNotifications(0);
            }
        } catch {
            if (id === requestId.current) {
                setAuthError("Logout failed. Please try again.");
            }
        }
    };

    const updatePreferences = async (patch) => {
        if (patch.language) setLanguage(patch.language);
        if (typeof patch.lowBandwidthMode === "boolean") setLowBandwidth(patch.lowBandwidthMode);
        if (user) {
            const res = await apiRequest("/auth/profile", { method: "PATCH", body: patch });
            if (res.user) setUser(res.user);
            return res.user;
        }
        return null;
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                setUser,
                loading,
                authError,
                login,
                logout,
                updatePreferences,
                language,
                setLanguage,
                lowBandwidth,
                setLowBandwidth,
                isOnline,
                sseStatus,
                reconnectSse,
                liveEvents,
                unreadNotifications,
                refreshNotifications,
                featureFlags,
                cartItems,
                cartCount,
                addToCart,
                setCartItemQty,
                clearCart,
                preferredPharmacyId,
                setPreferredPharmacyId,
                isAuthenticated: Boolean(user),
                isAdmin: user?.role === "admin",
                isPharmacy: user?.role === "pharmacy_owner" || user?.role === "pharmacy",
                isPharmacyOwner: user?.role === "pharmacy_owner" || user?.role === "pharmacy",
                isCustomer: user?.role === "customer"
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within AuthProvider");
    }
    return context;
}
