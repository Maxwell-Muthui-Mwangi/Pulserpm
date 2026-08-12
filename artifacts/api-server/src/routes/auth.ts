import { Router } from "express";
import { db, providersTable, patientsTable, pendingPatientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword, createToken } from "../lib/auth.js";
import { requireAuth } from "../middlewares/auth.js";
import { sendVerificationEmail, sendNewPatientPendingEmail, sendPasswordResetEmail, sendAdminNewProviderPendingEmail } from "../lib/email.js";
import { logAuditEvent, getClientIp } from "../middlewares/auditLog.js";
import { authLimiter } from "../middlewares/rateLimit.js";

const router = Router();

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ── Login ────────────────────────────────────────────────────────────────────
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
      // Block login until email is verified
      if (!provider.emailVerified) {
        logAuditEvent({ actorId: provider.id, actorEmail: provider.email, actorRole: provider.role, action: "auth.login", resourceType: "auth", ipAddress: ip, userAgent: ua, outcome: "denied", details: JSON.stringify({ reason: "email_unverified" }) });
        res.status(403).json({ error: "Email not verified", status: "email_unverified", message: "Please verify your email address before logging in.", email: provider.email });
        return;
      }
      // Block login until admin approves (admins are always pre-approved)
      if (!provider.approved && provider.role !== "admin") {
        logAuditEvent({ actorId: provider.id, actorEmail: provider.email, actorRole: provider.role, action: "auth.login", resourceType: "auth", ipAddress: ip, userAgent: ua, outcome: "denied", details: JSON.stringify({ reason: "pending_admin_approval" }) });
        res.status(403).json({ error: "Awaiting approval", status: "pending_approval", role: "provider", name: provider.name, message: "Your account is awaiting admin approval. You will receive an email when you are approved." });
        return;
      }
      const token = createToken({ id: provider.id, email: provider.email, role: provider.role, isSuperAdmin: provider.isSuperAdmin, isManager: provider.isManager });
      logAuditEvent({ actorId: provider.id, actorEmail: provider.email, actorRole: provider.role, action: "auth.login", resourceType: "auth", ipAddress: ip, userAgent: ua, outcome: "success" });
      res.json({ token, user: { id: provider.id, email: provider.email, name: provider.name, role: provider.role, isSuperAdmin: provider.isSuperAdmin, isManager: provider.isManager } });
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

// ── Provider signup ──────────────────────────────────────────────────────────
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

    if (role !== "provider") {
      res.status(400).json({ error: "Bad Request", message: "Use /api/auth/patient-signup for patient registration" });
      return;
    }

    const code = generateCode();
    const expiry = new Date(Date.now() + 15 * 60 * 1000);

    await db.insert(providersTable).values({
      name,
      email,
      passwordHash: hashPassword(password),
      specialty: specialty || null,
      role: "provider",
      emailVerified: false,
      verificationCode: code,
      verificationCodeExpiry: expiry,
    });

    logAuditEvent({ actorEmail: email, actorRole: "provider", action: "auth.signup", resourceType: "auth", ipAddress: getClientIp(req), userAgent: req.headers["user-agent"], outcome: "success" });

    const emailSent = await sendVerificationEmail(email, name, code);
    const responseBody: Record<string, unknown> = {
      message: emailSent
        ? "Account created. A verification code has been sent to your email."
        : "Account created. We could not deliver your verification email — use the code shown on screen.",
      email,
      emailSent,
    };
    if (!emailSent) responseBody.fallbackCode = code;
    res.status(201).json(responseBody);
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Signup failed" });
  }
});

