import { Router } from "express";
import { db, vitalsTable, patientsTable } from "@workspace/db";
import { eq, and, gte, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import {
  getOrCreateThresholds,
  evaluateVitals,
  computeRiskLevel,
  processAndSaveAlerts,
} from "../lib/alertEngine.js";

const router = Router();

router.get("/patients/:patientId/vitals", requireAuth, async (req, res) => {
  try {
    const patientId = Number(req.params.patientId);
    if (req.user!.role === "patient" && req.user!.id !== patientId) {
      res.status(403).json({ error: "Forbidden", message: "Access denied" });
      return;
    }
    const period = (req.query.period as string) || "day";
    const limit = Math.min(Number(req.query.limit) || 100, 500);

    const now = new Date();
    let since: Date;
    if (period === "week") {
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === "month") {
      since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else {
      since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const vitals = await db
      .select()
      .from(vitalsTable)
      .where(and(eq(vitalsTable.patientId, patientId), gte(vitalsTable.recordedAt, since)))
      .orderBy(desc(vitalsTable.recordedAt))
      .limit(limit);

    res.json(vitals);
  } catch (err) {
    console.error("Get vitals error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to get vitals" });
  }
});

router.post("/patients/:patientId/vitals", requireAuth, async (req, res) => {
  try {
    const patientId = Number(req.params.patientId);
    if (req.user!.role === "patient" && req.user!.id !== patientId) {
      res.status(403).json({ error: "Forbidden", message: "Access denied" });
      return;
    }
    const { heartRate, systolicBp, diastolicBp, spo2, caloriesBurned, temperature, source, recordedAt } = req.body;

    const [vitals] = await db
      .insert(vitalsTable)
      .values({
        patientId,
        heartRate: heartRate ?? null,
        systolicBp: systolicBp ?? null,
        diastolicBp: diastolicBp ?? null,
        spo2: spo2 ?? null,
        caloriesBurned: caloriesBurned ?? null,
        temperature: temperature ?? null,
        source: source || "manual",
        recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
      })
      .returning();

    const thresholds = await getOrCreateThresholds(patientId);
    const candidates = evaluateVitals(vitals, thresholds);
    const alerts = await processAndSaveAlerts(patientId, candidates);
    const riskLevel = computeRiskLevel(candidates);

    res.status(201).json({ vitals, alertsTriggered: alerts, riskLevel });
  } catch (err) {
    console.error("Ingest vitals error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to ingest vitals" });
  }
});

router.get("/patients/:patientId/vitals/latest", requireAuth, async (req, res) => {
  try {
    const patientId = Number(req.params.patientId);
    if (req.user!.role === "patient" && req.user!.id !== patientId) {
      res.status(403).json({ error: "Forbidden", message: "Access denied" });
      return;
    }

    const [vitals] = await db
      .select()
      .from(vitalsTable)
      .where(eq(vitalsTable.patientId, patientId))
      .orderBy(desc(vitalsTable.recordedAt))
      .limit(1);

    if (!vitals) {
      res.status(404).json({ error: "Not Found", message: "No vitals found for patient" });
      return;
    }

    res.json(vitals);
  } catch (err) {
    console.error("Get latest vitals error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to get latest vitals" });
  }
});

router.post("/vitals/ingest-batch", requireAuth, async (req, res) => {
  try {
    const { readings } = req.body;
    if (!Array.isArray(readings)) {
      res.status(400).json({ error: "Bad Request", message: "readings must be an array" });
      return;
    }

    let processed = 0;
    let alertsTriggered = 0;
    const errors: string[] = [];

    for (const reading of readings) {
      try {
        const { patientId, vitals: v } = reading;
        const [saved] = await db
          .insert(vitalsTable)
          .values({
            patientId,
            heartRate: v.heartRate ?? null,
            systolicBp: v.systolicBp ?? null,
            diastolicBp: v.diastolicBp ?? null,
            spo2: v.spo2 ?? null,
            caloriesBurned: v.caloriesBurned ?? null,
            temperature: v.temperature ?? null,
            source: v.source || "manual",
            recordedAt: v.recordedAt ? new Date(v.recordedAt) : new Date(),
          })
          .returning();

        const thresholds = await getOrCreateThresholds(patientId);
        const candidates = evaluateVitals(saved, thresholds);
        const alerts = await processAndSaveAlerts(patientId, candidates);
        alertsTriggered += alerts.length;
        processed++;
      } catch (e) {
        errors.push(`Patient ${reading.patientId}: ${String(e)}`);
      }
    }

    res.json({ processed, alertsTriggered, errors });
  } catch (err) {
    console.error("Batch ingest error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Batch ingest failed" });
  }
});

export default router;
