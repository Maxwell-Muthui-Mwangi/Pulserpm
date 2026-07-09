import { Router } from "express";
import { db, alertsTable, patientsTable } from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

router.get("/patients/:patientId/alerts", requireAuth, async (req, res) => {
  try {
    const patientId = Number(req.params.patientId);
    if (req.user!.role === "patient" && req.user!.id !== patientId) {
      res.status(403).json({ error: "Forbidden", message: "Access denied" });
      return;
    }
    // Providers can only view alerts for their own patients
    if (req.user!.role === "provider") {
      const [patient] = await db.select({ providerId: patientsTable.providerId }).from(patientsTable).where(eq(patientsTable.id, patientId)).limit(1);
      if (!patient) {
        res.status(404).json({ error: "Not Found", message: "Patient not found" });
        return;
      }
      if (patient.providerId !== req.user!.id) {
        res.status(403).json({ error: "Forbidden", message: "You do not have access to this patient" });
        return;
      }
    }
    const status = req.query.status as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    const conditions = [eq(alertsTable.patientId, patientId)];
    if (status) conditions.push(eq(alertsTable.status, status));

    const alerts = await db
      .select()
      .from(alertsTable)
      .where(and(...conditions))
      .orderBy(desc(alertsTable.triggeredAt))
      .limit(limit);

    res.json(alerts);
  } catch (err) {
    console.error("Get patient alerts error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to get alerts" });
  }
});

router.get("/alerts", requireAuth, async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const severity = req.query.severity as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    const conditions = [];
    // Patients can only see their own alerts
    if (req.user!.role === "patient") {
      conditions.push(eq(alertsTable.patientId, req.user!.id));
    } else if (req.user!.role === "provider") {
      // Providers only see alerts for patients they personally approved
      const providerPatients = await db
        .select({ id: patientsTable.id })
        .from(patientsTable)
        .where(eq(patientsTable.providerId, req.user!.id));
      const patientIds = providerPatients.map((p) => p.id);
      if (patientIds.length === 0) {
        res.json([]);
        return;
      }
      conditions.push(inArray(alertsTable.patientId, patientIds));
    }
    if (status) conditions.push(eq(alertsTable.status, status));
    if (severity) conditions.push(eq(alertsTable.severity, severity));

    const alerts = await db
      .select({
        id: alertsTable.id,
        patientId: alertsTable.patientId,
        vitalType: alertsTable.vitalType,
        severity: alertsTable.severity,
        message: alertsTable.message,
        value: alertsTable.value,
        threshold: alertsTable.threshold,
        status: alertsTable.status,
        suggestedAction: alertsTable.suggestedAction,
        triggeredAt: alertsTable.triggeredAt,
        acknowledgedAt: alertsTable.acknowledgedAt,
        resolvedAt: alertsTable.resolvedAt,
        patientName: patientsTable.name,
        patientEmail: patientsTable.email,
      })
      .from(alertsTable)
      .innerJoin(patientsTable, eq(alertsTable.patientId, patientsTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(alertsTable.triggeredAt))
      .limit(limit);

    res.json(alerts);
  } catch (err) {
    console.error("List alerts error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to list alerts" });
  }
});

router.post("/alerts/:alertId/acknowledge", requireAuth, async (req, res) => {
  try {
    const alertId = Number(req.params.alertId);
    const [updated] = await db
      .update(alertsTable)
      .set({ status: "acknowledged", acknowledgedAt: new Date() })
      .where(eq(alertsTable.id, alertId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Not Found", message: "Alert not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    console.error("Acknowledge alert error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to acknowledge alert" });
  }
});

router.post("/alerts/:alertId/resolve", requireAuth, async (req, res) => {
  try {
    const alertId = Number(req.params.alertId);
    const [updated] = await db
      .update(alertsTable)
      .set({ status: "resolved", resolvedAt: new Date() })
      .where(eq(alertsTable.id, alertId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Not Found", message: "Alert not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    console.error("Resolve alert error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to resolve alert" });
  }
});

export default router;
