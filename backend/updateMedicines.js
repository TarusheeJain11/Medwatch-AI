
require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("./db");
const Medicine = require("./models/Medicine");

const names = [
    "Vitamin C",
    "Vitamin D3",
    "Vitamin B12",
    "Folic Acid",
    "Calcium Carbonate",
    "Zinc Sulfate",
    "Thiamine",
    "Riboflavin",
    "Biotin",
    "Vitamin E",
    "Vitamin A",
    "Magnesium Oxide",
    "Calcium Citrate",
    "Pyridoxine",
    "Niacinamide",
    "Cyanocobalamin",
    "Cholecalciferol",
    "Ascorbic Acid",
    "Pantothenic Acid"
];

const updateMedicines = async () => {
    try {
        await connectDB();

        let updated = 0;

        for (let i = 0; i < names.length; i++) {
            const result = await Medicine.updateOne(
                { name: `Demo Medicine ${i + 1}` },
                {
                    $set: {
                        name: names[i],
                        genericName: names[i],
                        manufacturer: "Demo Manufacturer",
                        category: "Vitamins and Minerals",
                        dosage: "Not verified"
                    }
                }
            );

            updated += result.modifiedCount;
        }

        console.log("Catalog updated successfully!");
        console.log("Updated records:", updated);
        console.log(
            "Total medicines:",
            await Medicine.countDocuments()
        );

    } catch (error) {
        console.error("Error:", error.message);
    } finally {
        await mongoose.disconnect();
    }
};

updateMedicines();
