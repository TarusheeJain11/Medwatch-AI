const mongoose = require("mongoose");

const featureFlagSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true, trim: true },
        label: { type: String, required: true },
        description: { type: String, default: "" },
        enabled: { type: Boolean, default: true },
        rolloutStage: {
            type: String,
            enum: ["pilot", "staging", "disabled"],
            default: "pilot"
        },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
    },
    { timestamps: true }
);

module.exports = mongoose.model("FeatureFlag", featureFlagSchema);
