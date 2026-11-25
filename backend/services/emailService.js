const nodemailer = require("nodemailer");

const isEmailConfigured = () =>
    Boolean(
        process.env.SMTP_HOST &&
        process.env.SMTP_PORT &&
        process.env.SMTP_USER &&
        process.env.SMTP_PASS
    );

const getTransporter = () => {
    if (!isEmailConfigured()) return null;
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === "true" || Number(process.env.SMTP_PORT) === 465,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
};

const getFrontendBase = () => {
    const raw = process.env.FRONTEND_URL || "http://localhost:5173";
    return raw.split(",")[0].trim().replace(/\/$/, "");
};

const sendMail = async ({ to, subject, text, html }) => {
    const transporter = getTransporter();
    if (!transporter) {
        return {
            sent: false,
            configured: false,
            reason: "SMTP email service is not configured (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS)."
        };
    }

    try {
        await transporter.sendMail({
            from: process.env.SMTP_FROM || `"MedWatch AI" <${process.env.SMTP_USER}>`,
            to,
            subject,
            text,
            html
        });
        return { sent: true, configured: true };
    } catch (error) {
        return {
            sent: false,
            configured: true,
            reason: error?.message || "SMTP delivery failed."
        };
    }
};

const sendVerificationEmail = async ({ to, name, token }) => {
    const verifyUrl = `${getFrontendBase()}/verify-email?token=${encodeURIComponent(token)}`;
    return sendMail({
        to,
        subject: "Verify your MedWatch AI email address",
        text: `Hello ${name},\n\nPlease verify your email address for MedWatch AI by visiting:\n${verifyUrl}\n\nThis link expires in 24 hours.\n`,
        html: `
            <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:auto;padding:24px;border:1px solid #E2E8F0;border-radius:12px;">
                <h2 style="color:#0F172A;margin-bottom:8px;">Verify your email address</h2>
                <p style="color:#475569;font-size:14px;">Hello ${name}, confirm your email address to complete your MedWatch AI account setup.</p>
                <p style="margin:20px 0;">
                    <a href="${verifyUrl}" style="background:#0D9488;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Verify Email</a>
                </p>
                <p style="color:#64748B;font-size:12px;">This verification link expires in 24 hours. If you did not create this account, you can ignore this email.</p>
            </div>
        `
    });
};

const sendPasswordResetEmail = async ({ to, name, token }) => {
    const resetUrl = `${getFrontendBase()}/reset-password?token=${encodeURIComponent(token)}`;
    return sendMail({
        to,
        subject: "MedWatch AI — Password Reset Request",
        text: `Hello ${name},\n\nReset your MedWatch AI password using the link below (valid for 15 minutes):\n${resetUrl}\n\nIf you did not request a password reset, no action is needed.\n`,
        html: `
            <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:auto;padding:24px;border:1px solid #E2E8F0;border-radius:12px;">
                <h2 style="color:#0F172A;margin-bottom:8px;">Reset your password</h2>
                <p style="color:#475569;font-size:14px;">Hello ${name}, we received a request to reset your MedWatch AI password.</p>
                <p style="margin:20px 0;">
                    <a href="${resetUrl}" style="background:#0D9488;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Reset Password</a>
                </p>
                <p style="color:#64748B;font-size:12px;">This link expires in 15 minutes and can only be used once.</p>
            </div>
        `
    });
};

module.exports = {
    isEmailConfigured,
    sendVerificationEmail,
    sendPasswordResetEmail
};
