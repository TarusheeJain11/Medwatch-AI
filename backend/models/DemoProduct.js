const mongoose = require("mongoose");

const demoProductSchema = new mongoose.Schema(
    {
        sku: { type: String, required: true, unique: true, trim: true },
        name: { type: String, required: true, trim: true, index: true },
        brand: { type: String, default: "MedWatch Care", trim: true },
        category: { type: String, default: "Wellness & Care", index: true },
        description: { type: String, required: true },
        unitPrice: { type: Number, required: true, min: 1 },
        mrp: { type: Number, default: 0 },
        maxQuantity: { type: Number, default: 5, min: 1 },
        inStock: { type: Boolean, default: true },
        rating: { type: Number, default: 4.7 },
        isNonMedicalDemo: { type: Boolean, default: true },
        isDemo: { type: Boolean, default: false }
    },
    { timestamps: true }
);

module.exports = mongoose.model("DemoProduct", demoProductSchema);
