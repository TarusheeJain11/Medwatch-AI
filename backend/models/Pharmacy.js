const mongoose = require("mongoose");

const branchSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        address: { type: String, required: true, trim: true },
        city: { type: String, required: true, trim: true },
        phone: { type: String, default: "" },
        openingHours: { type: String, default: "08:00 AM - 10:00 PM" },
        isActive: { type: Boolean, default: true }
    },
    { _id: true }
);

const staffSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        email: { type: String, required: true, trim: true, lowercase: true },
        staffRole: {
            type: String,
            enum: ["owner", "pharmacist", "manager", "dispatcher"],
            default: "pharmacist"
        },
        active: { type: Boolean, default: true }
    },
    { _id: true, timestamps: true }
);

const supplierSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        licenseId: { type: String, default: "" },
        contact: { type: String, default: "" },
        status: { type: String, enum: ["approved", "review", "suspended"], default: "approved" }
    },
    { _id: true, timestamps: true }
);

const verificationDocumentSchema = new mongoose.Schema(
    {
        documentType: {
            type: String,
            enum: ["drug_licence", "pharmacy_registration", "owner_id", "gst_certificate", "other"],
            default: "drug_licence"
        },
        title: { type: String, required: true, trim: true },
        referenceNumber: { type: String, default: "", trim: true },
        fileName: { type: String, default: "", trim: true },
        uploadedAt: { type: Date, default: Date.now }
    },
    { _id: true }
);

const pharmacySchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, index: true },
        address: { type: String, required: true, trim: true },
        city: { type: String, required: true, trim: true, index: true },
        state: { type: String, default: "", trim: true },
        pinCode: { type: String, default: "", trim: true },
        lat: { type: Number, default: 31.3260 },
        lng: { type: Number, default: 75.5762 },
        phone: { type: String, default: "", trim: true },
        contactEmail: { type: String, default: "", trim: true, lowercase: true },
        openingHours: { type: String, default: "08:00 AM - 10:00 PM (Mon–Sun)" },
        accessibilityFeatures: {
            type: [String],
            default: ["Step-free entrance", "Printed large-font labels"]
        },
        serviceArea: { type: String, default: "Central Sector" },
        licenseNumber: { type: String, default: "", trim: true },
        licenseExpiry: { type: Date, default: null },
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
            index: true
        },
        isVerified: { type: Boolean, default: false, index: true },
        verificationStatus: {
            type: String,
            enum: ["pending", "under_review", "verified", "rejected"],
            default: "pending",
            index: true
        },
        verificationDocuments: {
            type: [verificationDocumentSchema],
            default: []
        },
        rejectionReason: { type: String, default: "" },
        reviewedAt: { type: Date, default: null },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        branches: { type: [branchSchema], default: [] },
        staff: { type: [staffSchema], default: [] },
        suppliers: { type: [supplierSchema], default: [] },
        posSandboxKey: { type: String, default: "" },
        isDemo: { type: Boolean, default: false }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Pharmacy", pharmacySchema);
