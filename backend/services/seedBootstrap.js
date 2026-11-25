const bcrypt = require("bcryptjs");
const Medicine = require("../models/Medicine");
const Pharmacy = require("../models/Pharmacy");
const DemoProduct = require("../models/DemoProduct");
const FeatureFlag = require("../models/FeatureFlag");
const KnowledgeDoc = require("../models/KnowledgeDoc");
const SourceRecord = require("../models/SourceRecord");
const User = require("../models/User");

const DEFAULT_DEMO_PRODUCTS = [
    {
        sku: "DEMO-KIT-01",
        name: "Demo Daily Wellness Organizer",
        category: "Non-Medical Demo Kit",
        description: "7-day labelled organizer box used exclusively to test cart, checkout, and tracking lifecycle.",
        unitPrice: 149,
        maxQuantity: 5,
        inStock: true
    },
    {
        sku: "DEMO-POUCH-02",
        name: "Demo First-Aid Travel Pouch (Empty Case)",
        category: "Non-Medical Demo Kit",
        description: "Empty zippered demo travel organizer for testing partner fulfillment and receipt workflows.",
        unitPrice: 249,
        maxQuantity: 4,
        inStock: true
    },
    {
        sku: "DEMO-BOTTLE-03",
        name: "Demo Insulated Hydration Bottle",
        category: "Non-Medical Wellness",
        description: "Fictional non-medical catalog item for sandbox payment and delivery tracking validation.",
        unitPrice: 399,
        maxQuantity: 3,
        inStock: true
    },
    {
        sku: "DEMO-PACK-04",
        name: "Demo Hot & Cold Reusable Gel Pack",
        category: "Non-Medical Wellness",
        description: "Reusable comfort pack for testing quantity validation and delivery exception workflows.",
        unitPrice: 199,
        maxQuantity: 5,
        inStock: true
    }
];

const DEFAULT_FEATURE_FLAGS = [
    {
        key: "ai_assistant",
        label: "AI Educational Assistant (RAG)",
        description: "Enables natural-language catalog retrieval with citations and clinical abstention guardrails.",
        enabled: true,
        rolloutStage: "pilot"
    },
    {
        key: "demo_orders",
        label: "Demo Non-Medical Order Lifecycle",
        description: "Enables fictional non-medical cart, sandbox checkout, and partner fulfillment queue.",
        enabled: true,
        rolloutStage: "pilot"
    },
    {
        key: "live_tracking_sim",
        label: "Synthetic Live Delivery Tracking (SSE)",
        description: "Enables simulated courier waypoint updates over Server-Sent Events.",
        enabled: true,
        rolloutStage: "pilot"
    },
    {
        key: "multilingual_ui",
        label: "Multilingual UI (EN / HI / PA)",
        description: "Enables English, Hindi, and Punjabi interface localization.",
        enabled: true,
        rolloutStage: "pilot"
    },
    {
        key: "regulated_checkout",
        label: "Regulated Medication Checkout",
        description: "MUST remain disabled pending independent clinical, pharmacy, and legal review.",
        enabled: false,
        rolloutStage: "disabled"
    }
];