// ── Provider email verification ───────────────────────────────────────────────
router.post("/auth/provider/verify-email", authLimiter, async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      res.status(400).json({ error: "Bad Request", message: "Email and code required" });
      return;
    }

    const [provider] = await db.select().from(providersTable).where(eq(providersTable.email, email)).limit(1);
    if (!provider) {
      // Generic response to avoid account enumeration
      res.status(400).json({ error: "Invalid Request", message: "The verification code is incorrect or has expired." });
      return;
    }
    if (provider.emailVerified) {
      // Already verified — do NOT issue a token here (no password was presented).
      // Direct the user to log in normally.
      res.json({ message: "Email already verified. Please log in with your credentials." });
      return;
    }
    if (provider.verificationCode !== String(code).trim()) {
      res.status(400).json({ error: "Invalid Code", message: "The verification code is incorrect. Please try again or request a new code." });
      return;
    }
    if (!provider.verificationCodeExpiry || new Date() > new Date(provider.verificationCodeExpiry)) {
      res.status(400).json({ error: "Code Expired", message: "The verification code has expired. Please request a new one." });
      return;
    }

    await db.update(providersTable)
      .set({ emailVerified: true, verificationCode: null, verificationCodeExpiry: null })
      .where(eq(providersTable.email, email));

    logAuditEvent({ actorId: provider.id, actorEmail: provider.email, actorRole: provider.role, action: "auth.email_verified", resourceType: "auth", outcome: "success" });

    // Notify all admins that a new provider is awaiting approval (non-blocking)
    setImmediate(async () => {
      try {
        const admins = await db.select().from(providersTable).where(eq(providersTable.role, "admin"));
        const dashboardOrigin = process.env.DASHBOARD_URL || "https://pulserpm.replit.app";
        for (const admin of admins) {
          await sendAdminNewProviderPendingEmail(
            admin.email,
            admin.name,
            provider.name,
            provider.email,
            `${dashboardOrigin}/super-admin`
          );
        }
      } catch (e) {
        console.error("[auth] Admin provider pending notification failed:", e);
      }
    });

    // Verification complete — provider must await admin approval before logging in.
    res.json({ message: "Email verified successfully. Your account is now awaiting admin approval. You will receive an email when you are approved." });
  } catch (err) {
    console.error("Provider verify email error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Verification failed" });
  }
});

// ── Patient signup ───────────────────────────────────────────────────────────
router.post("/auth/patient-signup", authLimiter, async (req, res) => {
  try {
    const { name, email, password, preferredProviderId } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ error: "Bad Request", message: "Name, email, and password are required" });
      return;
    }

    const preferredId = preferredProviderId ? parseInt(String(preferredProviderId), 10) : null;

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
        preferredProviderId: preferredId,
      }).where(eq(pendingPatientsTable.email, email));
    } else {
      await db.insert(pendingPatientsTable).values({
        name,
        email,
        passwordHash: hashPassword(password),
        verificationCode: code,
        verificationExpiry: expiry,
        emailVerified: false,
        preferredProviderId: preferredId,
      });
    }

    logAuditEvent({ actorEmail: email, action: "auth.signup", resourceType: "auth", ipAddress: getClientIp(req), userAgent: req.headers["user-agent"], outcome: "success" });

    const emailSent = await sendVerificationEmail(email, name, code);
    const responseBody: Record<string, unknown> = { message: emailSent ? "Verification code sent to your email." : "We could not deliver your verification email. Use the code shown on screen.", email, emailSent };
    if (!emailSent) responseBody.fallbackCode = code;
    res.status(201).json(responseBody);
  } catch (err) {
    console.error("Patient signup error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Signup failed" });
  }
});

// ── Patient email verification ────────────────────────────────────────────────
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

    // Notify the chosen provider (or all verified providers if none chosen) (non-blocking)
    setImmediate(async () => {
      try {
        const dashboardOrigin = process.env.DASHBOARD_URL || "https://pulserpm.replit.app";
        let providers;
        if (pending.preferredProviderId) {
          // Only notify the selected provider
          providers = await db.select().from(providersTable)
            .where(eq(providersTable.id, pending.preferredProviderId));
        } else {
          // No preference — notify all verified + approved providers
          providers = await db.select().from(providersTable)
            .where(eq(providersTable.emailVerified, true));
        }
        for (const provider of providers) {
          await sendNewPatientPendingEmail(
            provider.email,
            provider.name,
            pending.id,
            `${dashboardOrigin}/patients`
          );
        }
      } catch (e) {
        console.error("[auth] Provider pending notification failed:", e);
      }
    });

    res.json({ message: "Email verified successfully. Your account is now awaiting approval from a healthcare provider." });
  } catch (err) {
    console.error("Verify email error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Verification failed" });
  }
});

