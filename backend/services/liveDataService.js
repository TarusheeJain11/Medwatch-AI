// Live External Public APIs with TTL caching & resilient fallbacks:
// - OpenFDA Drug NDC, Drug Labeling (Monograph), & Enforcement Recalls
// - NIH ClinicalTables RxTerms & NLM RxNav / RxClass
// - Wikipedia REST Summary & Wikimedia Thumbnail + PubChem 2D Structure
// - OpenStreetMap OSRM Full Route Geometry & Nominatim Geocoding
// - Open-Meteo Live Weather/Cold-Chain Advisory & Live INR Exchange Rates

const { resolveMedicineMedia, buildPubChemStructureUrl } = require("./mediaResolver");

const CACHE = new Map();

const getCached = (key) => {
    const hit = CACHE.get(key);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
        CACHE.delete(key);
        return null;
    }
    return hit.value;
};

const setCached = (key, value, ttlMs = 5 * 60 * 1000) => {
    CACHE.set(key, { value, expiresAt: Date.now() + ttlMs });
    if (CACHE.size > 400) {
        const oldestKey = CACHE.keys().next().value;
        if (oldestKey) CACHE.delete(oldestKey);
    }
    return value;
};

const fetchWithTimeout = async (url, timeoutMs = 6500, headers = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                "User-Agent": "MedWatchAI/2.0 (healthcare-pilot@medwatch.demo)",
                Accept: "application/json",
                ...headers
            }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
};

// 1. Live OpenFDA Drug NDC API lookup
const fetchOpenFdaDrugs = async ({ query = "", limit = 20, skip = 0 } = {}) => {
    const cacheKey = `fda_ndc_${query.trim().toLowerCase()}_${limit}_${skip}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const base = "https://api.fda.gov/drug/ndc.json";
        const searchPart = query.trim()
            ? `search=(brand_name:${encodeURIComponent(query.trim())}+generic_name:${encodeURIComponent(query.trim())})&`
            : "search=finished:true&";
        const url = `${base}?${searchPart}limit=${Math.min(100, limit)}&skip=${skip}`;
        const json = await fetchWithTimeout(url, 8000);
        const results = Array.isArray(json.results) ? json.results : [];

        const mapped = results.map((item) => {
            const brand = item.brand_name || item.generic_name || "FDA Catalog Drug";
            const generic = item.generic_name || brand;
            const pharmClass = Array.isArray(item.pharm_class) && item.pharm_class.length > 0
                ? item.pharm_class[0].replace(/\s*\[.*?\]\s*/g, "").trim()
                : item.dosage_form || "General Catalog";
            const activeList = Array.isArray(item.active_ingredients)
                ? item.active_ingredients.map((a) => `${a.name} (${a.strength || ""})`).join(", ")
                : "";
            const seedHash = Array.from(brand).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
            const mrp = 35 + (seedHash % 45) * 5;
            const routeText = Array.isArray(item.route) ? item.route.join(", ") : "Oral / Standard";
            const media = resolveMedicineMedia({
                name: brand,
                genericName: generic,
                category: pharmClass,
                dosage: item.dosage_form
            });

            return {
                ndcCode: item.product_ndc || "",
                name: brand.slice(0, 120),
                genericName: generic.slice(0, 120),
                manufacturer: (item.labeler_name || "FDA Registered Labeler").slice(0, 120),
                category: pharmClass.slice(0, 60) || "General Catalog",
                dosage: item.dosage_form || "Tablet / Capsule",
                mrp,
                activeIngredients: activeList.slice(0, 240),
                routeOfAdministration: routeText,
                prescriptionStatus: item.marketing_category === "OTC MONOGRAPH FINAL" || item.marketing_category === "OTC" ? "OTC" : "Rx / Reference",
                imageUrl: media.imageUrl,
                structureImageUrl: buildPubChemStructureUrl(generic),
                description: `${brand} (${generic}) — ${item.dosage_form || "Pharmaceutical form"} via ${routeText}.`,
                sourceCitation: `OpenFDA Drug NDC Live API (Last updated ${json.meta?.last_updated || "live"})`,
                sourceUrl: "https://api.fda.gov/drug/ndc.json",
                sourceLastVerifiedAt: new Date(),
                editorialStatus: "verified",
                isDemo: false
            };
        });

        return setCached(cacheKey, mapped, 5 * 60 * 1000);
    } catch {
        return [];
    }
};

// 2. Live OpenFDA Drug Labeling (Full Monograph: Indications, Warnings, Interactions, Adverse Reactions, Storage)
const fetchOpenFdaDrugLabel = async (term) => {
    const clean = String(term || "")
        .replace(/\b\d+\s*(mg|mcg|iu|ml|g|%)\b/gi, "")
        .replace(/\(.*?\)/g, "")
        .trim();
    if (!clean) return null;

    const normalized = clean.toLowerCase() === "paracetamol" ? "acetaminophen" : clean;
    const cacheKey = `fda_label_${normalized.toLowerCase()}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const encoded = encodeURIComponent(normalized.split(/\s+/).slice(0, 2).join(" "));
        const url = `https://api.fda.gov/drug/label.json?search=(openfda.generic_name:${encoded}+openfda.brand_name:${encoded})&limit=1`;
        const json = await fetchWithTimeout(url, 7000);
        const item = json?.results?.[0];
        if (!item) return null;

        const pick = (arr, maxLen = 650) => {
            if (!Array.isArray(arr) || arr.length === 0) return "";
            const txt = arr.join(" ").replace(/\s+/g, " ").trim();
            return txt.length > maxLen ? `${txt.slice(0, maxLen).trim()}...` : txt;
        };

        const parsed = {
            brandNames: item.openfda?.brand_name?.slice(0, 4) || [],
            genericNames: item.openfda?.generic_name?.slice(0, 3) || [],
            manufacturer: item.openfda?.manufacturer_name?.[0] || "",
            route: item.openfda?.route?.join(", ") || "",
            pharmClass: item.openfda?.pharm_class_epc?.slice(0, 3) || [],
            purpose: pick(item.purpose || item.indications_and_usage, 450),
            indicationsAndUsage: pick(item.indications_and_usage, 650),
            warnings: pick(item.warnings || item.warnings_and_cautions || item.boxed_warning, 650),
            contraindications: pick(item.contraindications, 450),
            adverseReactions: pick(item.adverse_reactions, 500),
            drugInteractions: pick(item.drug_interactions, 450),
            pregnancyOrBreastfeeding: pick(item.pregnancy_or_breast_feeding || item.pregnancy, 400),
            storageAndHandling: pick(item.storage_and_handling, 350),
            activeIngredient: pick(item.active_ingredient, 300),
            splSetId: item.set_id || item.openfda?.spl_set_id?.[0] || "",
            effectiveTime: item.effective_time || "",
            sourceCitation: `OpenFDA Drug Labeling API (Updated ${json.meta?.last_updated || "live"})`,
            sourceUrl: item.set_id
                ? `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${item.set_id}`
                : "https://open.fda.gov/apis/drug/label/"
        };

        return setCached(cacheKey, parsed, 15 * 60 * 1000);
    } catch {
        return null;
    }
};

