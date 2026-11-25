require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");
const connectDB = require("./db");

const createAdmin = async () => {
    try {
        const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
        const password = process.env.ADMIN_PASSWORD;

        if (!email || !password) {
            throw new Error("Admin email or password missing.");
        }

        if (password.length < 12 ||
            Buffer.byteLength(password, "utf8") > 72) {
            throw new Error("Invalid admin password length.");
        }

        await connectDB();

        const existingUser = await User.findOne({ email });

        if (existingUser) {
            console.log("Email already registered.");
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        await User.create({
            name: "MedWatch Admin",
            email,
            password: hashedPassword,
            role: "admin",
            isVerified: true,
            isActive: true
        });

        console.log("Admin account created successfully!");

    } catch (error) {
        console.error("Admin creation failed:", error.message);
        process.exitCode = 1;

    } finally {
        await mongoose.disconnect();
    }
};

createAdmin();