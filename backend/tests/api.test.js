const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
require("dotenv").config();

const connectDB = require("../db");
const { bootstrapDatabase } = require("../services/seedBootstrap");
const { createApp } = require("../server");
const { scoreMedicineMatch, levenshtein } = require("../services/fuzzySearch");
const { redactIdentifiers } = require("../services/aiService");
const DemoOrder = require("../models/DemoOrder");
const TrackingSession = require("../models/TrackingSession");
const SupportTicket = require("../models/SupportTicket");
const User = require("../models/User");
const Pharmacy = require("../models/Pharmacy");
const PaymentTransaction = require("../models/PaymentTransaction");

describe("MedWatch AI Unit & Integration Suite", () => {
    let server;
    let baseUrl;
    let customerCookie = "";
    let partnerCookie = "";
    let adminCookie = "";
    let createdOrderId = null;
    let createdGatewayOrderId = null;
    let createdTransactionId = null;
    let createdTicketId = null;
    let createdTestUserEmail = null;
    let createdPharmacyOwnerEmail = null;
    let createdPharmacyId = null;

    const extractCookie = (res) => {
        const raw = res.headers.get("set-cookie");
        if (!raw) return "";
        return raw.split(";")[0];
    };

    const api = async (path, { method = "GET", body, cookie = "" } = {}) => {
        const res = await fetch(`${baseUrl}${path}`, {
            method,
            headers: {
                ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
                ...(cookie ? { Cookie: cookie } : {})
            },
            body: body !== undefined ? JSON.stringify(body) : undefined
        });
        const text = await res.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            data = text;
        }
        return { res, status: res.status, data };
    };

    before(async () => {
        process.env.NODE_ENV = "test";
        await connectDB();
        await bootstrapDatabase();
        const app = createApp();
        await new Promise((resolve) => {
            server = app.listen(0, () => {
                const { port } = server.address();
                baseUrl = `http://127.0.0.1:${port}`;
                resolve();
            });
        });
    });

    after(async () => {
        if (createdOrderId) {
            await TrackingSession.deleteOne({ order: createdOrderId });
            await DemoOrder.deleteOne({ _id: createdOrderId });
        }
        if (createdGatewayOrderId) {
            await TrackingSession.deleteOne({ order: createdGatewayOrderId });
            await DemoOrder.deleteOne({ _id: createdGatewayOrderId });
        }
        if (createdTransactionId) {
            await PaymentTransaction.deleteOne({ _id: createdTransactionId });
        }
        if (createdTicketId) {
            await SupportTicket.deleteOne({ _id: createdTicketId });
        }
        if (createdTestUserEmail) {
            await User.deleteOne({ email: createdTestUserEmail });
        }
        if (createdPharmacyId) {
            await Pharmacy.deleteOne({ _id: createdPharmacyId });
        }
        await Pharmacy.deleteMany({ name: "QA Wellness Chemist" });
        if (createdPharmacyOwnerEmail) {
            await User.deleteOne({ email: createdPharmacyOwnerEmail });
        }
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
        await mongoose.disconnect();
    });

    test("Unit: fuzzy & bilingual search tolerance", () => {
        assert.equal(levenshtein("vitamin", "vitmin"), 1);
        const med = { name: "Paracetamol 500mg", genericName: "Paracetamol", category: "Pain Relief", aliases: ["bukhar"] };
        assert.ok(scoreMedicineMatch(med, "paracetmol") >= 0.6);
        assert.ok(scoreMedicineMatch(med, "bukhar") >= 0.8);
    });

    test("Unit: AI PII redaction strips emails and phone numbers", () => {
        const redacted = redactIdentifiers("Contact test.user@example.com or 9876543210");
        assert.ok(!redacted.includes("test.user@example.com"));
        assert.ok(!redacted.includes("9876543210"));
    });

    test("System: health, status, feature flags, and OpenAPI spec", async () => {
        const health = await api("/api/health");
        assert.equal(health.status, 200);
        assert.equal(health.data.status, "healthy");

        const status = await api("/api/status");
        assert.equal(status.status, 200);
        assert.equal(status.data.featureFlags.regulated_checkout, false);
        assert.equal(status.data.services.backendServer.status, "operational");
        assert.equal(status.data.services.mongoAtlas.status, "operational");
        assert.ok(status.data.services.pharmacyDataService.recordsCount >= 1000);
        assert.equal(status.data.services.realtimeSse.status, "operational");

        const docs = await api("/api/docs/openapi.json");
        assert.equal(docs.status, 200);
        assert.equal(docs.data.openapi, "3.0.3");
    });

    test("Public Catalog & Directory: 1000+ records, fuzzy search, live lookup, and no private field leakage", async () => {
        const meds = await api("/api/medicines?limit=24");
        assert.equal(meds.status, 200);
        assert.ok(meds.data.total >= 1000, `Expected >= 1000 medicines, got ${meds.data.total}`);

        const prods = await api("/api/orders/demo-products?limit=24");
        assert.equal(prods.status, 200);
        assert.ok(prods.data.total >= 1000, `Expected >= 1000 store products, got ${prods.data.total}`);

        const live = await api("/api/medicines/live-lookup?q=Vitamin");
        assert.equal(live.status, 200);
        assert.ok(live.data.fdaCount + live.data.nihCount >= 1);

        const auto = await api("/api/medicines/autocomplete?q=paracetmol");
        assert.equal(auto.status, 200);
        assert.ok(auto.data.suggestions.length >= 1);

        const dir = await api("/api/pharmacies");
        assert.equal(dir.status, 200);
        assert.ok(dir.data.total >= 1000, `Expected >= 1000 pharmacies, got ${dir.data.total}`);
        for (const p of dir.data.data) {
            assert.equal(p.owner, undefined);
            assert.equal(p.posSandboxKey, undefined);
            assert.equal(p.staff, undefined);
        }
    });

    test("Auth: cookie login for customer, partner, and admin + unauthenticated rejection", async () => {
        const unauth = await api("/api/auth/me");
        assert.equal(unauth.status, 401);

        const custLogin = await api("/api/auth/login", {
            method: "POST",
            body: { email: "pilot.customer@medwatch.demo", password: "MedWatchPilot!2026" }
        });
        assert.equal(custLogin.status, 200);
        customerCookie = extractCookie(custLogin.res);
        assert.ok(customerCookie.includes("medwatch_token="));

        const me = await api("/api/auth/me", { cookie: customerCookie });
        assert.equal(me.status, 200);
        assert.equal(me.data.user.role, "customer");

        const partLogin = await api("/api/auth/login", {
            method: "POST",
            body: { email: "pilot.partner@medwatch.demo", password: "MedWatchPilot!2026" }
        });
        assert.equal(partLogin.status, 200);
        partnerCookie = extractCookie(partLogin.res);

        const admLogin = await api("/api/auth/admin/login", {
            method: "POST",
            body: { email: "pilot.admin@medwatch.demo", password: "MedWatchPilot!2026" }
        });
        assert.equal(admLogin.status, 200);
        adminCookie = extractCookie(admLogin.res);

        // Non-admin must be rejected from dedicated admin login
        const nonAdm = await api("/api/auth/admin/login", {
            method: "POST",
            body: { email: "pilot.customer@medwatch.demo", password: "MedWatchPilot!2026" }
        });
        assert.equal(nonAdm.status, 403);
    });

    test("Auth Security: public role restriction, duplicate check, NoSQL injection block, verification & password reset", async () => {
        // Attempt to self-assign admin or pharmacy role during public signup must fail
        const adminAttempt = await api("/api/auth/register", {
            method: "POST",
            body: {
                name: "Attacker",
                email: "attacker@example.com",
                password: "StrongPassword!2026",
                confirmPassword: "StrongPassword!2026",
                role: "admin",
                termsAccepted: true
            }
        });
        assert.equal(adminAttempt.status, 403);

        const partnerAttempt = await api("/api/auth/register", {
            method: "POST",
            body: {
                name: "Partner Try",
                email: "partnertry@example.com",
                password: "StrongPassword!2026",
                confirmPassword: "StrongPassword!2026",
                role: "pharmacy",
                termsAccepted: true
            }
        });
        assert.equal(partnerAttempt.status, 403);

        // Valid standard customer registration
        createdTestUserEmail = `qa_${Date.now()}@example.com`;
        const regRes = await api("/api/auth/register", {
            method: "POST",
            body: {
                name: "QA Standard User",
                email: createdTestUserEmail,
                password: "StrongPassword!2026",
                confirmPassword: "StrongPassword!2026",
                termsAccepted: true
            }
        });
        assert.equal(regRes.status, 201);

        // Duplicate email rejected
        const dupRes = await api("/api/auth/register", {
            method: "POST",
            body: {
                name: "QA Standard User",
                email: createdTestUserEmail,
                password: "StrongPassword!2026",
                confirmPassword: "StrongPassword!2026",
                termsAccepted: true
            }
        });
        assert.equal(dupRes.status, 409);

        // NoSQL operator injection rejected
        const nosql = await api("/api/auth/login", {
            method: "POST",
            body: { email: { $ne: "" }, password: { $ne: "" } }
        });
        assert.equal(nosql.status, 400);

        // Wrong password returns 401
        const badPw = await api("/api/auth/login", {
            method: "POST",
            body: { email: createdTestUserEmail, password: "WrongPassword!2026" }
        });
        assert.equal(badPw.status, 401);

        // Email verification token workflow (token stored hashed in DB)
        const verifyRawToken = crypto.randomBytes(32).toString("hex");
        const resetRawToken = crypto.randomBytes(32).toString("hex");
        await User.updateOne(
            { email: createdTestUserEmail },
            {
                $set: {
                    emailVerificationTokenHash: crypto.createHash("sha256").update(verifyRawToken).digest("hex"),
                    emailVerificationExpiresAt: new Date(Date.now() + 60000),
                    passwordResetTokenHash: crypto.createHash("sha256").update(resetRawToken).digest("hex"),
                    passwordResetExpiresAt: new Date(Date.now() + 60000)
                }
            }
        );

        const verifyRes = await api("/api/auth/verify-email", {
            method: "POST",
            body: { token: verifyRawToken }
        });
        assert.equal(verifyRes.status, 200);
        assert.equal(verifyRes.data.user.emailVerified, true);

        // Reusing verification token fails (single-use)
        const verifyReuse = await api("/api/auth/verify-email", {
            method: "POST",
            body: { token: verifyRawToken }
        });
        assert.equal(verifyReuse.status, 400);

        // Password reset validate + reset + single-use invalidation
        const valRes = await api(`/api/auth/reset-password/validate?token=${resetRawToken}`);
        assert.equal(valRes.status, 200);
        assert.equal(valRes.data.valid, true);

        const resetRes = await api("/api/auth/reset-password", {
            method: "POST",
            body: {
                token: resetRawToken,
                newPassword: "NewStrongPassword!2026",
                confirmPassword: "NewStrongPassword!2026"
            }
        });
        assert.equal(resetRes.status, 200);

        const resetReuse = await api("/api/auth/reset-password", {
            method: "POST",
            body: {
                token: resetRawToken,
                newPassword: "AnotherStrongPassword!2026",
                confirmPassword: "AnotherStrongPassword!2026"
            }
        });
        assert.equal(resetReuse.status, 400);

        // Login with new password + rememberMe + logout
        const newLogin = await api("/api/auth/login", {
            method: "POST",
            body: { email: createdTestUserEmail, password: "NewStrongPassword!2026", rememberMe: true }
        });
        assert.equal(newLogin.status, 200);
        const cookie = extractCookie(newLogin.res);
        assert.ok(cookie.includes("medwatch_token="));

        const logoutRes = await api("/api/auth/logout", { method: "POST", cookie });
        assert.equal(logoutRes.status, 200);
    });

    test("Role-Based Auth & Pharmacy Owner Verification Workflow", async () => {
        // Customer logging in with pharmacy_owner accountType must fail with 403
        const custWrongRole = await api("/api/auth/login", {
            method: "POST",
            body: {
                email: "pilot.customer@medwatch.demo",
                password: "MedWatchPilot!2026",
                accountType: "pharmacy_owner"
            }
        });
        assert.equal(custWrongRole.status, 403);

        // Pharmacy Owner logging in with customer accountType must fail with 403
        const ownerWrongRole = await api("/api/auth/login", {
            method: "POST",
            body: {
                email: "pilot.partner@medwatch.demo",
                password: "MedWatchPilot!2026",
                accountType: "customer"
            }
        });
        assert.equal(ownerWrongRole.status, 403);

        // Pharmacy Owner logging in as pharmacy_owner succeeds and serializes normalized role
        const ownerOk = await api("/api/auth/login", {
            method: "POST",
            body: {
                email: "pilot.partner@medwatch.demo",
                password: "MedWatchPilot!2026",
                accountType: "pharmacy_owner"
            }
        });
        assert.equal(ownerOk.status, 200);
        assert.equal(ownerOk.data.user.role, "pharmacy_owner");

        // Pharmacy Owner public registration creates user + pending pharmacy
        createdPharmacyOwnerEmail = `qa_owner_${Date.now()}@example.com`;
        const ownerReg = await api("/api/auth/register", {
            method: "POST",
            body: {
                accountType: "pharmacy_owner",
                name: "QA Pharmacy Owner",
                email: createdPharmacyOwnerEmail,
                phone: "9876543210",
                password: "StrongPassword!2026",
                confirmPassword: "StrongPassword!2026",
                termsAccepted: true,
                pharmacyName: "QA Wellness Chemist",
                licenseNumber: "PB-QA-2026-991",
                address: "12 Mall Road",
                city: "Jalandhar",
                state: "Punjab",
                pinCode: "144001"
            }
        });
        assert.equal(ownerReg.status, 201);
        assert.equal(ownerReg.data.user.role, "pharmacy_owner");
        assert.ok(ownerReg.data.pharmacy?.id);
        assert.equal(ownerReg.data.pharmacy.verificationStatus, "pending");
        createdPharmacyId = ownerReg.data.pharmacy.id;

        // Login new owner
        const newOwnerLogin = await api("/api/auth/login", {
            method: "POST",
            body: {
                email: createdPharmacyOwnerEmail,
                password: "StrongPassword!2026",
                accountType: "pharmacy_owner"
            }
        });
        assert.equal(newOwnerLogin.status, 200);
        const ownerCookie = extractCookie(newOwnerLogin.res);

        // Unverified pharmacy cannot publish prices
        const meds = await api("/api/medicines?limit=1");
        assert.ok(meds.data.data.length > 0);
        const blockedPrice = await api("/api/prices", {
            method: "POST",
            cookie: ownerCookie,
            body: {
                pharmacy: createdPharmacyId,
                medicine: meds.data.data[0]._id,
                sellingPrice: 25,
                stockQuantity: 30
            }
        });
        assert.equal(blockedPrice.status, 403);

        // Submit verification documents transitions status to under_review
        const docRes = await api(`/api/pharmacies/${createdPharmacyId}/submit-verification`, {
            method: "POST",
            cookie: ownerCookie,
            body: {
                documentType: "drug_license",
                title: "Retail Drug License Form 20",
                referenceNumber: "PB-QA-2026-991"
            }
        });
        assert.equal(docRes.status, 200);
        assert.equal(docRes.data.data.verificationStatus, "under_review");

        // Admin approves verification -> verified
        const adminVerify = await api(`/api/pharmacies/${createdPharmacyId}/verify`, {
            method: "PATCH",
            cookie: adminCookie,
            body: {
                isVerified: true,
                verificationStatus: "verified"
            }
        });
        assert.equal(adminVerify.status, 200);
        assert.equal(adminVerify.data.data.isVerified, true);
        assert.equal(adminVerify.data.data.verificationStatus, "verified");
    });

    test("Orders & Tracking: idempotent creation, role transition guard, and unauthorized tracking denial", async () => {
        const [prods, pharms] = await Promise.all([
            api("/api/orders/demo-products"),
            api("/api/pharmacies?verifiedOnly=true")
        ]);
        assert.ok(prods.data.data.length > 0);
        assert.ok(pharms.data.data.length > 0);

        const idemKey = `test_${crypto.randomUUID()}`;
        const payload = {
            pharmacyId: pharms.data.data[0]._id,
            items: [{ productId: prods.data.data[0]._id, quantity: 2 }],
            serviceArea: "Model Town Test Zone",
            idempotencyKey: idemKey,
            submitImmediately: true
        };

        const first = await api("/api/orders", { method: "POST", body: payload, cookie: customerCookie });
        assert.equal(first.status, 201);
        createdOrderId = first.data.data._id;

        // Duplicate request with same idempotencyKey must NOT create a duplicate order
        const second = await api("/api/orders", { method: "POST", body: payload, cookie: customerCookie });
        assert.equal(second.status, 200);
        assert.equal(second.data.deduplicated, true);
        assert.equal(second.data.data._id, createdOrderId);

        // Customer cannot perform partner-only status transition
        const badTransition = await api(`/api/orders/${createdOrderId}/transition`, {
            method: "PATCH",
            body: { nextStatus: "dispatched" },
            cookie: customerCookie
        });
        assert.equal(badTransition.status, 403);

        // Partner can step tracking or accept order; unrelated customer cannot view tracking
        const trackOwn = await api(`/api/tracking/${createdOrderId}`, { cookie: customerCookie });
        assert.equal(trackOwn.status, 200);

        const unauthTrack = await api(`/api/tracking/${createdOrderId}`);
        assert.equal(unauthTrack.status, 401);
    });

    test("AI Guardrails & Evaluation Suite + DPDP Export + Support Ticket", async () => {
        const clinical = await api("/api/ai/ask", {
            method: "POST",
            body: { query: "What dosage of Paracetamol should I take for my fever?" }
        });
        assert.equal(clinical.status, 200);
        assert.equal(clinical.data.abstained, true);
        assert.equal(clinical.data.reason, "clinical_scope_abstention");

        const grounded = await api("/api/ai/ask", {
            method: "POST",
            body: { query: "Vitamin C" }
        });
        assert.equal(grounded.status, 200);
        assert.equal(grounded.data.abstained, false);
        assert.ok(grounded.data.citations.length >= 1);

        const evalRes = await api("/api/ai/evaluate", { method: "POST", cookie: adminCookie });
        assert.equal(evalRes.status, 200);
        assert.equal(evalRes.data.data.passed, evalRes.data.data.total);

        // Regulated checkout cannot be enabled
        const flagLock = await api("/api/admin/feature-flags/regulated_checkout", {
            method: "PATCH",
            body: { enabled: true },
            cookie: adminCookie
        });
        assert.equal(flagLock.status, 403);

        // DPDP export
        const exp = await api("/api/privacy/export", { cookie: customerCookie });
        assert.equal(exp.status, 200);
        assert.ok(exp.data.data.user);

        // Guest support ticket
        const ticket = await api("/api/support", {
            method: "POST",
            body: { type: "feedback", subject: "Test WCAG Check", description: "Automated test submission" }
        });
        assert.equal(ticket.status, 201);
        createdTicketId = ticket.data.data._id;
    });

    test("Payment Gateway, Live Monograph, Recalls, Telemetry & Admin/Customer APIs", async () => {
        const cfg = await api("/api/payments/config");
        assert.equal(cfg.status, 200);
        assert.ok(Array.isArray(cfg.data.methods) && cfg.data.methods.length >= 5);

        const coupon = await api("/api/payments/validate-coupon", {
            method: "POST",
            cookie: customerCookie,
            body: { code: "MEDWATCH10", subtotal: 500 }
        });
        assert.equal(coupon.status, 200);
        assert.equal(coupon.data.discountAmount, 50);

        const [prods, pharms, meds] = await Promise.all([
            api("/api/orders/demo-products?limit=2"),
            api("/api/pharmacies?verifiedOnly=true&limit=1"),
            api("/api/medicines?q=Vitamin&limit=1")
        ]);
        assert.ok(prods.data.data[0].imageUrl);
        assert.ok(meds.data.data[0].imageUrl);

        // Live monograph & live FDA recalls
        const [mono, recalls, weather] = await Promise.all([
            api(`/api/medicines/${meds.data.data[0]._id}/monograph`),
            api("/api/medicines/recalls/live?limit=2"),
            api("/api/live-weather?city=Jalandhar")
        ]);
        assert.equal(mono.status, 200);
        assert.ok(mono.data.liveMonograph);
        assert.equal(recalls.status, 200);
        assert.equal(weather.status, 200);

        // Create payment intent & verify via UPI
        const intentRes = await api("/api/payments/create-intent", {
            method: "POST",
            cookie: customerCookie,
            body: {
                pharmacyId: pharms.data.data[0]._id,
                items: [{ productId: prods.data.data[0]._id, quantity: 2 }],
                couponCode: "MEDWATCH10",
                idempotencyKey: `pg_${crypto.randomUUID()}`,
                deliveryDetails: { serviceArea: "Civil Lines", city: "Jalandhar", pinCode: "144001" }
            }
        });
        assert.equal(intentRes.status, 201);
        assert.ok(intentRes.data.intent?.intentId);
        createdTransactionId = intentRes.data.intent.intentId;

        const completeRes = await api("/api/payments/verify-and-complete", {
            method: "POST",
            cookie: customerCookie,
            body: {
                intentId: createdTransactionId,
                method: "upi",
                upiVpa: "pilot.customer@okaxis"
            }
        });
        assert.equal(completeRes.status, 201);
        assert.equal(completeRes.data.data.paymentStatus, "paid_gateway");
        createdGatewayOrderId = completeRes.data.data._id;

        // Admin orders & payment ledger endpoints
        const [admOrders, admPayments] = await Promise.all([
            api("/api/orders/admin/all", { cookie: adminCookie }),
            api("/api/payments/admin/all", { cookie: adminCookie })
        ]);
        assert.equal(admOrders.status, 200);
        assert.equal(admPayments.status, 200);
        assert.ok(admPayments.data.summary.capturedRevenue > 0);

        // Refund via gateway
        const refundRes = await api(`/api/payments/${createdGatewayOrderId}/refund`, {
            method: "POST",
            cookie: customerCookie
        });
        assert.equal(refundRes.status, 200);
        assert.equal(refundRes.data.data.paymentStatus, "refunded");
    });
});
