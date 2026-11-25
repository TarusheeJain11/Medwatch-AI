// Resolves consistent product/medicine/pharmacy imagery and pharmaceutical metadata

const MEDICINE_IMAGE_MAP = [
    { match: /inhaler|respirat|salbutamol|asthma|nebul|aerosol/i, img: "/images/meds/inhaler.svg", form: "Inhaler / Aerosol" },
    { match: /syrup|liquid|solution|suspension|drops|elixir|oral/i, img: "/images/meds/syrup.svg", form: "Oral Liquid / Drops" },
    { match: /gel|ointment|cream|topical|lotion|iodine|chlorhexidine|diclofenac/i, img: "/images/meds/topical.svg", form: "Topical Gel / Antiseptic" },
    { match: /injection|vial|ampoule|insulin|syringe|vaccine/i, img: "/images/meds/injection.svg", form: "Injectable / Vial" },
    { match: /vitamin|ascorbic|cholecalciferol|methylcobalamin|folic|calcium|zinc|biotin|thiamine|riboflavin|niacin|mineral|supplement/i, img: "/images/meds/vitamins.svg", form: "Vitamins & Supplements" },
    { match: /capsule|softgel|omeprazole|pantoprazole/i, img: "/images/meds/capsule.svg", form: "Capsule / Softgel" },
    { match: /sachet|ors|electrolyte|powder/i, img: "/images/meds/sachet.svg", form: "Oral Sachet / Powder" },
    { match: /.*/, img: "/images/meds/tablet.svg", form: "Tablet" }
];

const PRODUCT_IMAGE_MAP = [
    { match: /thermometer|infrared/i, img: "/images/products/thermometer.svg" },
    { match: /oximeter|pulse/i, img: "/images/products/oximeter.svg" },
    { match: /bp monitor|blood pressure|cuff/i, img: "/images/products/bp-monitor.svg" },
    { match: /first-aid|bandage|gauze|cotton|antiseptic/i, img: "/images/products/first-aid.svg" },
    { match: /organizer|pill|box/i, img: "/images/products/pill-organizer.svg" },
    { match: /bottle|flask|hydration|electrolyte/i, img: "/images/products/hydration.svg" },
    { match: /gel|compress|pack|hot & cold|orthopedic|knee|sleeve|support/i, img: "/images/products/recovery-care.svg" },
    { match: /mask|n95|respirator|sanitizer|hygiene/i, img: "/images/products/hygiene.svg" },
    { match: /vaporizer|steam/i, img: "/images/products/vaporizer.svg" },
    { match: /wristband|braille|label|elder|accessibility/i, img: "/images/products/accessibility.svg" },
    { match: /.*/, img: "/images/products/wellness-default.svg" }
];

const resolveMedicineMedia = (med = {}) => {
    const haystack = `${med.name || ""} ${med.genericName || ""} ${med.category || ""} ${med.dosage || ""}`;
    const entry = MEDICINE_IMAGE_MAP.find((r) => r.match.test(haystack)) || MEDICINE_IMAGE_MAP[MEDICINE_IMAGE_MAP.length - 1];
    return {
        imageUrl: med.imageUrl || entry.img,
        dosageFormLabel: entry.form
    };
};

const resolveProductImage = (product = {}) => {
    if (product.imageUrl) return product.imageUrl;
    const haystack = `${product.name || ""} ${product.category || ""} ${product.description || ""}`;
    const entry = PRODUCT_IMAGE_MAP.find((r) => r.match.test(haystack)) || PRODUCT_IMAGE_MAP[PRODUCT_IMAGE_MAP.length - 1];
    return entry.img;
};

const resolvePharmacyImage = (pharmacy = {}) => {
    if (pharmacy.imageUrl) return pharmacy.imageUrl;
    const feats = (pharmacy.accessibilityFeatures || []).join(" ");
    if (/24x7|24 hours|emergency/i.test(`${pharmacy.openingHours || ""} ${feats}`)) {
        return "/images/pharmacy-24x7.svg";
    }
    return "/images/pharmacy-verified.svg";
};

const buildPubChemStructureUrl = (genericName = "") => {
    const clean = String(genericName || "")
        .replace(/\b\d+\s*(mg|mcg|iu|ml|g|%)\b/gi, "")
        .replace(/\(.*?\)/g, "")
        .trim()
        .split(/[,/]/)[0]
        .trim();
    if (!clean || clean.length < 3) return "";
    return `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(clean)}/PNG?image_size=320x320`;
};

module.exports = {
    resolveMedicineMedia,
    resolveProductImage,
    resolvePharmacyImage,
    buildPubChemStructureUrl
};