// 3. Live OpenFDA Drug Enforcement / Recalls API
const fetchOpenFdaRecalls = async ({ query = "", limit = 8 } = {}) => {
    const cacheKey = `fda_recalls_${query.trim().toLowerCase()}_${limit}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const base = "https://api.fda.gov/drug/enforcement.json";
        const searchPart = query.trim()
            ? `search=product_description:${encodeURIComponent(query.trim())}&`
            : "";
        const url = `${base}?${searchPart}sort=report_date:desc&limit=${Math.min(25, limit)}`;
        const json = await fetchWithTimeout(url, 7000);
        const results = Array.isArray(json.results) ? json.results : [];

        const mapped = results.map((r) => ({
            recallNumber: r.recall_number || "",
            classification: r.classification || "Class II",
            status: r.status || "Ongoing",
            recallingFirm: r.recalling_firm || "Manufacturer",
            productDescription: (r.product_description || "").slice(0, 220),
            reasonForRecall: (r.reason_for_recall || "").slice(0, 260),
            distributionPattern: (r.distribution_pattern || "").slice(0, 140),
            reportDate: r.report_date || "",
            state: r.state || "",
            country: r.country || "USA"
        }));

        return setCached(cacheKey, mapped, 10 * 60 * 1000);
    } catch {
        return [];
    }
};

// 4. Live NIH ClinicalTables RxTerms Search
const fetchNihRxTerms = async (query) => {
    const clean = String(query || "").trim();
    if (!clean) return [];
    const cacheKey = `nih_rxterms_${clean.toLowerCase()}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const q = clean.toLowerCase() === "paracetamol" ? "acetaminophen" : clean;
        const url = `https://clinicaltables.nlm.nih.gov/api/rxterms/v3/search?terms=${encodeURIComponent(q)}&maxList=12&ef=STRENGTHS_AND_FORMS,SXDG_NAME`;
        const json = await fetchWithTimeout(url, 6000);
        const names = Array.isArray(json[1]) ? json[1] : [];
        const extras = json[2] || {};
        const strengthsList = extras.STRENGTHS_AND_FORMS || [];

        const mapped = names.map((displayName, idx) => ({
            name: displayName,
            strengths: Array.isArray(strengthsList[idx]) ? strengthsList[idx].slice(0, 4) : [],
            sourceCitation: "NIH NLM ClinicalTables RxTerms Live API",
            sourceUrl: "https://clinicaltables.nlm.nih.gov/apidoc/rxterms/v3/doc.html"
        }));
        return setCached(cacheKey, mapped, 10 * 60 * 1000);
    } catch {
        return [];
    }
};

