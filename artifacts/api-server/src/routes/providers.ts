import { Router } from "express";
import { db, providersTable, patientsTable } from "@workspace/db";
import { eq, count, and, ne } from "drizzle-orm";
import { hashPassword } from "../lib/auth.js";
import { requireAuth } from "../middlewares/auth.js";
import { logAuditEvent, getClientIp } from "../middlewares/auditLog.js";
import { sendProviderApprovedEmail } from "../lib/email.js";

// The founding super admin — permanently shielded from deletion or impersonation
const SUPER_ADMIN_EMAIL = "maxwellmuthuimwangi@gmail.com";

const router = Router();

// ── Public provider list — used by patient signup form (no auth required) ─────
router.get("/providers/public", async (_req, res) => {
  try {
    const providers = await db
      .select({ id: providersTable.id, name: providersTable.name, specialty: providersTable.specialty, isSuperAdmin: providersTable.isSuperAdmin })
      .from(providersTable)
      .where(and(eq(providersTable.emailVerified, true), eq(providersTable.approved, true)));
    // Exclude test/system accounts and super admin (patients can never be assigned to super admin)
    const clean = providers.filter((p) => !p.name.startsWith("__") && !p.isSuperAdmin);
    res.json(clean);
  } catch (err) {
    console.error("Public providers list error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to list providers" });
  }
});

router.get("/providers", requireAuth, async (_req, res) => {
  try {
    // Maxwell is a ghost — never visible in any provider list (except to himself)
    const callerEmail = req.user!.email;
    const rawProviders = await db.select().from(providersTable);
    const providers = rawProviders.filter(
      (p) => p.email !== SUPER_ADMIN_EMAIL || callerEmail === SUPER_ADMIN_EMAIL
    );

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
      role: p.role,
      adminRole: p.adminRole,
      isManager: p.isManager,
      isSuperAdmin: p.isSuperAdmin,
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

// ── Admin: list all providers with patient mapping ────────────────────────────
router.get("/admin/providers/all", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") {
      res.status(403).json({ error: "Forbidden", message: "Admin access required" });
      return;
    }

    const callerEmail = req.user!.email;
    const rawProviders = await db.select().from(providersTable);
    // Maxwell is a ghost — invisible to everyone except himself
    const providers = rawProviders.filter(
      (p) => p.email !== SUPER_ADMIN_EMAIL || callerEmail === SUPER_ADMIN_EMAIL
    );

    const patients = await db.select({
      id: patientsTable.id,
      name: patientsTable.name,
      email: patientsTable.email,
      providerId: patientsTable.providerId,
    }).from(patientsTable);

    const result = providers.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      specialty: p.specialty,
      role: p.role,
      adminRole: p.adminRole,
      isSuperAdmin: p.isSuperAdmin,
      isManager: p.isManager,
      approved: p.approved,
      createdAt: p.createdAt,
      patients: patients
        .filter((pt) => pt.providerId === p.id)
        .map((pt) => ({ id: pt.id, name: pt.name, email: pt.email })),
    }));

    res.json(result);
  } catch (err) {
    console.error("Admin all providers error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to fetch providers" });
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

// ── Admin: reject (delete) a pending provider ─────────────────────────────────
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

    // The founding super admin can never be deleted — by anyone
    if (provider.isSuperAdmin || provider.email === SUPER_ADMIN_EMAIL) {
      res.status(403).json({ error: "Forbidden", message: "The founding super admin account cannot be deleted." });
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

// ── Super Admin: promote a provider to admin (or demote admin to provider) ────
// Only the super admin (isSuperAdmin = true) can change roles.
// Maxwell's own role can never be touched.
router.post("/admin/providers/:id/set-role", requireAuth, async (req, res) => {
  try {
    if (!req.user!.isSuperAdmin) {
      res.status(403).json({ error: "Forbidden", message: "Only the super admin can change provider roles." });
      return;
    }

    const providerId = parseInt(req.params.id, 10);
    const { role } = req.body;

    if (!["provider", "admin"].includes(role)) {
      res.status(400).json({ error: "Bad Request", message: "role must be 'provider' or 'admin'" });
      return;
    }

    const [target] = await db.select().from(providersTable).where(eq(providersTable.id, providerId)).limit(1);
    if (!target) {
      res.status(404).json({ error: "Not Found", message: "Provider not found" });
      return;
    }

    // Maxwell cannot have his role changed — even by himself
    if (target.email === SUPER_ADMIN_EMAIL || target.isSuperAdmin) {
      res.status(403).json({ error: "Forbidden", message: "The founding super admin's role cannot be changed." });
      return;
    }

    await db.update(providersTable)
      .set({ role, updatedAt: new Date() })
      .where(eq(providersTable.id, providerId));

    logAuditEvent({
      actorId: req.user!.id, actorEmail: req.user!.email, actorRole: req.user!.role,
      action: `admin.set_role.${role}`, resourceType: "provider", resourceId: String(providerId),
      ipAddress: getClientIp(req), userAgent: req.headers["user-agent"], outcome: "success",
      details: JSON.stringify({ targetEmail: target.email, newRole: role }),
    });

    res.json({ ok: true, id: providerId, name: target.name, role });
  } catch (err) {
    console.error("Set role error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to update role" });
  }
});