// ── Resend verification code ───────────────────────────────────────────────────
// Handles both patients (pending_patients table) and providers (providers table)
router.post("/auth/resend-code", authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: "Bad Request", message: "Email required" });
      return;
    }

    const code = generateCode();
    const expiry = new Date(Date.now() + 15 * 60 * 1000);

    // Check provider first
    const [provider] = await db.select().from(providersTable).where(eq(providersTable.email, email)).limit(1);
    if (provider) {
      if (provider.emailVerified) {
        res.status(400).json({ error: "Already Verified", message: "Email is already verified" });
        return;
      }
      await db.update(providersTable).set({ verificationCode: code, verificationCodeExpiry: expiry }).where(eq(providersTable.email, email));
      const emailSent = await sendVerificationEmail(email, provider.name, code);
      const responseBody: Record<string, unknown> = { message: emailSent ? "A new verification code has been sent to your email." : "We could not deliver your verification email. Use the code shown on screen.", emailSent };
      if (!emailSent) responseBody.fallbackCode = code;
      res.json(responseBody);
      return;
    }

    // Check pending patient
    const [pending] = await db.select().from(pendingPatientsTable).where(eq(pendingPatientsTable.email, email)).limit(1);
    if (!pending) {
      res.status(404).json({ error: "Not Found", message: "No account found for this email" });
      return;
    }
    if (pending.emailVerified) {
      res.status(400).json({ error: "Already Verified", message: "Email is already verified" });
      return;
    }

    await db.update(pendingPatientsTable).set({ verificationCode: code, verificationExpiry: expiry }).where(eq(pendingPatientsTable.email, email));
    const emailSent = await sendVerificationEmail(email, pending.name, code);
    const responseBody: Record<string, unknown> = { message: emailSent ? "A new verification code has been sent to your email." : "We could not deliver your verification email. Use the code shown on screen.", emailSent };
    if (!emailSent) responseBody.fallbackCode = code;
    res.json(responseBody);
  } catch (err) {
    console.error("Resend code error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to resend code" });
  }
});

// ── Forgot password — request reset code ─────────────────────────────────────
router.post("/auth/forgot-password", authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: "Bad Request", message: "Email is required" });
      return;
    }

    const code   = generateCode();
    const expiry = new Date(Date.now() + 15 * 60 * 1000);

    // Check providers table first, then patients
    const [provider] = await db.select().from(providersTable).where(eq(providersTable.email, email)).limit(1);
    if (provider) {
      await db.update(providersTable)
        .set({ passwordResetCode: code, passwordResetCodeExpiry: expiry })
        .where(eq(providersTable.email, email));
      const emailSent = await sendPasswordResetEmail(email, provider.name, code);
      const body: Record<string, unknown> = { message: "If an account exists for this email, a reset code has been sent.", emailSent };
      if (!emailSent) body.fallbackCode = code;
      logAuditEvent({ actorId: provider.id, actorEmail: email, actorRole: provider.role, action: "auth.password_reset_requested", resourceType: "auth", ipAddress: getClientIp(req), userAgent: req.headers["user-agent"], outcome: "success" });
      res.json(body);
      return;
    }

    const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.email, email)).limit(1);
    if (patient) {
      await db.update(patientsTable)
        .set({ passwordResetCode: code, passwordResetCodeExpiry: expiry })
        .where(eq(patientsTable.email, email));
      const emailSent = await sendPasswordResetEmail(email, patient.name, code);
      const body: Record<string, unknown> = { message: "If an account exists for this email, a reset code has been sent.", emailSent };
      if (!emailSent) body.fallbackCode = code;
      logAuditEvent({ actorId: patient.id, actorEmail: email, actorRole: patient.role, action: "auth.password_reset_requested", resourceType: "auth", ipAddress: getClientIp(req), userAgent: req.headers["user-agent"], outcome: "success" });
      res.json(body);
      return;
    }

    // Generic response — don't reveal whether the email exists
    res.json({ message: "If an account exists for this email, a reset code has been sent.", emailSent: false });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to process reset request" });
  }
});

