const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const MedicinePrice = require("../models/MedicinePrice");
const Medicine = require("../models/Medicine");
const Pharmacy = require("../models/Pharmacy");
const { protect, authorize, isPharmacyOwnerRole } = require("../middleware/authMiddleware");
const { recordAudit } = require("../services/auditService");

// Add or update medicine price + inventory/batch/expiry
router.post("/", protect, authorize("admin", "pharmacy"), async (req, res) => {
    try {
        const {
            medicine,
            pharmacy,
            sellingPrice,
            isAvailable = true,
            batchNumber = "DEMO-B001",
            expiryDate,
            stockQuantity = 50,
            lowStockThreshold = 10,
            supplierName = "Pilot Wellness Distributor",
            recallFlag = false,
            recallNotice = ""
        } = req.body || {};

        if (!mongoose.isObjectIdOrHexString(medicine) || !mongoose.isObjectIdOrHexString(pharmacy)) {
            return res.status(400).json({ success: false, message: "Invalid medicine or pharmacy ID." });
        }

        if (typeof sellingPrice !== "number" || !Number.isFinite(sellingPrice) || sellingPrice <= 0) {
            return res.status(400).json({ success: false, message: "Enter a valid selling price." });
        }

        const [medicineExists, pharmacyData] = await Promise.all([
            Medicine.exists({ _id: medicine }),
            Pharmacy.findById(pharmacy)
        ]);

        if (!medicineExists) return res.status(404).json({ success: false, message: "Medicine not found." });
        if (!pharmacyData) return res.status(404).json({ success: false, message: "Pharmacy not found." });

        if (isPharmacyOwnerRole(req.user.role)) {
            if (!pharmacyData.owner || pharmacyData.owner.toString() !== req.user._id.toString()) {
                return res.status(403).json({ success: false, message: "You do not own this pharmacy." });
            }
        }

        if (!pharmacyData.isVerified || pharmacyData.verificationStatus !== "verified") {
            return res.status(403).json({ success: false, message: "Pharmacy verification required before publishing prices." });
        }

        const price = await MedicinePrice.findOneAndUpdate(
            { medicine, pharmacy },
            {
                $set: {
                    sellingPrice,
                    isAvailable: Boolean(isAvailable),
                    batchNumber: String(batchNumber).trim() || "DEMO-B001",
                    expiryDate: expiryDate ? new Date(expiryDate) : new Date(Date.now() + 180 * 86400000),
                    stockQuantity: Math.max(0, Number(stockQuantity) || 0),
                    lowStockThreshold: Math.max(0, Number(lowStockThreshold) || 10),
                    supplierName: String(supplierName).trim() || "Pilot Wellness Distributor",
                    recallFlag: Boolean(recallFlag),
                    recallNotice: String(recallNotice).trim(),
                    lastUpdated: new Date()
                },
                $setOnInsert: { isDemo: true }
            },
            { new: true, upsert: true, runValidators: true }
        );

        await recordAudit({
            req,
            action: "inventory.price_saved",
            domain: "partner",
            targetType: "Pharmacy",
            targetId: pharmacyData._id,
            summary: `Updated inventory/price for medicine ${medicine}`
        });

        res.status(200).json({
            success: true,
            message: "Inventory & price saved successfully!",
            data: price
        });
    } catch {
        res.status(500).json({ success: false, message: "Failed to save medicine price." });
    }
});

// Get owner's medicine prices & inventory (strict tenant isolation)
router.get("/my", protect, authorize("pharmacy"), async (req, res) => {
    try {
        const pharmacies = await Pharmacy.find({ owner: req.user._id }).select("_id");
        const pharmacyIds = pharmacies.map((item) => item._id);

        const prices = await MedicinePrice.find({ pharmacy: { $in: pharmacyIds } })
            .populate("medicine")
            .populate("pharmacy", "-owner -posSandboxKey")
            .sort({ updatedAt: -1 });

        res.status(200).json({
            success: true,
            count: prices.length,
            data: prices
        });
    } catch {
        res.status(500).json({ success: false, message: "Failed to fetch your prices." });
    }
});

// Partner inventory reports: low stock, expiring batches, recalls
router.get("/my/reports", protect, authorize("pharmacy"), async (req, res) => {
    try {
        const pharmacies = await Pharmacy.find({ owner: req.user._id }).select("_id name");
        const pharmacyIds = pharmacies.map((p) => p._id);

        const items = await MedicinePrice.find({ pharmacy: { $in: pharmacyIds } })
            .populate("medicine", "name genericName mrp")
            .populate("pharmacy", "name city")
            .lean();

        const now = Date.now();
        const thirtyDays = 30 * 86400000;

        const lowStock = items.filter((i) => (i.stockQuantity ?? 50) <= (i.lowStockThreshold ?? 10));
        const expiringSoon = items.filter((i) => i.expiryDate && new Date(i.expiryDate).getTime() - now <= thirtyDays);
        const recalls = items.filter((i) => i.recallFlag);

        res.status(200).json({
            success: true,
            summary: {
                totalSkus: items.length,
                lowStockCount: lowStock.length,
                expiringSoonCount: expiringSoon.length,
                recallCount: recalls.length
            },
            lowStock,
            expiringSoon,
            recalls
        });
    } catch {
        res.status(500).json({ success: false, message: "Failed to build inventory reports." });
    }
});

