const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const Pharmacy = require("../models/Pharmacy");
const Notification = require("../models/Notification");
const AuditEvent = require("../models/AuditEvent");
const { protect, authorize } = require("../middleware/authMiddleware");
const User = require("../models/User");
const { recordAudit } = require("../services/auditService");
const eventBus = require("../services/eventBus");

const validateDetails = (body = {}) => {
    const {
        name,
        address,
        city,
        state = "",
        pinCode = "",
        phone = "",
        contactEmail = "",
        openingHours = "08:00 AM - 10:00 PM (Mon–Sun)",
        accessibilityFeatures = [],
        serviceArea = "Central Sector",
        licenseNumber = "",
        licenseExpiry = null
    } = body;

    if (
        typeof name !== "string" || !name.trim() ||
        typeof address !== "string" || !address.trim() ||
        typeof city !== "string" || !city.trim()
    ) {
        return null;
    }

    return {
        name: name.trim(),
        address: address.trim(),
        city: city.trim(),
        state: typeof state === "string" ? state.trim() : "",
        pinCode: typeof pinCode === "string" ? pinCode.trim() : "",
        phone: typeof phone === "string" ? phone.trim() : "",
        contactEmail: typeof contactEmail === "string" ? contactEmail.trim() : "",
        openingHours:
            typeof openingHours === "string" && openingHours.trim()
                ? openingHours.trim()
                : "08:00 AM - 10:00 PM (Mon–Sun)",
        accessibilityFeatures: Array.isArray(accessibilityFeatures)
            ? accessibilityFeatures.map((s) => String(s).trim()).filter(Boolean)
            : ["Step-free entrance"],
        serviceArea:
            typeof serviceArea === "string" && serviceArea.trim()
                ? serviceArea.trim()
                : city.trim(),
        licenseNumber: typeof licenseNumber === "string" ? licenseNumber.trim() : "",
        licenseExpiry: licenseExpiry ? new Date(licenseExpiry) : null
    };
};

