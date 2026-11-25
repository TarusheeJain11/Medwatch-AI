require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const connectDB = require("../db");
const Medicine = require("../models/Medicine");
const DemoProduct = require("../models/DemoProduct");
const Pharmacy = require("../models/Pharmacy");
const {
    resolveMedicineMedia,
    resolveProductImage,
    resolvePharmacyImage,
    buildPubChemStructureUrl
} = require("../services/mediaResolver");

const IMG_ROOT = path.resolve(__dirname, "../../frontend/public/images");

const svgWrap = (bg1, bg2, accent, title, inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" role="img" aria-label="${title}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bg1}"/>
      <stop offset="100%" stop-color="${bg2}"/>
    </linearGradient>
  </defs>
  <rect width="320" height="200" rx="18" fill="url(#bg)"/>
  <circle cx="270" cy="36" r="46" fill="${accent}" opacity="0.08"/>
  <circle cx="48" cy="172" r="54" fill="${accent}" opacity="0.07"/>
  ${inner}
</svg>`;

const MED_SVGS = {
    "tablet.svg": svgWrap("#E6F7F7", "#F4FBFC", "#087E80", "Medicine Tablets", `
      <rect x="78" y="46" width="164" height="108" rx="14" fill="#FFFFFF" stroke="#B7D7DA" stroke-width="3"/>
      <circle cx="118" cy="80" r="14" fill="#087E80" opacity="0.18" stroke="#087E80" stroke-width="2.5"/>
      <line x1="108" y1="80" x2="128" y2="80" stroke="#087E80" stroke-width="2"/>
      <circle cx="160" cy="80" r="14" fill="#087E80" opacity="0.18" stroke="#087E80" stroke-width="2.5"/>
      <line x1="150" y1="80" x2="170" y2="80" stroke="#087E80" stroke-width="2"/>
      <circle cx="202" cy="80" r="14" fill="#087E80" opacity="0.18" stroke="#087E80" stroke-width="2.5"/>
      <line x1="192" y1="80" x2="212" y2="80" stroke="#087E80" stroke-width="2"/>
      <circle cx="118" cy="120" r="14" fill="#0D9488" opacity="0.22" stroke="#087E80" stroke-width="2.5"/>
      <circle cx="160" cy="120" r="14" fill="#0D9488" opacity="0.22" stroke="#087E80" stroke-width="2.5"/>
      <circle cx="202" cy="120" r="14" fill="#0D9488" opacity="0.22" stroke="#087E80" stroke-width="2.5"/>
    `),
    "capsule.svg": svgWrap("#EFF6FF", "#F8FAFC", "#1D4ED8", "Medicine Capsules", `
      <g transform="rotate(-24 140 100)">
        <rect x="85" y="78" width="110" height="44" rx="22" fill="#FFFFFF" stroke="#1D4ED8" stroke-width="3"/>
        <path d="M140 78 H173 A22 22 0 0 1 173 122 H140 Z" fill="#1D4ED8" opacity="0.85"/>
      </g>
      <g transform="rotate(18 206 112)">
        <rect x="155" y="92" width="96" height="38" rx="19" fill="#FFFFFF" stroke="#087E80" stroke-width="3"/>
        <path d="M203 92 H232 A19 19 0 0 1 232 130 H203 Z" fill="#087E80" opacity="0.85"/>
      </g>
    `),
    "syrup.svg": svgWrap("#F0FDF4", "#F7FEFA", "#0F766E", "Oral Syrup Bottle", `
      <rect x="132" y="34" width="56" height="20" rx="5" fill="#15364A"/>
      <path d="M126 54 H194 L206 76 V154 A12 12 0 0 1 194 166 H126 A12 12 0 0 1 114 154 V76 Z" fill="#FFFFFF" stroke="#0F766E" stroke-width="3"/>
      <rect x="122" y="92" width="76" height="50" rx="6" fill="#CCFBF1" stroke="#0F766E" stroke-width="2"/>
      <path d="M156 104 V130 M143 117 H169" stroke="#0F766E" stroke-width="4" stroke-linecap="round"/>
    `),
    "inhaler.svg": svgWrap("#ECFEFF", "#F5FAFA", "#0284C7", "Respiratory Inhaler", `
      <path d="M128 44 H176 V122 L212 134 V162 H128 A14 14 0 0 1 114 148 V58 A14 14 0 0 1 128 44 Z" fill="#FFFFFF" stroke="#0284C7" stroke-width="3"/>
      <rect x="138" y="28" width="28" height="24" rx="4" fill="#0284C7"/>
      <rect x="132" y="68" width="38" height="44" rx="6" fill="#E0F2FE"/>
      <path d="M222 140 Q242 132 252 142 M222 150 Q244 150 256 156" stroke="#0284C7" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    `),
    "topical.svg": svgWrap("#FEFCE8", "#FFFDF4", "#B45309", "Topical Gel Tube", `
      <g transform="rotate(-15 160 102)">
        <rect x="86" y="76" width="124" height="48" rx="8" fill="#FFFFFF" stroke="#B45309" stroke-width="3"/>
        <rect x="210" y="90" width="24" height="20" rx="3" fill="#B45309"/>
        <rect x="108" y="88" width="74" height="24" rx="4" fill="#FEF3C7"/>
        <path d="M145 93 V107 M138 100 H152" stroke="#B45309" stroke-width="3" stroke-linecap="round"/>
      </g>
    `),
    "injection.svg": svgWrap("#F5F3FF", "#FAF9FF", "#6D28D9", "Injectable Vial", `
      <rect x="92" y="62" width="52" height="96" rx="8" fill="#FFFFFF" stroke="#6D28D9" stroke-width="3"/>
      <rect x="104" y="46" width="28" height="16" rx="3" fill="#6D28D9"/>
      <rect x="100" y="96" width="36" height="42" rx="4" fill="#EDE9FE"/>
      <rect x="172" y="54" width="18" height="84" rx="4" fill="#FFFFFF" stroke="#087E80" stroke-width="2.5"/>
      <line x1="181" y1="32" x2="181" y2="54" stroke="#087E80" stroke-width="2.5"/>
      <line x1="181" y1="138" x2="181" y2="166" stroke="#087E80" stroke-width="4"/>
    `),
    "vitamins.svg": svgWrap("#FFF7ED", "#FFFBF5", "#EA580C", "Vitamins and Minerals", `
      <rect x="108" y="42" width="104" height="122" rx="14" fill="#FFFFFF" stroke="#EA580C" stroke-width="3"/>
      <rect x="122" y="28" width="76" height="18" rx="5" fill="#EA580C"/>
      <rect x="118" y="68" width="84" height="72" rx="8" fill="#FFEDD5"/>
      <circle cx="160" cy="104" r="22" fill="#EA580C"/>
      <text x="160" y="111" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" font-weight="bold" fill="#FFFFFF">V+</text>
    `),
    "sachet.svg": svgWrap("#ECFDF5", "#F6FEF9", "#059669", "Electrolyte Sachet", `
      <rect x="96" y="40" width="128" height="120" rx="10" fill="#FFFFFF" stroke="#059669" stroke-width="3"/>
      <line x1="96" y1="58" x2="224" y2="58" stroke="#059669" stroke-width="2" stroke-dasharray="5 4"/>
      <circle cx="160" cy="108" r="26" fill="#D1FAE5" stroke="#059669" stroke-width="2.5"/>
      <path d="M160 92 C170 105 170 118 160 122 C150 118 150 105 160 92 Z" fill="#059669"/>
    `)
};

const PROD_SVGS = {
    "thermometer.svg": svgWrap("#E0F2FE", "#F4FAFF", "#0284C7", "Digital Infrared Thermometer", `
      <path d="M104 54 H188 C202 54 210 64 210 76 C210 88 200 96 186 96 H156 L142 158 H116 L128 96 H104 Z" fill="#FFFFFF" stroke="#0284C7" stroke-width="3"/>
      <rect x="150" y="64" width="38" height="22" rx="4" fill="#0F172A"/>
      <text x="169" y="79" text-anchor="middle" font-family="monospace" font-size="11" fill="#38BDF8">98.6°</text>
    `),
    "oximeter.svg": svgWrap("#EEF2FF", "#F8FAFF", "#4F46E5", "Pulse Oximeter", `
      <rect x="106" y="54" width="108" height="92" rx="18" fill="#FFFFFF" stroke="#4F46E5" stroke-width="3"/>
      <rect x="122" y="70" width="76" height="46" rx="8" fill="#1E1B4B"/>
      <text x="160" y="91" text-anchor="middle" font-family="monospace" font-size="16" font-weight="bold" fill="#34D399">SpO2 98%</text>
      <text x="160" y="109" text-anchor="middle" font-family="monospace" font-size="12" fill="#F472B6">PR 72 bpm</text>
    `),
    "bp-monitor.svg": svgWrap("#F0FDFA", "#F8FEFE", "#087E80", "Blood Pressure Monitor", `
      <rect x="86" y="48" width="104" height="106" rx="14" fill="#FFFFFF" stroke="#087E80" stroke-width="3"/>
      <rect x="102" y="62" width="72" height="50" rx="6" fill="#E6F4F4" stroke="#087E80" stroke-width="1.5"/>
      <text x="138" y="84" text-anchor="middle" font-family="monospace" font-size="15" font-weight="bold" fill="#15364A">120/80</text>
      <text x="138" y="102" text-anchor="middle" font-family="monospace" font-size="11" fill="#087E80">PULSE 74</text>
      <circle cx="138" cy="134" r="10" fill="#087E80"/>
      <rect x="204" y="68" width="38" height="72" rx="8" fill="#CCFBF1" stroke="#087E80" stroke-width="2.5"/>
      <path d="M190 124 H204" stroke="#087E80" stroke-width="3"/>
    `),
    "first-aid.svg": svgWrap("#FEF2F2", "#FFF9F9", "#DC2626", "First Aid Kit", `
      <rect x="82" y="54" width="156" height="108" rx="14" fill="#FFFFFF" stroke="#DC2626" stroke-width="3"/>
      <path d="M132 54 V40 H188 V54" fill="none" stroke="#DC2626" stroke-width="4"/>
      <circle cx="160" cy="108" r="30" fill="#FEE2E2"/>
      <path d="M160 88 V128 M140 108 H180" stroke="#DC2626" stroke-width="8" stroke-linecap="round"/>
    `),
    "pill-organizer.svg": svgWrap("#ECFEFF", "#F8FEFF", "#0891B2", "7-Day Pill Organizer", `
      <rect x="62" y="66" width="196" height="68" rx="12" fill="#FFFFFF" stroke="#0891B2" stroke-width="3"/>
      <line x1="90" y1="66" x2="90" y2="134" stroke="#0891B2" stroke-width="2"/>
      <line x1="118" y1="66" x2="118" y2="134" stroke="#0891B2" stroke-width="2"/>
      <line x1="146" y1="66" x2="146" y2="134" stroke="#0891B2" stroke-width="2"/>
      <line x1="174" y1="66" x2="174" y2="134" stroke="#0891B2" stroke-width="2"/>
      <line x1="202" y1="66" x2="202" y2="134" stroke="#0891B2" stroke-width="2"/>
      <line x1="230" y1="66" x2="230" y2="134" stroke="#0891B2" stroke-width="2"/>
      <circle cx="76" cy="100" r="6" fill="#087E80"/><circle cx="104" cy="100" r="6" fill="#0284C7"/>
      <circle cx="132" cy="100" r="6" fill="#087E80"/><circle cx="160" cy="100" r="6" fill="#0284C7"/>
      <circle cx="188" cy="100" r="6" fill="#087E80"/><circle cx="216" cy="100" r="6" fill="#0284C7"/>
      <circle cx="244" cy="100" r="6" fill="#087E80"/>
    `),
    "hydration.svg": svgWrap("#E0F2FE", "#F5FAFF", "#0369A1", "Hydration Flask", `
      <rect x="138" y="28" width="44" height="18" rx="5" fill="#15364A"/>
      <rect x="122" y="46" width="76" height="120" rx="18" fill="#FFFFFF" stroke="#0369A1" stroke-width="3"/>
      <rect x="130" y="92" width="60" height="62" rx="10" fill="#BAE6FD"/>
      <path d="M160 66 C168 78 168 86 160 90 C152 86 152 78 160 66 Z" fill="#0369A1"/>
    `),
    "recovery-care.svg": svgWrap("#EFF6FF", "#F9FBFF", "#2563EB", "Hot and Cold Gel Compress", `
      <rect x="88" y="48" width="144" height="104" rx="18" fill="#DBEAFE" stroke="#2563EB" stroke-width="3"/>
      <circle cx="132" cy="100" r="18" fill="#93C5FD"/>
      <circle cx="186" cy="100" r="18" fill="#60A5FA"/>
      <text x="160" y="106" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" font-weight="bold" fill="#1E3A8A">GEL</text>
    `),
    "hygiene.svg": svgWrap("#F0FDF4", "#F9FEFB", "#15803D", "Hygiene and Respirator", `
      <path d="M96 86 Q160 54 224 86 L210 138 Q160 154 110 138 Z" fill="#FFFFFF" stroke="#15803D" stroke-width="3"/>
      <path d="M96 86 C74 86 74 128 110 132 M224 86 C246 86 246 128 210 132" fill="none" stroke="#15803D" stroke-width="3"/>
      <text x="160" y="114" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" font-weight="bold" fill="#15803D">N95</text>
    `),
    "vaporizer.svg": svgWrap("#ECFEFF", "#F7FEFF", "#0E7490", "Steam Vaporizer", `
      <path d="M112 104 H208 L196 158 H124 Z" fill="#FFFFFF" stroke="#0E7490" stroke-width="3"/>
      <path d="M134 104 L148 64 H182 L176 104" fill="#CFFAFE" stroke="#0E7490" stroke-width="3"/>
      <path d="M156 50 Q148 38 158 28 M172 50 Q164 38 174 28" fill="none" stroke="#0E7490" stroke-width="2.5" stroke-linecap="round"/>
    `),
    "accessibility.svg": svgWrap("#FEF3C7", "#FFFDF7", "#B45309", "Accessibility Care Kit", `
      <rect x="86" y="64" width="148" height="72" rx="14" fill="#FFFFFF" stroke="#B45309" stroke-width="3"/>
      <circle cx="118" cy="90" r="5" fill="#B45309"/><circle cx="136" cy="90" r="5" fill="#B45309"/>
      <circle cx="118" cy="110" r="5" fill="#B45309"/><circle cx="136" cy="110" r="5" fill="#087E80"/>
      <text x="186" y="106" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" font-weight="bold" fill="#15364A">CARE</text>
    `),
    "wellness-default.svg": svgWrap("#E5F4F4", "#F5FAFA", "#087E80", "MedWatch Wellness Product", `
      <rect x="100" y="48" width="120" height="104" rx="16" fill="#FFFFFF" stroke="#087E80" stroke-width="3"/>
      <path d="M160 76 V124 M136 100 H184" stroke="#087E80" stroke-width="8" stroke-linecap="round"/>
    `)
};

const PHARMACY_SVGS = {
    "pharmacy-verified.svg": svgWrap("#E6F7F7", "#F7FCFC", "#087E80", "Verified Pharmacy", `
      <rect x="76" y="62" width="168" height="102" rx="10" fill="#FFFFFF" stroke="#087E80" stroke-width="3"/>
      <path d="M68 62 L84 36 H236 L252 62 Z" fill="#087E80"/>
      <rect x="142" y="108" width="36" height="56" rx="4" fill="#CCFBF1" stroke="#087E80" stroke-width="2"/>
      <path d="M160 74 V96 M149 85 H171" stroke="#087E80" stroke-width="5" stroke-linecap="round"/>
    `),
    "pharmacy-24x7.svg": svgWrap("#ECFDF5", "#F6FEF9", "#0F766E", "24x7 Verified Pharmacy", `
      <rect x="76" y="62" width="168" height="102" rx="10" fill="#FFFFFF" stroke="#0F766E" stroke-width="3"/>
      <path d="M68 62 L84 36 H236 L252 62 Z" fill="#0F766E"/>
      <rect x="116" y="80" width="88" height="36" rx="8" fill="#15364A"/>
      <text x="160" y="105" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" font-weight="bold" fill="#34D399">24×7 OPEN</text>
    `)
};

const badgeSvg = (bg, fg, text, sub = "") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 44" role="img" aria-label="${text}">
  <rect width="120" height="44" rx="8" fill="${bg}" stroke="#CBD5E1" stroke-width="1.5"/>
  <text x="60" y="${sub ? 21 : 27}" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="13" font-weight="800" fill="${fg}">${text}</text>
  ${sub ? `<text x="60" y="35" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="9" font-weight="600" fill="${fg}" opacity="0.8">${sub}</text>` : ""}
</svg>`;

