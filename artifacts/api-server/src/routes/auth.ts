import { Router } from "express";
import { db, providersTable, patientsTable, pendingPatientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword, createToken } from "../lib/auth.js";
import { requireAuth } from "../middlewares/auth.js";
import { sendVerificationEmail } from "../lib/email.js";
import { logAuditEvent, getClientIp } from "../middlewares/auditLog.js";
import { authLimiter } from "../middlewares/rateLimit.js";

const router = Router();

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

router.post("/auth/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const ip = getClientIp(req);
    const ua = req.headers["user-agent"];

    if (!email || !password) {
      res.status(400).json({ error: "Bad Request", message: "Email and password required" });
      return;
    }

    const [provider] = await db.select().from(providersTable).where(eq(providersTable.email, email)).limit(1);
    if (provider && verifyPassword(password, provider.passwordHash)) {
      const token = createToken({ id: provider.id, email: provider.email, role: provider.role });
      logAuditEvent({ actorId: provider.id, actorEmail: provider.email, actorRole: provider.role, action: "auth.login", resourceType: "auth", ipAddress: ip, userAgent: ua, outcome: "success" });
      res.json({ token, user: { id: provider.id, email: provider.email, name: provider.name, role: provider.role } });
      return;
    }

    const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.email, email)).limit(1);
    if (patient && verifyPassword(password, patient.passwordHash)) {
      const token = createToken({ id: patient.id, email: patient.email, role: patient.role });
      logAuditEvent({ actorId: patient.id, actorEmail: patient.email, actorRole: patient.role, action: "auth.login", resourceType: "auth", ipAddress: ip, userAgent: ua, outcome: "success" });
      res.json({ token, user: { id: patient.id, email: patient.email, name: patient.name, role: patient.role } });
      return;
    }

    const [pending] = await db.select().from(pendingPatientsTable).where(eq(pendingPatientsTable.email, email)).limit(1);
    if (pending && verifyPassword(password, pending.passwordHash)) {
      logAuditEvent({ actorEmail: email, action: "auth.login", resourceType: "auth", ipAddress: ip, userAgent: ua, outcome: "denied", details: JSON.stringify({ reason: pending.emailVerified ? "pending_approval" : "email_unverified" }) });
      if (!pending.emailVerified) {
        res.status(403).json({ error: "Email not verified", status: "email_unverified", message: "Please verify your email before logging in.", email: pending.email });
        return;
      }
      res.status(403).json({ error: "Awaiting approval", status: "pending_approval", message: "Your email has been verified. Your account is awaiting approval from a healthcare provider.", name: pending.name });
      return;
    }

    logAuditEvent({ actorEmail: email, action: "auth.login_failed", resourceType: "auth", ipAddress: ip, userAgent: ua, outcome: "failure", details: JSON.stringify({ reason: "invalid_credentials" }) });
    res.status(401).json({ error: "Unauthorized", message: "Invalid email or password" });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Login failed" });
  }
});

router.post("/auth/patient-signup", authLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ error: "Bad Request", message: "Name, email, and password are required" });
      return;
    }

    const [existingProvider] = await db.select().from(providersTable).where(eq(providersTable.email, email)).limit(1);
    const [existingPatient] = await db.select().from(patientsTable).where(eq(patientsTable.email, email)).limit(1);
    const [existingPending] = await db.select().from(pendingPatientsTable).where(eq(pendingPatientsTable.email, email)).limit(1);

    if (existingProvider || existingPatient) {
      res.status(409).json({ error: "Conflict", message: "An account with this email already exists" });
      return;
    }

    const code = generateCode();
    const expiry = new Date(Date.now() + 15 * 60 * 1000);

    if (existingPending) {
      await db.update(pendingPatientsTable).set({
        name,
        passwordHash: hashPassword(password),
        verificationCode: code,
        verificationExpiry: expiry,
        emailVerified: false,
      }).where(eq(pendingPatientsTable.email, email));
    } else {
      await db.insert(pendingPatientsTable).values({
        name,
        email,
        passwordHash: hashPassword(password),
        verificationCode: code,
        verificationExpiry: expiry,
        emailVerified: false,
      });
    }

    logAuditEvent({ actorEmail: email, action: "auth.signup", resourceType: "auth", ipAddress: getClientIp(req), userAgent: req.headers["user-agent"], outcome: "success" });
    setImmediate(() => sendVerificationEmail(email, name, code));
    res.status(201).json({ message: "Verification code sent to your email.", email });
  } catch (err) {
    console.error("Patient signup error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Signup failed" });
  }
});