// Public Verified Directory & Public Listings with fast pagination
router.get("/", async (req, res) => {
    try {
        const {
            city = "",
            verifiedOnly = "false",
            accessibility = "",
            q = "",
            page = "1",
            limit = "24"
        } = req.query;

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 24));

        const query =
            verifiedOnly === "true"
                ? { isVerified: true }
                : { $or: [{ isVerified: true }, { owner: null }] };

        if (city && city !== "all") {
            query.city = { $regex: `^${city.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" };
        }
        if (accessibility && accessibility.trim()) {
            query.accessibilityFeatures = {
                $regex: accessibility.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                $options: "i"
            };
        }
        if (q && q.trim()) {
            const safe = q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            query.$and = [
                {
                    $or: [
                        { name: { $regex: safe, $options: "i" } },
                        { address: { $regex: safe, $options: "i" } },
                        { serviceArea: { $regex: safe, $options: "i" } }
                    ]
                }
            ];
        }

        const [total, cities, pharmacies] = await Promise.all([
            Pharmacy.countDocuments(query),
            Pharmacy.distinct("city"),
            Pharmacy.find(query)
                .select("-owner -posSandboxKey -staff -suppliers -rejectionReason -verificationDocuments")
                .sort({ isVerified: -1, name: 1 })
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .lean()
        ]);

        res.status(200).json({
            success: true,
            count: pharmacies.length,
            total,
            page: pageNum,
            totalPages: Math.max(1, Math.ceil(total / limitNum)),
            cities: cities.filter(Boolean).sort(),
            data: pharmacies
        });
    } catch {
        res.status(500).json({
            success: false,
            message: "Failed to fetch pharmacies."
        });
    }
});

// Add pharmacy - Admin only
router.post("/", protect, authorize("admin"), async (req, res) => {
    try {
        const details = validateDetails(req.body);
        if (!details) {
            return res.status(400).json({ success: false, message: "Valid pharmacy details are required." });
        }

        const pharmacy = await Pharmacy.create({
            ...details,
            owner: null,
            isVerified: false,
            verificationStatus: "pending"
        });

        await recordAudit({
            req,
            action: "partner.admin_created",
            domain: "partner",
            targetType: "Pharmacy",
            targetId: pharmacy._id,
            summary: `Admin added pharmacy ${pharmacy.name}`
        });

        res.status(201).json({ success: true, message: "Pharmacy added successfully!", data: pharmacy });
    } catch {
        res.status(500).json({ success: false, message: "Failed to add pharmacy." });
    }
});

// Register own pharmacy (Partner)
router.post("/register", protect, authorize("pharmacy"), async (req, res) => {
    try {
        const details = validateDetails(req.body);
        if (!details) {
            return res.status(400).json({ success: false, message: "Valid pharmacy name, address, and city are required." });
        }

        const pharmacy = await Pharmacy.create({
            ...details,
            owner: req.user._id,
            isVerified: false,
            verificationStatus: "pending",
            staff: [{ name: req.user.name, email: req.user.email, staffRole: "owner", active: true }],
            posSandboxKey: `sbx_pos_${String(req.user._id).slice(-6)}_${Date.now().toString(36)}`
        });

        await recordAudit({
            req,
            action: "partner.registered",
            domain: "partner",
            targetType: "Pharmacy",
            targetId: pharmacy._id,
            summary: `Partner registered ${pharmacy.name} for verification`
        });

        eventBus.publish({
            type: "partner.verification_requested",
            payload: { pharmacyId: pharmacy._id, name: pharmacy.name },
            audience: { roles: ["admin"] }
        });

        res.status(201).json({ success: true, message: "Pharmacy registered. Awaiting admin verification.", data: pharmacy });
    } catch {
        res.status(500).json({ success: false, message: "Pharmacy registration failed." });
    }
});

// Get own pharmacies (strict tenant isolation)
router.get("/my", protect, authorize("pharmacy"), async (req, res) => {
    try {
        const pharmacies = await Pharmacy.find({ owner: req.user._id }).lean();
        const now = Date.now();
        const enriched = pharmacies.map((p) => {
            const exp = p.licenseExpiry ? new Date(p.licenseExpiry).getTime() : null;
            const daysUntilExpiry = exp ? Math.ceil((exp - now) / (1000 * 60 * 60 * 24)) : null;
            return {
                ...p,
                renewalReminder:
                    daysUntilExpiry !== null && daysUntilExpiry <= 45
                        ? daysUntilExpiry <= 0 ? "expired" : "expiring_soon"
                        : "valid",
                daysUntilExpiry
            };
        });

        res.status(200).json({ success: true, count: enriched.length, data: enriched });
    } catch {
        res.status(500).json({ success: false, message: "Failed to fetch your pharmacies." });
    }
});

// Admin: Get pharmacies (paginated, newest first so owner-registered applications appear at top)
router.get("/all", protect, authorize("admin"), async (req, res) => {
    try {
        const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 40));
        const pharmacies = await Pharmacy.find()
            .populate("owner", "name email role")
            .sort({ owner: -1, createdAt: -1 })
            .limit(limitNum)
            .lean();
        res.status(200).json({ success: true, count: pharmacies.length, data: pharmacies });
    } catch {
        res.status(500).json({ success: false, message: "Failed to fetch all pharmacies." });
    }
});

router.get("/pending", protect, authorize("admin"), async (req, res) => {
    try {
        const pharmacies = await Pharmacy.find({ isVerified: false, owner: { $ne: null } })
            .populate("owner", "name email role");
        res.status(200).json({ success: true, count: pharmacies.length, data: pharmacies });
    } catch {
        res.status(500).json({ success: false, message: "Failed to fetch pending pharmacies." });
    }
});

// Update own pharmacy (tenant isolated)
router.patch("/:id", protect, authorize("pharmacy"), async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid pharmacy ID." });
        }

        const details = validateDetails(req.body);
        if (!details) {
            return res.status(400).json({ success: false, message: "Valid pharmacy details are required." });
        }

        const pharmacy = await Pharmacy.findOneAndUpdate(
            { _id: req.params.id, owner: req.user._id },
            { $set: { ...details, isVerified: false, verificationStatus: "pending", rejectionReason: "" } },
            { new: true, runValidators: true }
        );
        if (!pharmacy) return res.status(404).json({ success: false, message: "Pharmacy not found." });

        await recordAudit({
            req,
            action: "partner.updated",
            domain: "partner",
            targetType: "Pharmacy",
            targetId: pharmacy._id,
            summary: `Partner updated profile for ${pharmacy.name}; re-verification triggered`
        });

        res.status(200).json({ success: true, message: "Pharmacy updated. Re-verification required.", data: pharmacy });
    } catch {
        res.status(500).json({ success: false, message: "Pharmacy update failed." });
    }
});

// Branch, Staff, Supplier & Audit endpoints (tenant isolated)
router.post("/:id/branches", protect, authorize("pharmacy"), async (req, res) => {
    try {
        const { name, address, city, phone = "", openingHours = "08:00 AM - 10:00 PM" } = req.body || {};
        if (!name?.trim() || !address?.trim() || !city?.trim()) {
            return res.status(400).json({ success: false, message: "Branch name, address and city required." });
        }
        const pharmacy = await Pharmacy.findOneAndUpdate(
            { _id: req.params.id, owner: req.user._id },
            { $push: { branches: { name: name.trim(), address: address.trim(), city: city.trim(), phone, openingHours } } },
            { new: true }
        );
        if (!pharmacy) return res.status(404).json({ success: false, message: "Pharmacy not found." });
        res.status(201).json({ success: true, data: pharmacy });
    } catch {
        res.status(500).json({ success: false, message: "Failed to add branch." });
    }
});

router.delete("/:id/branches/:branchId", protect, authorize("pharmacy"), async (req, res) => {
    try {
        const pharmacy = await Pharmacy.findOneAndUpdate(
            { _id: req.params.id, owner: req.user._id },
            { $pull: { branches: { _id: req.params.branchId } } },
            { new: true }
        );
        if (!pharmacy) return res.status(404).json({ success: false, message: "Pharmacy not found." });
        res.status(200).json({ success: true, data: pharmacy });
    } catch {
        res.status(500).json({ success: false, message: "Failed to remove branch." });
    }
});

router.post("/:id/staff", protect, authorize("pharmacy"), async (req, res) => {
    try {
        const { name, email, staffRole = "pharmacist" } = req.body || {};
        if (!name?.trim() || !email?.trim() || !["owner", "pharmacist", "manager", "dispatcher"].includes(staffRole)) {
            return res.status(400).json({ success: false, message: "Valid staff name, email and role required." });
        }
        const pharmacy = await Pharmacy.findOneAndUpdate(
            { _id: req.params.id, owner: req.user._id },
            { $push: { staff: { name: name.trim(), email: email.trim().toLowerCase(), staffRole, active: true } } },
            { new: true }
        );
        if (!pharmacy) return res.status(404).json({ success: false, message: "Pharmacy not found." });
        res.status(201).json({ success: true, data: pharmacy });
    } catch {
        res.status(500).json({ success: false, message: "Failed to add staff member." });
    }
});

router.delete("/:id/staff/:staffId", protect, authorize("pharmacy"), async (req, res) => {
    try {
        const pharmacy = await Pharmacy.findOneAndUpdate(
            { _id: req.params.id, owner: req.user._id },
            { $pull: { staff: { _id: req.params.staffId } } },
            { new: true }
        );
        if (!pharmacy) return res.status(404).json({ success: false, message: "Pharmacy not found." });
        res.status(200).json({ success: true, data: pharmacy });
    } catch {
        res.status(500).json({ success: false, message: "Failed to remove staff member." });
    }
});

router.post("/:id/suppliers", protect, authorize("pharmacy"), async (req, res) => {
    try {
        const { name, licenseId = "", contact = "", status = "approved" } = req.body || {};
        if (!name?.trim()) return res.status(400).json({ success: false, message: "Supplier name required." });
        const pharmacy = await Pharmacy.findOneAndUpdate(
            { _id: req.params.id, owner: req.user._id },
            { $push: { suppliers: { name: name.trim(), licenseId, contact, status } } },
            { new: true }
        );
        if (!pharmacy) return res.status(404).json({ success: false, message: "Pharmacy not found." });
        res.status(201).json({ success: true, data: pharmacy });
    } catch {
        res.status(500).json({ success: false, message: "Failed to add supplier." });
    }
});

router.get("/:id/audit", protect, authorize("pharmacy"), async (req, res) => {
    try {
        const pharmacy = await Pharmacy.findOne({ _id: req.params.id, owner: req.user._id });
        if (!pharmacy) return res.status(404).json({ success: false, message: "Pharmacy not found." });
        const logs = await AuditEvent.find({ targetId: String(pharmacy._id) }).sort({ createdAt: -1 }).limit(40).lean();
        res.status(200).json({ success: true, data: logs });
    } catch {
        res.status(500).json({ success: false, message: "Failed to load change history." });
    }
});

// Submit verification documents (moves status to "under_review" for Admin approval)
router.post("/:id/submit-verification", protect, authorize("pharmacy"), async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid pharmacy ID." });
        }
        const { documentType: rawDocumentType = "drug_licence", title, referenceNumber = "", fileName = "" } = req.body || {};
        const docAliasMap = {
            drug_license: "drug_licence",
            gst_registration: "gst_certificate"
        };
        const documentType = docAliasMap[rawDocumentType] || rawDocumentType;
        if (
            !["drug_licence", "pharmacy_registration", "owner_id", "gst_certificate", "other"].includes(documentType) ||
            typeof title !== "string" ||
            !title.trim()
        ) {
            return res.status(400).json({
                success: false,
                message: "Document type and title are required."
            });
        }

        const existing = await Pharmacy.findOne({ _id: req.params.id, owner: req.user._id });
        if (!existing) {
            return res.status(404).json({ success: false, message: "Pharmacy not found." });
        }

        existing.verificationDocuments.push({
            documentType,
            title: title.trim().slice(0, 120),
            referenceNumber: String(referenceNumber).trim().slice(0, 80),
            fileName: String(fileName).trim().slice(0, 140),
            uploadedAt: new Date()
        });
        if (!existing.isVerified) {
            existing.verificationStatus = "under_review";
            existing.rejectionReason = "";
        }
        await existing.save();

        await recordAudit({
            req,
            action: "pharmacy.verification_submitted",
            domain: "partner",
            targetType: "Pharmacy",
            targetId: existing._id,
            summary: `Submitted verification document (${documentType}) for ${existing.name}`
        });

        eventBus.publish({
            type: "partner.verification_requested",
            payload: { pharmacyId: existing._id, name: existing.name, status: existing.verificationStatus },
            audience: { roles: ["admin"] }
        });

        res.status(200).json({
            success: true,
            message: "Verification documents submitted. Status is now Under Review.",
            data: existing
        });
    } catch {
        res.status(500).json({ success: false, message: "Failed to submit verification documents." });
    }
});

// Verify or reject pharmacy - Admin only (supports pending, under_review, verified, rejected)
router.patch("/:id/verify", protect, authorize("admin"), async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid pharmacy ID." });
        }

        const { isVerified, verificationStatus, rejectionReason = "" } = req.body || {};
        const nextStatus = ["pending", "under_review", "verified", "rejected"].includes(verificationStatus)
            ? verificationStatus
            : typeof isVerified === "boolean"
                ? (isVerified ? "verified" : "rejected")
                : "rejected";
        const nextVerified = nextStatus === "verified";

        if (nextStatus === "rejected" && !String(rejectionReason).trim()) {
            return res.status(400).json({
                success: false,
                message: "Rejection reason is required when rejecting an application."
            });
        }

        const pharmacy = await Pharmacy.findByIdAndUpdate(
            req.params.id,
            {
                $set: {
                    isVerified: nextVerified,
                    verificationStatus: nextStatus,
                    rejectionReason: nextStatus === "rejected" ? String(rejectionReason).trim() : "",
                    reviewedAt: new Date(),
                    reviewedBy: req.user._id
                }
            },
            { new: true, runValidators: true }
        );

        if (!pharmacy) return res.status(404).json({ success: false, message: "Pharmacy not found." });

        if (pharmacy.owner) {
            await User.findByIdAndUpdate(pharmacy.owner, { $set: { isVerified: nextVerified } });

            await Notification.create({
                recipient: pharmacy.owner,
                title: nextVerified
                    ? "Pharmacy Verification Approved"
                    : nextStatus === "under_review"
                        ? "Pharmacy Application Under Review"
                        : "Pharmacy Verification Requires Action",
                message: nextVerified
                    ? `${pharmacy.name} is now verified and can publish public medicine listings.`
                    : nextStatus === "under_review"
                        ? `${pharmacy.name} is currently under administrator review.`
                        : `${pharmacy.name} was marked ${nextStatus}: ${pharmacy.rejectionReason || "Review required."}`,
                category: "verification",
                link: "/pharmacy/dashboard"
            });

            eventBus.publish({
                type: "partner.verification_updated",
                payload: {
                    pharmacyId: pharmacy._id,
                    isVerified: pharmacy.isVerified,
                    verificationStatus: pharmacy.verificationStatus
                },
                audience: { userIds: [pharmacy.owner], roles: ["admin"] }
            });
        }

        await recordAudit({
            req,
            action: nextVerified ? "partner.verified" : `partner.${nextStatus}`,
            domain: "admin",
            targetType: "Pharmacy",
            targetId: pharmacy._id,
            summary: `${pharmacy.name} set to ${nextStatus}`
        });

        res.status(200).json({
            success: true,
            message: nextVerified
                ? "Pharmacy verified successfully!"
                : `Pharmacy verification status updated to ${nextStatus}.`,
            data: pharmacy
        });
    } catch {
        res.status(500).json({ success: false, message: "Verification failed." });
    }
});

module.exports = router;