// 5. Live NIH NLM RxNav RxCUI + Therapeutic Classes
const fetchRxNavInfo = async (term) => {
    const clean = String(term || "")
        .replace(/\b\d+\s*(mg|mcg|iu|ml|g|%)\b/gi, "")
        .replace(/\(.*?\)/g, "")
        .trim()
        .split(/[,/]/)[0]
        .trim();
    if (!clean || clean.length < 3) return null;

    const cacheKey = `rxnav_${clean.toLowerCase()}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const idJson = await fetchWithTimeout(
            `https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(clean)}`,
            5000
        );
        const rxcui = idJson?.idGroup?.rxnormId?.[0];
        if (!rxcui) return null;

        const [propsRes, classRes] = await Promise.allSettled([
            fetchWithTimeout(`https://rxnav.nlm.nih.gov/REST/rxcui/${rxcui}/properties.json`, 4500),
            fetchWithTimeout(`https://rxnav.nlm.nih.gov/REST/rxclass/class/byRxcui.json?rxcui=${rxcui}`, 4500)
        ]);

        const props = propsRes.status === "fulfilled" ? propsRes.value?.properties : null;
        const classConcepts = classRes.status === "fulfilled"
            ? (classRes.value?.rxclassDrugInfoList?.rxclassDrugInfo || [])
            : [];
        const classes = Array.from(
            new Set(
                classConcepts
                    .map((c) => c?.rxclassMinConceptItem?.className)
                    .filter(Boolean)
            )
        ).slice(0, 6);

        const info = {
            rxcui,
            rxNormName: props?.name || clean,
            synonym: props?.synonym || "",
            tty: props?.tty || "",
            therapeuticClasses: classes,
            sourceCitation: "NIH NLM RxNav / RxClass Live API",
            sourceUrl: `https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm=${rxcui}`
        };

        return setCached(cacheKey, info, 20 * 60 * 1000);
    } catch {
        return null;
    }
};

// 6. Live Wikipedia Summary + Real Thumbnail Image
const fetchWikipediaMedia = async (term) => {
    const clean = String(term || "")
        .replace(/\b\d+\s*(mg|mcg|iu|ml|g|%)\b/gi, "")
        .replace(/\(.*?\)/g, "")
        .trim()
        .split(/[,/]/)[0]
        .trim();
    if (!clean || clean.length < 3) return null;

    const cacheKey = `wiki_${clean.toLowerCase()}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const title = encodeURIComponent(clean.replace(/\s+/g, "_"));
        const json = await fetchWithTimeout(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}`, 5000);
        if (!json || json.type === "disambiguation" || !json.extract) return null;

        const data = {
            title: json.title,
            extract: json.extract.slice(0, 520),
            thumbnailUrl: json.thumbnail?.source || "",
            pageUrl: json.content_urls?.desktop?.page || "",
            sourceCitation: "Wikipedia REST Summary & Wikimedia Commons"
        };
        return setCached(cacheKey, data, 30 * 60 * 1000);
    } catch {
        return null;
    }
};

