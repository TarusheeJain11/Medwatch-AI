const mongoose = require("mongoose");

const medicineSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            index: true
        },
        genericName: {
            type: String,
            trim: true,
            index: true
        },
        manufacturer: {
            type: String,
            trim: true
        },
        mrp: {
            type: Number,
            required: true,
            min: 0
        },
        category: {
            type: String,
            default: "General Catalog"
        },
        dosage: {
            type: String,
            default: "Not specified"
        },
        description: {
            type: String,
            default: "Educational catalog record for reference only."
        },
        activeIngredients: {
            type: String,
            default: ""
        },
        storageInfo: {
            type: String,
            default: "Store in a cool, dry place away from direct sunlight."
        },
        warnings: {
            type: String,
            default: "Educational information only. Consult a licensed healthcare professional."
        },
        imageUrl: {
            type: String,
            default: "/images/meds/tablet.svg"
        },
        structureImageUrl: {
            type: String,
            default: ""
        },
        packSize: {
            type: String,
            default: "Strip of 10"
        },
        prescriptionStatus: {
            type: String,
            enum: ["OTC", "Rx / Reference", "Supplement"],
            default: "Rx / Reference"
        },
        routeOfAdministration: {
            type: String,
            default: "Oral"
        },
        therapeuticClass: {
            type: String,
            default: ""
        },
        hsnCode: {
            type: String,
            default: "3004"
        },
        gstRate: {
            type: Number,
            default: 5
        },
        aliases: {
            type: [String],
            default: []
        },
        sourceCitation: {
            type: String,
            default: "MedWatch Pilot Educational Dataset (Simulated)"
        },
        sourceUrl: {
            type: String,
            default: ""
        },
        sourceLastVerifiedAt: {
            type: Date,
            default: Date.now
        },
        editorialStatus: {
            type: String,
            enum: ["verified", "pending", "flagged"],
            default: "verified"
        },
        isDemo: {
            type: Boolean,
            default: true
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Medicine", medicineSchema);
