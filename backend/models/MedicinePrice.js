const mongoose = require("mongoose");

const medicinePriceSchema = new mongoose.Schema(
    {
        medicine: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Medicine",
            required: true
        },
        pharmacy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Pharmacy",
            required: true
        },
        sellingPrice: {
            type: Number,
            required: true,
            min: 0
        },
        isAvailable: {
            type: Boolean,
            default: true
        },
        batchNumber: {
            type: String,
            default: "DEMO-B001",
            trim: true
        },
        expiryDate: {
            type: Date,
            default: () => new Date(Date.now() + 180 * 24 * 60 * 60 * 1000)
        },
        stockQuantity: {
            type: Number,
            default: 50,
            min: 0
        },
        lowStockThreshold: {
            type: Number,
            default: 10,
            min: 0
        },
        supplierName: {
            type: String,
            default: "Pilot Wellness Distributor"
        },
        sourceAttribution: {
            type: String,
            default: "Partner Simulated Feed"
        },
        recallFlag: {
            type: Boolean,
            default: false
        },
        recallNotice: {
            type: String,
            default: ""
        },
        isDemo: {
            type: Boolean,
            default: true
        },
        lastUpdated: {
            type: Date,
            default: Date.now
        }
    },
    { timestamps: true }
);

medicinePriceSchema.index(
    { medicine: 1, pharmacy: 1 },
    { unique: true }
);

module.exports = mongoose.model("MedicinePrice", medicinePriceSchema);