// ── Admin: transfer all patients from one provider to another ─────────────────
// Admins + super admin can use this. Useful before removing a provider.
router.post("/admin/providers/:id/transfer-patients", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") {
      res.status(403).json({ error: "Forbidden", message: "Admin access required." });
      return;
    }

    const fromId = parseInt(req.params.id, 10);
    const { toProviderId } = req.body;

    if (!toProviderId || isNaN(parseInt(toProviderId, 10))) {
      res.status(400).json({ error: "Bad Request", message: "toProviderId is required." });
      return;
    }

    const toId = parseInt(toProviderId, 10);
    if (fromId === toId) {
      res.status(400).json({ error: "Bad Request", message: "Source and target provider must be different." });
      return;
    }

    const [[fromProvider], [toProvider]] = await Promise.all([
      db.select({ id: providersTable.id, name: providersTable.name, isSuperAdmin: providersTable.isSuperAdmin }).from(providersTable).where(eq(providersTable.id, fromId)).limit(1),
      db.select({ id: providersTable.id, name: providersTable.name, isSuperAdmin: providersTable.isSuperAdmin }).from(providersTable).where(eq(providersTable.id, toId)).limit(1),
    ]);

    if (!fromProvider) { res.status(404).json({ error: "Not Found", message: "Source provider not found." }); return; }
    if (!toProvider)   { res.status(404).json({ error: "Not Found", message: "Target provider not found." }); return; }
    if (toProvider.isSuperAdmin) { res.status(403).json({ error: "Forbidden", message: "Cannot assign patients to the super admin." }); return; }

    const updated = await db
      .update(patientsTable)
      .set({ providerId: toId })
      .where(eq(patientsTable.providerId, fromId))
      .returning({ id: patientsTable.id });

    logAuditEvent({
      actorId: req.user!.id, actorEmail: req.user!.email, actorRole: req.user!.role,
      action: "admin.transfer_patients", resourceType: "provider", resourceId: String(fromId),
      ipAddress: getClientIp(req), userAgent: req.headers["user-agent"], outcome: "success",
      details: JSON.stringify({ fromId, toId, fromName: fromProvider.name, toName: toProvider.name, count: updated.length }),
    });

    res.json({ ok: true, transferred: updated.length, from: fromProvider.name, to: toProvider.name });
  } catch (err) {
    console.error("Transfer patients error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to transfer patients." });
  }
});

// ── Admin: delete an approved provider (after transferring their patients) ────
router.delete("/admin/providers/:id", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") {
      res.status(403).json({ error: "Forbidden", message: "Admin access required." });
      return;
    }

    const providerId = parseInt(req.params.id, 10);
    const [provider] = await db.select().from(providersTable).where(eq(providersTable.id, providerId)).limit(1);
    if (!provider) { res.status(404).json({ error: "Not Found", message: "Provider not found." }); return; }

    if (provider.isSuperAdmin || provider.email === SUPER_ADMIN_EMAIL) {
      res.status(403).json({ error: "Forbidden", message: "The founding super admin account cannot be deleted." });
      return;
    }

    const [stillHasPatients] = await db.select({ c: count() }).from(patientsTable).where(eq(patientsTable.providerId, providerId));
    if (Number(stillHasPatients?.c ?? 0) > 0) {
      res.status(409).json({ error: "Conflict", message: `This provider still has ${stillHasPatients.c} patient(s). Transfer them first.` });
      return;
    }

    await db.delete(providersTable).where(eq(providersTable.id, providerId));

    logAuditEvent({
      actorId: req.user!.id, actorEmail: req.user!.email, actorRole: req.user!.role,
      action: "admin.delete_provider", resourceType: "provider", resourceId: String(providerId),
      ipAddress: getClientIp(req), userAgent: req.headers["user-agent"], outcome: "success",
      details: JSON.stringify({ name: provider.name, email: provider.email }),
    });

    res.json({ ok: true, id: providerId, name: provider.name });
  } catch (err) {
    console.error("Delete provider error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to delete provider." });
  }
});

// ── Admin: grant or revoke manager rights for a provider ──────────────────────
// Admins and super admin can grant manager rights to providers.
router.post("/admin/providers/:id/set-manager", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "admin") {
      res.status(403).json({ error: "Forbidden", message: "Admin access required." });
      return;
    }

    const providerId = parseInt(req.params.id, 10);
    const { isManager } = req.body;

    if (typeof isManager !== "boolean") {
      res.status(400).json({ error: "Bad Request", message: "isManager must be true or false" });
      return;
    }

    const [target] = await db.select().from(providersTable).where(eq(providersTable.id, providerId)).limit(1);
    if (!target) {
      res.status(404).json({ error: "Not Found", message: "Provider not found" });
      return;
    }

    if (target.email === SUPER_ADMIN_EMAIL || target.isSuperAdmin) {
      res.status(403).json({ error: "Forbidden", message: "Cannot modify the founding super admin's settings." });
      return;
    }

    await db.update(providersTable)
      .set({ isManager, updatedAt: new Date() })
      .where(eq(providersTable.id, providerId));

    logAuditEvent({
      actorId: req.user!.id, actorEmail: req.user!.email, actorRole: req.user!.role,
      action: isManager ? "admin.grant_manager" : "admin.revoke_manager",
      resourceType: "provider", resourceId: String(providerId),
      ipAddress: getClientIp(req), userAgent: req.headers["user-agent"], outcome: "success",
      details: JSON.stringify({ targetEmail: target.email }),
    });

    res.json({ ok: true, id: providerId, name: target.name, isManager });
  } catch (err) {
    console.error("Set manager error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to update manager rights" });
  }
});

export default router;