// CSV Preview & Validation (Section 04 P1)
const parseCsvText = (csvText) => {
    const lines = String(csvText || "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    if (lines.length < 2) return { headers: [], rows: [] };
    const headers = lines[0].split(",").map((h) => h.trim());
    const rows = lines.slice(1).map((line, idx) => {
        const cols = line.split(",").map((c) => c.trim());
        const obj = { _rowNumber: idx + 2 };
        headers.forEach((h, i) => {
            obj[h] = cols[i] ?? "";
        });
        return obj;
    });
    return { headers, rows };
};

router.post("/csv-preview", protect, authorize("pharmacy"), async (req, res) => {
    try {
        const { csvText = "", pharmacyId } = req.body || {};
        const pharmacy = await Pharmacy.findOne({ _id: pharmacyId, owner: req.user._id });
        if (!pharmacy) {
            return res.status(404).json({ success: false, message: "Owned pharmacy not found." });
        }

        const { rows } = parseCsvText(csvText);
        if (rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: "CSV must include header row (medicineName,sellingPrice,stockQuantity,batchNumber,expiryDate) and at least one data row."
            });
        }

        const medicines = await Medicine.find().lean();
        const medByName = new Map(medicines.map((m) => [m.name.toLowerCase(), m]));

        const preview = rows.map((row) => {
            const med = medByName.get((row.medicineName || "").toLowerCase());
            const price = Number(row.sellingPrice);
            const stock = Number(row.stockQuantity || 25);
            const errors = [];
            if (!med) errors.push("Unknown medicineName in catalog");
            if (!Number.isFinite(price) || price <= 0) errors.push("Invalid sellingPrice");
            if (!Number.isFinite(stock) || stock < 0) errors.push("Invalid stockQuantity");
            return {
                rowNumber: row._rowNumber,
                medicineName: row.medicineName,
                medicineId: med?._id || null,
                sellingPrice: price,
                stockQuantity: stock,
                batchNumber: row.batchNumber || "CSV-BATCH",
                expiryDate: row.expiryDate || "",
                valid: errors.length === 0,
                errors
            };
        });

        res.status(200).json({
            success: true,
            pharmacyVerified: pharmacy.isVerified,
            validCount: preview.filter((r) => r.valid).length,
            invalidCount: preview.filter((r) => !r.valid).length,
            preview
        });
    } catch {
        res.status(500).json({ success: false, message: "CSV preview failed." });
    }
});

router.post("/csv-import", protect, authorize("pharmacy"), async (req, res) => {
    try {
        const { pharmacyId, rows = [] } = req.body || {};
        const pharmacy = await Pharmacy.findOne({ _id: pharmacyId, owner: req.user._id });
        if (!pharmacy) {
            return res.status(404).json({ success: false, message: "Owned pharmacy not found." });
        }
        if (!pharmacy.isVerified) {
            return res.status(403).json({ success: false, message: "Pharmacy must be verified before CSV import." });
        }

        let imported = 0;
        for (const row of rows) {
            if (!row.valid || !mongoose.isObjectIdOrHexString(row.medicineId)) continue;
            await MedicinePrice.findOneAndUpdate(
                { medicine: row.medicineId, pharmacy: pharmacy._id },
                {
                    $set: {
                        sellingPrice: Number(row.sellingPrice),
                        stockQuantity: Math.max(0, Number(row.stockQuantity) || 0),
                        batchNumber: String(row.batchNumber || "CSV-BATCH"),
                        expiryDate: row.expiryDate ? new Date(row.expiryDate) : new Date(Date.now() + 180 * 86400000),
                        sourceAttribution: "Partner CSV Import",
                        isAvailable: true,
                        lastUpdated: new Date()
                    },
                    $setOnInsert: { isDemo: true }
                },
                { upsert: true }
            );
            imported++;
        }

        await recordAudit({
            req,
            action: "inventory.csv_imported",
            domain: "partner",
            targetType: "Pharmacy",
            targetId: pharmacy._id,
            summary: `Imported ${imported} inventory records via CSV`
        });

        res.status(200).json({
            success: true,
            message: `Imported ${imported} validated inventory records.`,
            imported
        });
    } catch {
        res.status(500).json({ success: false, message: "CSV import failed." });
    }
});

// Get public medicine prices (paginated)
router.get("/", async (req, res) => {
    try {
        const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));

        const total = await MedicinePrice.countDocuments();
        const prices = await MedicinePrice.find()
            .sort({ lastUpdated: -1 })
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum)
            .populate("medicine")
            .populate({
                path: "pharmacy",
                match: { $or: [{ isVerified: true }, { owner: null }] },
                select: "-owner -posSandboxKey -staff -suppliers"
            });

        const visiblePrices = prices.filter((item) => item.pharmacy && item.medicine);
        res.status(200).json({
            success: true,
            count: visiblePrices.length,
            total,
            page: pageNum,
            totalPages: Math.max(1, Math.ceil(total / limitNum)),
            data: visiblePrices
        });
    } catch {
        res.status(500).json({ success: false, message: "Failed to fetch medicine prices." });
    }
});

// Compare medicine prices
router.get("/compare/:medicineId", async (req, res) => {
    try {
        if (!mongoose.isObjectIdOrHexString(req.params.medicineId)) {
            return res.status(400).json({ success: false, message: "Invalid medicine ID." });
        }

        const prices = await MedicinePrice.find({
            medicine: req.params.medicineId,
            isAvailable: true
        })
            .populate("medicine")
            .populate({
                path: "pharmacy",
                match: { $or: [{ isVerified: true }, { owner: null }] },
                select: "-owner -posSandboxKey -staff -suppliers"
            })
            .sort({ sellingPrice: 1 });

        const visiblePrices = prices.filter((item) => item.pharmacy && item.medicine);

        res.status(200).json({
            success: true,
            count: visiblePrices.length,
            data: visiblePrices
        });
    } catch {
        res.status(500).json({ success: false, message: "Price comparison failed." });
    }
});

module.exports = router;