const PAYMENT_SVGS = {
    "upi.svg": badgeSvg("#FFFFFF", "#0F766E", "UPI", "Instant Pay"),
    "gpay.svg": badgeSvg("#FFFFFF", "#1D4ED8", "G Pay", "Google Pay"),
    "phonepe.svg": badgeSvg("#5F259F", "#FFFFFF", "PhonePe", "UPI"),
    "visa.svg": badgeSvg("#1A1F71", "#FFFFFF", "VISA", "3DS Secure"),
    "mastercard.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 44" role="img" aria-label="Mastercard"><rect width="120" height="44" rx="8" fill="#111827"/><circle cx="50" cy="22" r="12" fill="#EB001B"/><circle cx="70" cy="22" r="12" fill="#F79E1B" opacity="0.9"/></svg>`,
    "rupay.svg": badgeSvg("#FFFFFF", "#0F172A", "RuPay", "India Card"),
    "netbanking.svg": badgeSvg("#F0FDFA", "#15364A", "NetBank", "All Banks"),
    "wallet.svg": badgeSvg("#EFF6FF", "#1E40AF", "Wallets", "Paytm / APay"),
    "cod.svg": badgeSvg("#FFFBEB", "#92400E", "COD / UPI", "Pay at Door")
};

const writeGroup = (dir, map) => {
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(map)) {
        fs.writeFileSync(path.join(dir, name), content, "utf8");
    }
};

const run = async () => {
    writeGroup(path.join(IMG_ROOT, "meds"), MED_SVGS);
    writeGroup(path.join(IMG_ROOT, "products"), PROD_SVGS);
    writeGroup(IMG_ROOT, PHARMACY_SVGS);
    writeGroup(path.join(IMG_ROOT, "payments"), PAYMENT_SVGS);
    console.log("Generated all SVG imagery assets under frontend/public/images/");

    await connectDB();

    const meds = await Medicine.find().lean();
    const medOps = meds.map((m) => {
        const media = resolveMedicineMedia(m);
        const struct = m.structureImageUrl || buildPubChemStructureUrl(m.genericName || m.name);
        return {
            updateOne: {
                filter: { _id: m._id },
                update: {
                    $set: {
                        imageUrl: media.imageUrl,
                        structureImageUrl: struct,
                        packSize: m.packSize || "Strip of 10",
                        prescriptionStatus: /vitamin|ascorbic|calcium|zinc|biotin|ors|electrolyte/i.test(`${m.name} ${m.category}`)
                            ? "Supplement"
                            : /paracetamol|ibuprofen|cetirizine|gel|iodine/i.test(m.name)
                                ? "OTC"
                                : "Rx / Reference"
                    }
                }
            }
        };
    });
    if (medOps.length) await Medicine.bulkWrite(medOps);

    const prods = await DemoProduct.find().lean();
    const prodOps = prods.map((p) => ({
        updateOne: {
            filter: { _id: p._id },
            update: {
                $set: {
                    imageUrl: resolveProductImage(p),
                    highlights: p.highlights?.length
                        ? p.highlights
                        : ["Quality-checked healthcare accessory", "Verified local pharmacy dispatch", "Eligible for instant sandbox refund"]
                }
            }
        }
    }));
    if (prodOps.length) await DemoProduct.bulkWrite(prodOps);

    const pharms = await Pharmacy.find().lean();
    const pharmOps = pharms.map((p) => ({
        updateOne: {
            filter: { _id: p._id },
            update: {
                $set: {
                    imageUrl: resolvePharmacyImage(p),
                    servicesOffered: p.servicesOffered?.length
                        ? p.servicesOffered
                        : ["Home Delivery", "Digital GST Invoices", "Pharmacist Counseling"]
                }
            }
        }
    }));
    if (pharmOps.length) await Pharmacy.bulkWrite(pharmOps);

    console.log(`Enriched ${medOps.length} medicines, ${prodOps.length} products, and ${pharmOps.length} pharmacies in MongoDB.`);
    await mongoose.disconnect();
};

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