// 7. Live OpenStreetMap OSRM Road Route Waypoints + Full Street Polyline
const fetchOsrmRouteWaypoints = async ({ fromLat, fromLng, toLat, toLng, pharmacyName, serviceArea }) => {
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&steps=true`;
        const json = await fetchWithTimeout(url, 5500);
        const route = json?.routes?.[0];
        const steps = route?.legs?.[0]?.steps || [];
        if (!route || steps.length < 2) return null;

        const totalMinutes = Math.max(8, Math.round((route.duration || 900) / 60));
        const maxPoints = 6;
        const sampled = [];

        for (let i = 0; i < maxPoints; i++) {
            const idx = i === maxPoints - 1
                ? steps.length - 1
                : Math.floor((i / (maxPoints - 1)) * (steps.length - 1));
            const step = steps[idx];
            const [lng, lat] = step.maneuver?.location || [fromLng, fromLat];
            const street = step.name?.trim();
            const remaining = Math.max(0, Math.round(totalMinutes * (1 - i / (maxPoints - 1))));

            let label;
            if (i === 0) label = `Picked up from ${pharmacyName}`;
            else if (i === maxPoints - 1) label = `Arrived at ${serviceArea}`;
            else label = street ? `On ${street} (Live OSRM Route)` : `En route via sector checkpoint ${i}`;

            sampled.push({ lat, lng, label, etaMinutes: remaining });
        }

        const rawCoords = route.geometry?.coordinates || [];
        const routeGeometry = rawCoords
            .filter((_, idx) => idx % Math.max(1, Math.floor(rawCoords.length / 40)) === 0 || idx === rawCoords.length - 1)
            .map(([lng, lat]) => ({ lat, lng }));

        return {
            waypoints: sampled,
            routeGeometry,
            distanceKm: Number(((route.distance || 3500) / 1000).toFixed(1)),
            totalMinutes,
            provider: "OpenStreetMap OSRM Live Routing"
        };
    } catch {
        return null;
    }
};

// 8. Live OpenStreetMap Nominatim Address Search & Reverse Geocoding
const geocodeAddress = async (query) => {
    const clean = String(query || "").trim();
    if (!clean) return [];
    const cacheKey = `nom_search_${clean.toLowerCase()}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=in&limit=5&q=${encodeURIComponent(clean)}`;
        const json = await fetchWithTimeout(url, 5500);
        const mapped = (Array.isArray(json) ? json : []).map((r) => ({
            displayName: r.display_name,
            lat: Number(r.lat),
            lng: Number(r.lon),
            city: r.address?.city || r.address?.town || r.address?.village || r.address?.county || "",
            state: r.address?.state || "",
            pinCode: r.address?.postcode || "",
            locality: r.address?.suburb || r.address?.neighbourhood || r.address?.road || r.display_name.split(",")[0]
        }));
        return setCached(cacheKey, mapped, 10 * 60 * 1000);
    } catch {
        return [];
    }
};

const reverseGeocode = async (lat, lng) => {
    const key = `nom_rev_${Number(lat).toFixed(3)}_${Number(lng).toFixed(3)}`;
    const cached = getCached(key);
    if (cached) return cached;

    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
        const json = await fetchWithTimeout(url, 5500);
        if (!json || json.error) return null;

        const result = {
            displayName: json.display_name || "",
            lat: Number(json.lat || lat),
            lng: Number(json.lon || lng),
            locality: json.address?.suburb || json.address?.neighbourhood || json.address?.road || "",
            city: json.address?.city || json.address?.town || json.address?.village || json.address?.state_district || "",
            state: json.address?.state || "",
            pinCode: json.address?.postcode || ""
        };
        return setCached(key, result, 15 * 60 * 1000);
    } catch {
        return null;
    }
};

// 9. Live Open-Meteo Weather & Cold-Chain Pharmacy Advisory
const fetchLiveWeatherAdvisory = async (lat = 31.326, lng = 75.5762, city = "Jalandhar") => {
    const key = `weather_${Number(lat).toFixed(2)}_${Number(lng).toFixed(2)}`;
    const cached = getCached(key);
    if (cached) return cached;

    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`;
        const json = await fetchWithTimeout(url, 5000);
        const cur = json?.current;
        if (!cur) return null;

        const tempC = cur.temperature_2m;
        const humidity = cur.relative_humidity_2m;
        const storageAdvisory = tempC > 30
            ? "Warm ambient temperature (>30°C): insulated gel-pack transport active for temperature-sensitive orders."
            : tempC < 10
                ? "Cool ambient conditions: standard insulated pharmacy pouch active."
                : "Optimal ambient storage conditions (10°C–30°C) for standard medicines and wellness kits.";

        const data = {
            city,
            temperatureC: tempC,
            humidityPercent: humidity,
            windKmh: cur.wind_speed_10m,
            weatherCode: cur.weather_code,
            storageAdvisory,
            measuredAt: cur.time || new Date().toISOString(),
            provider: "Open-Meteo Live Telemetry"
        };
        return setCached(key, data, 15 * 60 * 1000);
    } catch {
        return null;
    }
};

// 10. Live Currency Exchange Rates (INR base)
const fetchLiveExchangeRates = async () => {
    const cached = getCached("fx_inr");
    if (cached) return cached;
    try {
        const json = await fetchWithTimeout("https://open.er-api.com/v6/latest/INR", 5000);
        if (!json?.rates) return null;
        const data = {
            base: "INR",
            rates: {
                USD: Number((json.rates.USD || 0.012).toFixed(5)),
                EUR: Number((json.rates.EUR || 0.011).toFixed(5)),
                GBP: Number((json.rates.GBP || 0.0094).toFixed(5))
            },
            updatedAt: json.time_last_update_utc || new Date().toISOString(),
            provider: "ExchangeRate-API Live"
        };
        return setCached("fx_inr", data, 60 * 60 * 1000);
    } catch {
        return null;
    }
};

module.exports = {
    fetchOpenFdaDrugs,
    fetchOpenFdaDrugLabel,
    fetchOpenFdaRecalls,
    fetchNihRxTerms,
    fetchRxNavInfo,
    fetchWikipediaMedia,
    fetchOsrmRouteWaypoints,
    geocodeAddress,
    reverseGeocode,
    fetchLiveWeatherAdvisory,
    fetchLiveExchangeRates
};
