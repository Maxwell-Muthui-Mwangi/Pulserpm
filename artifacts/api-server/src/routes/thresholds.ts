import { Router } from "express";
import { db, thresholdsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { getOrCreateThresholds } from "../lib/alertEngine.js";

const router = Router();

router.get("/patients/:patientId/thresholds", requireAuth, async (req, res) => {
  try {
    const patientId = Number(req.params.patientId);
    if (req.user!.role === "patient" && req.user!.id !== patientId) {
      res.status(403).json({ error: "Forbidden", message: "Access denied" });
      return;
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