router.post("/auth/verify-email", async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      res.status(400).json({ error: "Bad Request", message: "Email and code required" });
      return;
    }

    const [pending] = await db.select().from(pendingPatientsTable).where(eq(pendingPatientsTable.email, email)).limit(1);
    if (!pending) {
      res.status(404).json({ error: "Not Found", message: "No pending signup found for this email" });
      return;
    }
    if (pending.emailVerified) {
      res.json({ message: "Email already verified. Awaiting provider approval." });
      return;
    }
    if (pending.verificationCode !== String(code).trim()) {
      res.status(400).json({ error: "Invalid Code", message: "The verification code is incorrect. Please try again or request a new code." });
      return;
    }
    if (new Date() > new Date(pending.verificationExpiry)) {
      res.status(400).json({ error: "Code Expired", message: "The verification code has expired. Please request a new one." });
      return;
    }

    await db.update(pendingPatientsTable).set({ emailVerified: true }).where(eq(pendingPatientsTable.email, email));
    res.json({ message: "Email verified successfully. Your account is now awaiting approval from a healthcare provider." });
  } catch (err) {
    console.error("Verify email error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Verification failed" });
  }
});

router.post("/auth/resend-code", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: "Bad Request", message: "Email required" });
      return;
    }

    const [pending] = await db.select().from(pendingPatientsTable).where(eq(pendingPatientsTable.email, email)).limit(1);
    if (!pending) {
      res.status(404).json({ error: "Not Found", message: "No pending signup found for this email" });
      return;
    }
    if (pending.emailVerified) {
      res.status(400).json({ error: "Already Verified", message: "Email is already verified" });
      return;
    }

    const code = generateCode();
    const expiry = new Date(Date.now() + 15 * 60 * 1000);
    await db.update(pendingPatientsTable).set({ verificationCode: code, verificationExpiry: expiry }).where(eq(pendingPatientsTable.email, email));
    setImmediate(() => sendVerificationEmail(email, pending.name, code));
    res.json({ message: "A new verification code has been sent to your email." });
  } catch (err) {
    console.error("Resend code error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to resend code" });
  }
});

router.get("/auth/me", requireAuth, async (req, res) => {
  try {
    const user = req.user!;

    if (user.role === "provider" || user.role === "admin") {
      const [provider] = await db.select().from(providersTable).where(eq(providersTable.id, user.id)).limit(1);
      if (!provider) { res.status(404).json({ error: "Not Found", message: "User not found" }); return; }
      res.json({ id: provider.id, email: provider.email, name: provider.name, role: provider.role });
    } else {
      const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, user.id)).limit(1);
      if (!patient) { res.status(404).json({ error: "Not Found", message: "User not found" }); return; }
      res.json({ id: patient.id, email: patient.email, name: patient.name, role: patient.role, approvalWelcomePending: patient.approvalWelcomePending });
    }
  } catch (err) {
    console.error("Get me error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to fetch user" });
  }
});

router.post("/auth/dismiss-welcome", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (user.role !== "patient") { res.status(403).json({ error: "Forbidden" }); return; }
    await db.update(patientsTable).set({ approvalWelcomePending: false }).where(eq(patientsTable.id, user.id));
    res.json({ ok: true });
  } catch (err) {
    console.error("Dismiss welcome error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/auth/signup", authLimiter, async (req, res) => {
  try {
    const { name, email, password, role = "provider", specialty } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ error: "Bad Request", message: "Name, email, and password are required" });
      return;
    }

    const [existingProvider] = await db.select().from(providersTable).where(eq(providersTable.email, email)).limit(1);
    const [existingPatient] = await db.select().from(patientsTable).where(eq(patientsTable.email, email)).limit(1);
    if (existingProvider || existingPatient) {
      res.status(409).json({ error: "Conflict", message: "An account with this email already exists" });
      return;
    }

    if (role === "provider") {
      const [provider] = await db.insert(providersTable).values({ name, email, passwordHash: hashPassword(password), specialty: specialty || null, role: "provider" }).returning();
      const token = createToken({ id: provider.id, email: provider.email, role: provider.role });
      logAuditEvent({ actorId: provider.id, actorEmail: provider.email, actorRole: "provider", action: "auth.signup", resourceType: "auth", ipAddress: getClientIp(req), userAgent: req.headers["user-agent"], outcome: "success" });
      res.status(201).json({ token, user: { id: provider.id, email: provider.email, name: provider.name, role: provider.role } });
    } else {
      res.status(400).json({ error: "Bad Request", message: "Use /api/auth/patient-signup for patient registration" });
    }
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Signup failed" });
  }
});

export default router;
