const BILINGUAL_SYNONYMS = {
    bukhar: ["paracetamol", "pain relief", "fever"],
    बुखार: ["paracetamol", "pain relief", "fever"],
    dard: ["paracetamol", "pain relief"],
    दर्द: ["paracetamol", "pain relief"],
    haddi: ["calcium", "vitamin d3", "cholecalciferol"],
    हड्डी: ["calcium", "vitamin d3"],
    kamzori: ["vitamin b12", "folic acid", "zinc"],
    कमजोरी: ["vitamin b12", "folic acid"],
    takkat: ["vitamin", "calcium", "zinc"],
    ताकत: ["vitamin", "calcium"],
    baal: ["biotin", "zinc"],
    बाल: ["biotin", "zinc"],
    khoon: ["folic acid", "cyanocobalamin", "vitamin b12"],
    खून: ["folic acid", "vitamin b12"],
    sehhat: ["vitamin", "mineral"],
    ਸਿਹਤ: ["vitamin", "mineral"],
    ਬੁਖਾਰ: ["paracetamol", "pain relief"],
    ਦਰਦ: ["paracetamol", "pain relief"],
    ਹੱਡੀ: ["calcium", "vitamin d3"],
    vitmin: ["vitamin"],
    paracetmol: ["paracetamol"],
    paracitamol: ["paracetamol"],
    calcim: ["calcium"],
    biotn: ["biotin"],
    zink: ["zinc"]
};

const levenshtein = (a, b) => {
    const s = a.toLowerCase();
    const t = b.toLowerCase();
    if (s === t) return 0;
    if (!s.length) return t.length;
    if (!t.length) return s.length;

    const dp = Array.from({ length: s.length + 1 }, () =>
        new Array(t.length + 1).fill(0)
    );
    for (let i = 0; i <= s.length; i++) dp[i][0] = i;
    for (let j = 0; j <= t.length; j++) dp[0][j] = j;

    for (let i = 1; i <= s.length; i++) {
        for (let j = 1; j <= t.length; j++) {
            const cost = s[i - 1] === t[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost
            );
        }
    }
    return dp[s.length][t.length];
};

const expandQueryTerms = (query) => {
    const clean = (query || "").trim().toLowerCase();
    if (!clean) return [];
    const tokens = clean.split(/\s+/).filter(Boolean);
    const expanded = new Set([clean, ...tokens]);
    for (const token of tokens) {
        if (BILINGUAL_SYNONYMS[token]) {
            BILINGUAL_SYNONYMS[token].forEach((syn) => expanded.add(syn));
        }
    }
    return Array.from(expanded);
};

const scoreMedicineMatch = (medicine, query) => {
    const q = (query || "").trim().toLowerCase();
    if (!q) return 1;

    const fields = [
        medicine.name || "",
        medicine.genericName || "",
        medicine.category || "",
        medicine.manufacturer || "",
        ...(medicine.aliases || [])
    ].map((f) => f.toLowerCase());

    const terms = expandQueryTerms(q);
    let bestScore = 0;

    for (const term of terms) {
        if (term.length < 3) continue;
        for (const field of fields) {
            if (!field) continue;
            if (field === term) {
                bestScore = Math.max(bestScore, 1.0);
            } else if (field.startsWith(term)) {
                bestScore = Math.max(bestScore, 0.9);
            } else if (field.includes(term)) {
                bestScore = Math.max(bestScore, 0.8);
            } else {
                const words = field.split(/\s+/);
                for (const w of words) {
                    if (w.length >= 3 && term.length >= 3) {
                        const dist = levenshtein(w, term);
                        const maxAllowed = term.length <= 5 ? 1 : 2;
                        if (dist <= maxAllowed) {
                            bestScore = Math.max(
                                bestScore,
                                0.72 - dist * 0.1
                            );
                        }
                    }
                }
            }
        }
    }

    return bestScore;
};

module.exports = {
    levenshtein,
    expandQueryTerms,
    scoreMedicineMatch
};
