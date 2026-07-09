import { Router } from "express";
import { db, thresholdsTable, patientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { getOrCreateThresholds } from "../lib/alertEngine.js";

const router = Router();

/** Returns null and sends 403/404 if the provider doesn't own this patient. */
async function assertProviderOwnsPatient(
  patientId: number,
  providerId: number,
  res: import("express").Response
): Promise<boolean> {
  const [patient] = await db.select({ providerId: patientsTable.providerId }).from(patientsTable).where(eq(patientsTable.id, patientId)).limit(1);
  if (!patient) {
    res.status(404).json({ error: "Not Found", message: "Patient not found" });
    return false;
  }
  if (patient.providerId !== providerId) {
    res.status(403).json({ error: "Forbidden", message: "You do not have access to this patient" });
    return false;
  }
  return true;
}

router.get("/patients/:patientId/thresholds", requireAuth, async (req, res) => {
  try {
    const patientId = Number(req.params.patientId);
    if (req.user!.role === "patient" && req.user!.id !== patientId) {
      res.status(403).json({ error: "Forbidden", message: "Access denied" });
      return;
    }
    if (req.user!.role === "provider") {
      const ok = await assertProviderOwnsPatient(patientId, req.user!.id, res);
      if (!ok) return;
    }
    const thresholds = await getOrCreateThresholds(patientId);
    res.json(thresholds);
  } catch (err) {
    console.error("Get thresholds error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to get thresholds" });
  }
});

router.put("/patients/:patientId/thresholds", requireAuth, async (req, res) => {
  try {
    const patientId = Number(req.params.patientId);
    if (req.user!.role === "patient" && req.user!.id !== patientId) {
      res.status(403).json({ error: "Forbidden", message: "Access denied" });
      return;
    }
    if (req.user!.role === "provider") {
      const ok = await assertProviderOwnsPatient(patientId, req.user!.id, res);
      if (!ok) return;
    }
    const updates = req.body;

    const existing = await getOrCreateThresholds(patientId);

    const [updated] = await db
      .update(thresholdsTable)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(thresholdsTable.patientId, patientId))
      .returning();

    res.json(updated);
  } catch (err) {
    console.error("Update thresholds error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to update thresholds" });
  }
});

export default router;
