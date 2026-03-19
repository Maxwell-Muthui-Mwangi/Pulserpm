import { Router } from "express";
import { db, vitalsTable, alertsTable, patientsTable } from "@workspace/db";
import { eq, and, gte, lte, sql, count, avg, min, max, sum } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

router.get("/patients/:patientId/summary", requireAuth, async (req, res) => {
  try {
    const patientId = Number(req.params.patientId);
    if (req.user!.role === "patient" && req.user!.id !== patientId) {
      res.status(403).json({ error: "Forbidden", message: "Access denied" });
      return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const [stats] = await db
      .select({
        avgHeartRate: avg(vitalsTable.heartRate),
        minHeartRate: min(vitalsTable.heartRate),
        maxHeartRate: max(vitalsTable.heartRate),
        avgSystolicBp: avg(vitalsTable.systolicBp),
        avgDiastolicBp: avg(vitalsTable.diastolicBp),
        avgSpo2: avg(vitalsTable.spo2),
        totalCalories: sum(vitalsTable.caloriesBurned),
        readingsCount: count(),
      })
      .from(vitalsTable)
      .where(
        and(
          eq(vitalsTable.patientId, patientId),
          gte(vitalsTable.recordedAt, today),
          lte(vitalsTable.recordedAt, tomorrow)
        )
      );

    const [alertsCount] = await db
      .select({ count: count() })
      .from(alertsTable)
      .where(
        and(
          eq(alertsTable.patientId, patientId),
          gte(alertsTable.triggeredAt, today),
          lte(alertsTable.triggeredAt, tomorrow)
        )
      );

    const activeAlerts = await db
      .select()
      .from(alertsTable)
      .where(and(eq(alertsTable.patientId, patientId), eq(alertsTable.status, "active")));

    let riskLevel: "normal" | "warning" | "critical" = "normal";
    if (activeAlerts.some((a) => a.severity === "critical")) riskLevel = "critical";
    else if (activeAlerts.some((a) => a.severity === "warning")) riskLevel = "warning";

    res.json({
      patientId,
      date: today.toISOString().split("T")[0],
      avgHeartRate: stats?.avgHeartRate ? Number(stats.avgHeartRate) : null,
      minHeartRate: stats?.minHeartRate ? Number(stats.minHeartRate) : null,
      maxHeartRate: stats?.maxHeartRate ? Number(stats.maxHeartRate) : null,
      avgSystolicBp: stats?.avgSystolicBp ? Number(stats.avgSystolicBp) : null,
      avgDiastolicBp: stats?.avgDiastolicBp ? Number(stats.avgDiastolicBp) : null,
      avgSpo2: stats?.avgSpo2 ? Number(stats.avgSpo2) : null,
      totalCalories: stats?.totalCalories ? Number(stats.totalCalories) : null,
      readingsCount: Number(stats?.readingsCount ?? 0),
      alertsCount: Number(alertsCount.count),
      riskLevel,
    });
  } catch (err) {
    console.error("Get summary error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to get summary" });
  }
});

router.get("/dashboard/stats", requireAuth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Patient-specific stats: return their own health summary
    if (req.user!.role === "patient") {
      const patientId = req.user!.id;

      const activeAlerts = await db
        .select()
        .from(alertsTable)
        .where(and(eq(alertsTable.patientId, patientId), eq(alertsTable.status, "active")));

      const criticalAlerts = activeAlerts.filter((a) => a.severity === "critical").length;
      const averageAlerts = activeAlerts.filter((a) => a.severity === "warning").length;

      // Determine overall status
      let overallStatus: "critical" | "average" | "good" = "good";
      if (criticalAlerts > 0) overallStatus = "critical";
      else if (averageAlerts > 0) overallStatus = "average";

      const [todaysReadings] = await db
        .select({ count: count() })
        .from(vitalsTable)
        .where(and(eq(vitalsTable.patientId, patientId), gte(vitalsTable.recordedAt, today)));

      return res.json({
        isPatientView: true,
        activeAlerts: activeAlerts.length,
        criticalAlerts,
        averageAlerts,
        goodAlerts: overallStatus === "good" ? 1 : 0,
        overallStatus,
        todaysReadings: Number(todaysReadings.count),
      });
    }

    // Provider stats: aggregate across all patients
    const [patientCount] = await db.select({ count: count() }).from(patientsTable);

    const [activeAlertsCount] = await db
      .select({ count: count() })
      .from(alertsTable)
      .where(eq(alertsTable.status, "active"));

    const allPatients = await db.select({ id: patientsTable.id }).from(patientsTable);

    let criticalPatients = 0;
    let warningPatients = 0;
    let normalPatients = 0;

    for (const patient of allPatients) {
      const alerts = await db
        .select()
        .from(alertsTable)
        .where(and(eq(alertsTable.patientId, patient.id), eq(alertsTable.status, "active")));

      if (alerts.some((a) => a.severity === "critical")) criticalPatients++;
      else if (alerts.some((a) => a.severity === "warning")) warningPatients++;
      else normalPatients++;
    }

    const [todaysReadings] = await db
      .select({ count: count() })
      .from(vitalsTable)
      .where(gte(vitalsTable.recordedAt, today));

    return res.json({
      isPatientView: false,
      totalPatients: Number(patientCount.count),
      activeAlerts: Number(activeAlertsCount.count),
      criticalPatients,
      warningPatients,
      normalPatients,
      todaysReadings: Number(todaysReadings.count),
    });
  } catch (err) {
    console.error("Dashboard stats error:", err);
    return res.status(500).json({ error: "Internal Server Error", message: "Failed to get dashboard stats" });
  }
});

export default router;
