const API_BASE = import.meta.env.VITE_API_URL || "/api";
const CACHE_PREFIX = "medwatch_offline_cache_v1_";
const DEFAULT_TIMEOUT_MS = 12000;

export async function apiRequest(path, options = {}) {
    const {
        method = "GET",
        body,
        cacheKey = null,
        headers = {},
        signal,
        timeoutMs = DEFAULT_TIMEOUT_MS
    } = options;

    const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), timeoutMs);

    const onExternalAbort = () => timeoutController.abort();
    if (signal) {
        if (signal.aborted) timeoutController.abort();
        else signal.addEventListener("abort", onExternalAbort, { once: true });
    }

    const config = {
        method,
        credentials: "include",
        headers: {
            ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
            ...headers
        },
        signal: timeoutController.signal
    };

    if (body !== undefined) {
        config.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    try {
        const res = await fetch(url, config);
        const contentType = res.headers.get("content-type") || "";
        const data = contentType.includes("application/json")
            ? await res.json()
            : await res.text();

        if (!res.ok) {
            const backendMessage = typeof data === "object" ? data?.message : "";
            const friendlyMessage =
                backendMessage ||
                (res.status === 502 || res.status === 503 || res.status === 504
                    ? `Backend service is temporarily unavailable (HTTP ${res.status}). Ensure the backend server is running and try again.`
                    : `Request failed (${res.status})`);

            const err = new Error(friendlyMessage);
            err.status = res.status;
            err.data = data;
            throw err;
        }

        if (method === "GET" && cacheKey && typeof data === "object") {
            try {
                localStorage.setItem(
                    `${CACHE_PREFIX}${cacheKey}`,
                    JSON.stringify({ savedAt: Date.now(), data })
                );
            } catch {
                // Ignore storage quota errors
            }
        }

        return data;
    } catch (error) {
        const isBackendUnavailable =
            !error.status || error.status === 502 || error.status === 503 || error.status === 504;

        // Preserve AbortError when caller explicitly canceled (e.g., StrictMode unmount)
        if (error.name === "AbortError" && signal?.aborted) {
            throw error;
        }

        if (error.name === "AbortError") {
            const timeoutErr = new Error("Request timed out while waiting for the backend server.");
            timeoutErr.isTimeout = true;
            error = timeoutErr;
        }

        if (method === "GET" && cacheKey && isBackendUnavailable && !navigator.onLine) {
            try {
                const cachedRaw = localStorage.getItem(`${CACHE_PREFIX}${cacheKey}`);
                if (cachedRaw) {
                    const parsed = JSON.parse(cachedRaw);
                    return {
                        ...parsed.data,
                        _fromOfflineCache: true,
                        _cachedAt: parsed.savedAt
                    };
                }
            } catch {
                // Fall through
            }
        }
        throw error;
    } finally {
        clearTimeout(timer);
        if (signal) signal.removeEventListener("abort", onExternalAbort);
    }
}

export function getApiBase() {
    return API_BASE;
}