const DEFAULT_KNOWLEDGE_DOCS = [
    {
        title: "About MedWatch AI & Educational Scope",
        category: "policy",
        language: "en",
        content: "MedWatch AI is an India-first healthcare information and pharmacy operations pilot platform. Catalog entries and prices are educational/simulated demonstrations unless explicitly marked as verified partner submissions. MedWatch AI does not sell prescription medicines or provide medical advice.",
        sourceCitation: "MedWatch AI Product Blueprint v2.0 (Section 01 & 02)",
        tags: ["about", "pilot", "educational", "scope", "disclaimer"]
    },
    {
        title: "Demo Order Cancellation & Sandbox Refund Policy",
        category: "policy",
        language: "en",
        content: "Demo orders use fictional, non-medical items only and collect zero real funds. Free sandbox cancellation is permitted while an order is in draft, submitted, or accepted state before dispatch. Sandbox refunds update receipt status immediately.",
        sourceCitation: "MedWatch AI Demo Commerce Policy v2.0 (Section 05)",
        tags: ["order", "cancel", "refund", "fee", "cancellation", "policy", "payment"]
    },
    {
        title: "DPDP Act 2023 & Privacy Safeguards",
        category: "safety",
        language: "en",
        content: "In alignment with India DPDP Act 2023 and Rules 2025 principles, users can manage consent preferences, download a full JSON export of their account data, and request account deletion from the Account Privacy tab. Live tracking uses synthetic coordinates and stops sharing once delivery completes.",
        sourceCitation: "MedWatch AI Privacy & Compliance Guide v2.0 (Section 06 & 11)",
        tags: ["privacy", "dpdp", "data", "export", "delete", "tracking", "location"]
    },
    {
        title: "Accessibility & Multilingual Support",
        category: "accessibility",
        language: "en",
        content: "MedWatch AI targets WCAG 2.2 AA accessibility with keyboard navigation, visible focus rings, reduced-motion support, low-bandwidth mode, and English, Hindi, and Punjabi language options. Verified pharmacies list step-free entrance and printed large-font label availability.",
        sourceCitation: "MedWatch AI Accessibility Statement v2.0 (Section 03)",
        tags: ["accessibility", "wcag", "hindi", "punjabi", "language", "bandwidth", "wheelchair"]
    },
    {
        title: "मेडवॉच एआई शैक्षिक जानकारी (Hindi Guide)",
        category: "faq",
        language: "hi",
        content: "MedWatch AI केवल शैक्षिक दवा जानकारी, सत्यापित फार्मेसी निर्देशिका और गैर-चिकित्सीय डेमो ऑर्डर की सुविधा देता है। यह चिकित्सीय सलाह या प्रिस्क्रिप्शन दवाओं की बिक्री नहीं करता।",
        sourceCitation: "MedWatch AI Hindi Help Center v2.0",
        tags: ["hindi", "help", "madad", "मदद", "दवा"]
    },
    {
        title: "ਮੇਡਵਾਚ ਏਆਈ ਜਾਣਕਾਰੀ (Punjabi Guide)",
        category: "faq",
        language: "pa",
        content: "MedWatch AI ਸਿਰਫ਼ ਵਿੱਦਿਅਕ ਦਵਾਈ ਜਾਣਕਾਰੀ, ਪ੍ਰਮਾਣਿਤ ਫਾਰਮੇਸੀ ਡਾਇਰੈਕਟਰੀ ਅਤੇ ਗੈਰ-ਮੈਡੀਕਲ ਡੈਮੋ ਆਰਡਰ ਲਈ ਹੈ। ਡਾਕਟਰੀ ਸਲਾਹ ਲਈ ਹਮੇਸ਼ਾ ਲਾਇਸੰਸਸ਼ੁਦਾ ਡਾਕਟਰ ਨਾਲ ਸੰਪਰਕ ਕਰੋ।",
        sourceCitation: "MedWatch AI Punjabi Help Center v2.0",
        tags: ["punjabi", "help", "ਮਦਦ", "ਦਵਾਈ"]
    }
];

const DEFAULT_SOURCE_RECORDS = [
    {
        sourceName: "Pilot Educational Catalog Feed",
        sourceType: "catalog_feed",
        status: "synced",
        recordsProcessed: 20,
        recordsFlagged: 0,
        checksum: "sha256:pilot-cat-v2",
        provenanceNote: "Initial educational vitamins, minerals & paracetamol reference dataset"
    },
    {
        sourceName: "Jalandhar Pilot Pharmacy Registry",
        sourceType: "license_registry",
        status: "synced",
        recordsProcessed: 7,
        recordsFlagged: 1,
        checksum: "sha256:pilot-pharm-v2",
        provenanceNote: "Demo and owner-submitted partner listings; unverified entries held back from verified badge"
    },
    {
        sourceName: "Partner POS Nightly Reconciliation (Sandbox)",
        sourceType: "partner_inventory",
        status: "pending",
        recordsProcessed: 102,
        recordsFlagged: 2,
        checksum: "sha256:pos-sandbox-01",
        provenanceNote: "Awaiting next scheduled sandbox inventory sync"
    }
];

