
require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("./db");
const Medicine = require("./models/Medicine");

const medicines = Array.from({ length: 19 }, (_, i) => ({
    name: `Demo Medicine ${i + 1}`,
    genericName: `Demo Generic ${i + 1}`,
    manufacturer: "Demo Pharma",
    mrp: 20 + i * 5,
    category: "Demo Category",
    dosage: "Demo Strength"
}));

const seedMedicines = async () => {
    try {
        await connectDB();

        for (const medicine of medicines) {
            await Medicine.updateOne(
                { name: medicine.name },
                { $setOnInsert: medicine },
                { upsert: true }
            );
        }

        const count = await Medicine.countDocuments();

        console.log("Medicines added successfully!");
        console.log("Total medicines:", count);

    } catch (error) {
        console.error("Error:", error.message);
    } finally {
        await mongoose.disconnect();
    }
};

seedMedicines();