// ── Reset password — verify code + set new password ───────────────────────────
router.post("/auth/reset-password", authLimiter, async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      res.status(400).json({ error: "Bad Request", message: "Email, code, and new password are required" });
      return;
    }
    if (typeof newPassword !== "string" || newPassword.length < 6) {
      res.status(400).json({ error: "Bad Request", message: "Password must be at least 6 characters" });
      return;
    }

    // Try providers first
    const [provider] = await db.select().from(providersTable).where(eq(providersTable.email, email)).limit(1);
    if (provider) {
      if (provider.passwordResetCode !== String(code).trim()) {
        res.status(400).json({ error: "Invalid Code", message: "The reset code is incorrect. Please request a new one." });
        return;
      }
      if (!provider.passwordResetCodeExpiry || new Date() > new Date(provider.passwordResetCodeExpiry)) {
        res.status(400).json({ error: "Code Expired", message: "The reset code has expired. Please request a new one." });
        return;
      }
      await db.update(providersTable)
        .set({ passwordHash: hashPassword(newPassword), passwordResetCode: null, passwordResetCodeExpiry: null })
        .where(eq(providersTable.email, email));
      logAuditEvent({ actorId: provider.id, actorEmail: email, actorRole: provider.role, action: "auth.password_reset", resourceType: "auth", ipAddress: getClientIp(req), userAgent: req.headers["user-agent"], outcome: "success" });
      res.json({ message: "Password updated successfully. You can now sign in with your new password." });
      return;
    }

    // Try patients
    const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.email, email)).limit(1);
    if (patient) {
      if (patient.passwordResetCode !== String(code).trim()) {
        res.status(400).json({ error: "Invalid Code", message: "The reset code is incorrect. Please request a new one." });
        return;
      }
      if (!patient.passwordResetCodeExpiry || new Date() > new Date(patient.passwordResetCodeExpiry)) {
        res.status(400).json({ error: "Code Expired", message: "The reset code has expired. Please request a new one." });
        return;
      }
      await db.update(patientsTable)
        .set({ passwordHash: hashPassword(newPassword), passwordResetCode: null, passwordResetCodeExpiry: null })
        .where(eq(patientsTable.email, email));
      logAuditEvent({ actorId: patient.id, actorEmail: email, actorRole: patient.role, action: "auth.password_reset", resourceType: "auth", ipAddress: getClientIp(req), userAgent: req.headers["user-agent"], outcome: "success" });
      res.json({ message: "Password updated successfully. You can now sign in with your new password." });
      return;
    }

    // Email not found — generic error to avoid enumeration
    res.status(400).json({ error: "Invalid Request", message: "The reset code is incorrect or has expired." });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to reset password" });
  }
});

// ── Me ────────────────────────────────────────────────────────────────────────
router.get("/auth/me", requireAuth, async (req, res) => {
  try {
    const user = req.user!;

    if (user.role === "provider" || user.role === "admin") {
      const [provider] = await db.select().from(providersTable).where(eq(providersTable.id, user.id)).limit(1);
      if (!provider) { res.status(404).json({ error: "Not Found", message: "User not found" }); return; }
      res.json({ id: provider.id, email: provider.email, name: provider.name, role: provider.role, isSuperAdmin: provider.isSuperAdmin, isManager: provider.isManager });
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

// ── Dismiss welcome banner ────────────────────────────────────────────────────
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

export default router;