const bootstrapDatabase = async () => {
    // 1. Seed Demo Non-Medical Products
    for (const prod of DEFAULT_DEMO_PRODUCTS) {
        await DemoProduct.updateOne(
            { sku: prod.sku },
            { $setOnInsert: prod },
            { upsert: true }
        );
    }

    // 2. Seed Feature Flags
    for (const flag of DEFAULT_FEATURE_FLAGS) {
        await FeatureFlag.updateOne(
            { key: flag.key },
            { $setOnInsert: flag },
            { upsert: true }
        );
    }

    // 3. Seed Knowledge Docs
    for (const doc of DEFAULT_KNOWLEDGE_DOCS) {
        await KnowledgeDoc.updateOne(
            { title: doc.title },
            { $setOnInsert: doc },
            { upsert: true }
        );
    }

    // 4. Seed Source Records if empty
    const sourceCount = await SourceRecord.countDocuments();
    if (sourceCount === 0) {
        await SourceRecord.insertMany(DEFAULT_SOURCE_RECORDS);
    }

    // 5. Enrich existing Medicines lacking sourceCitation or aliases
    const aliasMap = {
        "Paracetamol 500mg": ["bukhar", "dard", "fever", "acetaminophen", "crocin", "dolo"],
        "Vitamin C": ["ascorbic", "immunity", "citrus"],
        "Vitamin D3": ["haddi", "cholecalciferol", "sunlight", "bone"],
        "Vitamin B12": ["kamzori", "khoon", "cyanocobalamin", "nerve"],
        "Folic Acid": ["khoon", "folate", "vitamin b9"],
        "Calcium Carbonate": ["haddi", "bone", "calcium"],
        "Zinc Sulfate": ["immunity", "baal", "zinc"]
    };

    const meds = await Medicine.find();
    for (const m of meds) {
        let changed = false;
        if (!m.sourceCitation) {
            m.sourceCitation = "MedWatch Pilot Educational Dataset (Simulated)";
            changed = true;
        }
        if (!m.editorialStatus) {
            m.editorialStatus = "verified";
            changed = true;
        }
        if (!m.aliases || m.aliases.length === 0) {
            m.aliases = aliasMap[m.name] || [m.category || "supplement"];
            changed = true;
        }
        if (changed) await m.save();
    }

    // 6. Sync Pharmacy verificationStatus with existing isVerified boolean
    const pharmacies = await Pharmacy.find();
    for (const p of pharmacies) {
        let changed = false;
        if (p.isVerified && p.verificationStatus !== "verified") {
            p.verificationStatus = "verified";
            changed = true;
        } else if (!p.isVerified && !p.verificationStatus) {
            p.verificationStatus = "pending";
            changed = true;
        }
        if (!p.openingHours) {
            p.openingHours = "08:00 AM - 10:00 PM (Mon–Sun)";
            changed = true;
        }
        if (!p.licenseNumber) {
            p.licenseNumber = `PB-JAL-DEMO-${String(p._id).slice(-4).toUpperCase()}`;
            changed = true;
        }
        if (!p.licenseExpiry) {
            p.licenseExpiry = new Date(Date.now() + 240 * 24 * 60 * 60 * 1000);
            changed = true;
        }
        if (changed) await p.save();
    }

    // 7. Ensure demo accounts have usable pilot passwords if missing/requested via env
    // Do NOT alter existing user passwords! Only ensure a pilot demo customer/partner/admin exist if absent.
    const demoUsers = [
        {
            name: "Pilot Demo Customer",
            email: "pilot.customer@medwatch.demo",
            role: "customer",
            isVerified: true
        },
        {
            name: "Pilot Demo Partner",
            email: "pilot.partner@medwatch.demo",
            role: "pharmacy",
            isVerified: true
        },
        {
            name: "Pilot Demo Admin",
            email: "pilot.admin@medwatch.demo",
            role: "admin",
            isVerified: true
        }
    ];

    for (const du of demoUsers) {
        const exists = await User.findOne({ email: du.email });
        if (!exists) {
            const hashedPassword = await bcrypt.hash("MedWatchPilot!2026", 12);
            const created = await User.create({
                ...du,
                password: hashedPassword,
                emailVerified: true,
                isActive: true,
                dpdpConsent: {
                    acceptedAt: new Date(),
                    analyticsOptIn: true,
                    notificationsOptIn: true
                }
            });
            if (du.role === "pharmacy") {
                await Pharmacy.updateOne(
                    { name: "Pilot Verified Care Pharmacy" },
                    {
                        $setOnInsert: {
                            name: "Pilot Verified Care Pharmacy",
                            address: "24 Civil Lines, Near Model Town",
                            city: "Jalandhar",
                            phone: "+91-181-5550199",
                            contactEmail: du.email,
                            openingHours: "08:00 AM - 11:00 PM (Mon–Sun)",
                            accessibilityFeatures: [
                                "Step-free wheelchair ramp",
                                "Printed large-font labels",
                                "Priority seating"
                            ],
                            serviceArea: "Civil Lines, Model Town, Urban Estate",
                            licenseNumber: "PB-JAL-2026-DEMO-01",
                            licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                            owner: created._id,
                            isVerified: true,
                            verificationStatus: "verified",
                            posSandboxKey: "sbx_pos_pilot_verified_01",
                            isDemo: true
                        }
                    },
                    { upsert: true }
                );
            }
        }
    }
};

module.exports = { bootstrapDatabase };
