import { Router } from "express";
import { db, providersTable, patientsTable } from "@workspace/db";
import { eq, count, and } from "drizzle-orm";
import { hashPassword } from "../lib/auth.js";
import { requireAuth } from "../middlewares/auth.js";
import { logAuditEvent, getClientIp } from "../middlewares/auditLog.js";
import { sendProviderApprovedEmail } from "../lib/email.js";

const router = Router();

// ── Public provider list — used by patient signup form (no auth required) ─────
router.get("/providers/public", async (_req, res) => {
  try {
    const providers = await db
      .select({ id: providersTable.id, name: providersTable.name, specialty: providersTable.specialty })
      .from(providersTable)
      .where(and(eq(providersTable.emailVerified, true), eq(providersTable.approved, true)));
    // Exclude test/system accounts
    const clean = providers.filter((p) => !p.name.startsWith("__"));
    res.json(clean);
  } catch (err) {
    console.error("Public providers list error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to list providers" });
  }
});

router.get("/providers", requireAuth, async (_req, res) => {
  try {
    const providers = await db.select().from(providersTable);
    const counts = await db
      .select({ providerId: patientsTable.providerId, count: count() })
      .from(patientsTable)
      .groupBy(patientsTable.providerId);

    const countMap = new Map(counts.map((c) => [c.providerId, Number(c.count)]));

    const result = providers.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      specialty: p.specialty,
      patientCount: countMap.get(p.id) ?? 0,
      createdAt: p.createdAt,
    }));

    res.json(result);
  } catch (err) {
    console.error("List providers error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to list providers" });
  }
});

router.post("/providers", requireAuth, async (req, res) => {
  try {
    const { name, email, password, specialty } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ error: "Bad Request", message: "name, email, and password are required" });
      return;
    }

    const [existing] = await db
      .select()
      .from(providersTable)
      .where(eq(providersTable.email, email))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: "Conflict", message: "Email already in use" });
      return;
    }

    const [provider] = await db
      .insert(providersTable)
      .values({
        name,
        email,
        passwordHash: hashPassword(password),
        specialty: specialty || null,
        role: "provider",
        emailVerified: true,  // Admin-created providers are pre-verified
        approved: true,       // Admin-created providers are pre-approved
      })
      .returning();

    res.status(201).json({
      id: provider.id,
      name: provider.name,
      email: provider.email,
      specialty: provider.specialty,
      patientCount: 0,
      createdAt: provider.createdAt,
    });
  } catch (err) {
    console.error("Create provider error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to create provider" });
  }
});

// ── Admin: list providers pending approval ────────────────────────────────────
router.get("/admin/providers/pending", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") {
      res.status(403).json({ error: "Forbidden", message: "Admin access required" });
      return;
    }
    const pending = await db
      .select()
      .from(providersTable)
      .where(and(eq(providersTable.emailVerified, true), eq(providersTable.approved, false)));

    res.json(pending.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      specialty: p.specialty,
      createdAt: p.createdAt,
    })));
  } catch (err) {
    console.error("List pending providers error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to list pending providers" });
  }
});

// ── Admin: approve a provider ─────────────────────────────────────────────────
router.post("/admin/providers/:id/approve", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") {
      res.status(403).json({ error: "Forbidden", message: "Admin access required" });
      return;
    }
    const providerId = parseInt(req.params.id, 10);
    const [provider] = await db.select().from(providersTable).where(eq(providersTable.id, providerId)).limit(1);
    if (!provider) {
      res.status(404).json({ error: "Not Found", message: "Provider not found" });
      return;
    }
    if (provider.approved) {
      res.status(409).json({ error: "Already approved", message: "This provider is already approved" });
      return;
    }

    await db.update(providersTable)
      .set({ approved: true, approvedAt: new Date(), approvedBy: req.user!.id })
      .where(eq(providersTable.id, providerId));

    logAuditEvent({
      actorId: req.user!.id, actorEmail: req.user!.email, actorRole: req.user!.role,
      action: "admin.approve_provider", resourceType: "provider", resourceId: String(providerId),
      ipAddress: getClientIp(req), userAgent: req.headers["user-agent"], outcome: "success",
    });

    // Email the provider
    setImmediate(async () => {
      try {
        const dashboardOrigin = process.env.DASHBOARD_URL || "https://pulserpm.replit.app";
        await sendProviderApprovedEmail(provider.email, provider.name, `${dashboardOrigin}/login`);
      } catch (e) {
        console.error("[providers] Provider approval email failed:", e);
      }
    });

    res.json({ ok: true, id: providerId, name: provider.name });
  } catch (err) {
    console.error("Approve provider error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to approve provider" });
  }
});

// ── Admin: reject (delete) a provider ────────────────────────────────────────
router.delete("/admin/providers/:id/reject", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") {
      res.status(403).json({ error: "Forbidden", message: "Admin access required" });
      return;
    }
    const providerId = parseInt(req.params.id, 10);
    const [provider] = await db.select().from(providersTable).where(eq(providersTable.id, providerId)).limit(1);
    if (!provider) {
      res.status(404).json({ error: "Not Found", message: "Provider not found" });
      return;
    }

    await db.delete(providersTable).where(eq(providersTable.id, providerId));

    logAuditEvent({
      actorId: req.user!.id, actorEmail: req.user!.email, actorRole: req.user!.role,
      action: "admin.reject_provider", resourceType: "provider", resourceId: String(providerId),
      ipAddress: getClientIp(req), userAgent: req.headers["user-agent"], outcome: "success",
    });

    res.json({ ok: true, id: providerId });
  } catch (err) {
    console.error("Reject provider error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to reject provider" });
  }
});

export default router;
