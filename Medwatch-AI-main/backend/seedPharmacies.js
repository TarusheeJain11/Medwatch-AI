
require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("./db");
const Pharmacy = require("./models/Pharmacy");

const pharmacies = [
    {
        name: "Demo Pharmacy A",
        address: "Demo Location A",
        city: "Jalandhar",
        isVerified: false
    },
    {
        name: "Demo Pharmacy B",
        address: "Demo Location B",
        city: "Jalandhar",
        isVerified: false
    },
    {
        name: "Demo Pharmacy C",
        address: "Demo Location C",
        city: "Jalandhar",
        isVerified: false
    },
    {
        name: "Demo Pharmacy D",
        address: "Demo Location D",
        city: "Jalandhar",
        isVerified: false
    },
    {
        name: "Demo Pharmacy E",
        address: "Demo Location E",
        city: "Jalandhar",
        isVerified: false
    }
];

const seedPharmacies = async () => {
    try {
        await connectDB();

        for (const pharmacy of pharmacies) {
            await Pharmacy.updateOne(
                { name: pharmacy.name },
                { $setOnInsert: pharmacy },
                { upsert: true }
            );
        }

        const count = await Pharmacy.countDocuments();

        console.log("Pharmacies added successfully!");
        console.log("Total pharmacies:", count);

    } catch (error) {
        console.error("Error:", error.message);
    } finally {
        await mongoose.disconnect();
    }
};

seedPharmacies();
