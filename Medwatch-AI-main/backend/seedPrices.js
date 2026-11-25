
require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("./db");

const Medicine = require("./models/Medicine");
const Pharmacy = require("./models/Pharmacy");
const MedicinePrice = require("./models/MedicinePrice");

const seedPrices = async () => {
    try {
        await connectDB();

        const medicines = await Medicine.find();

        const pharmacies = await Pharmacy.find({
            name: {
                $in: [
                    "Demo Pharmacy A",
                    "Demo Pharmacy B",
                    "Demo Pharmacy C",
                    "Demo Pharmacy D",
                    "Demo Pharmacy E"
                ]
            }
        }).sort({ name: 1 });

        let added = 0;

        for (const medicine of medicines) {
            for (let i = 0; i < pharmacies.length; i++) {

                const sellingPrice = Math.round(
                    medicine.mrp * (0.75 + i * 0.05)
                );

                const result = await MedicinePrice.updateOne(
                    {
                        medicine: medicine._id,
                        pharmacy: pharmacies[i]._id
                    },
                    {
                        $setOnInsert: {
                            sellingPrice: sellingPrice,
                            isAvailable: true,
                            lastUpdated: new Date()
                        }
                    },
                    { upsert: true }
                );

                added += result.upsertedCount;
            }
        }

        console.log("Price seeding successful!");
        console.log("New price records:", added);
        console.log(
            "Total price records:",
            await MedicinePrice.countDocuments()
        );

    } catch (error) {
        console.error("Error:", error.message);
    } finally {
        await mongoose.disconnect();
    }
};

seedPrices();
