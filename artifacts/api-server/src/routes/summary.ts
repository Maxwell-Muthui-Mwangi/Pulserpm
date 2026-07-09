import { Router } from "express";
import { db, vitalsTable, alertsTable, patientsTable } from "@workspace/db";
import { eq, and, gte, lte, sql, count, avg, min, max, sum, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

router.get("/patients/:patientId/summary", requireAuth, async (req, res) => {
  try {
    const patientId = Number(req.params.patientId);
    if (req.user!.role === "patient" && req.user!.id !== patientId) {
      res.status(403).json({ error: "Forbidden", message: "Access denied" });
      return;
    }
    // Providers can only view summaries for their own patients
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

    // Provider stats: aggregate only across their own patients
    const providerId = req.user!.id;
    const myPatients = await db
      .select({ id: patientsTable.id })
      .from(patientsTable)
      .where(eq(patientsTable.providerId, providerId));

    const myPatientIds = myPatients.map((p) => p.id);

    const [patientCount] = await db
      .select({ count: count() })
      .from(patientsTable)
      .where(eq(patientsTable.providerId, providerId));

    let activeAlertsCount = { count: 0 };
    let todaysReadings = { count: 0 };
    let criticalPatients = 0;
    let warningPatients = 0;
    let normalPatients = 0;

    if (myPatientIds.length > 0) {
      const [alertsRow] = await db
        .select({ count: count() })
        .from(alertsTable)
        .where(and(eq(alertsTable.status, "active"), inArray(alertsTable.patientId, myPatientIds)));
      activeAlertsCount = alertsRow ?? { count: 0 };

      const [readingsRow] = await db
        .select({ count: count() })
        .from(vitalsTable)
        .where(and(gte(vitalsTable.recordedAt, today), inArray(vitalsTable.patientId, myPatientIds)));
      todaysReadings = readingsRow ?? { count: 0 };

      for (const patient of myPatients) {
        const alerts = await db
          .select()
          .from(alertsTable)
          .where(and(eq(alertsTable.patientId, patient.id), eq(alertsTable.status, "active")));

        if (alerts.some((a) => a.severity === "critical")) criticalPatients++;
        else if (alerts.some((a) => a.severity === "warning")) warningPatients++;
        else normalPatients++;
      }
    }

    return res.json({
      isPatientView: false,
      totalPatients: Number(patientCount?.count ?? 0),
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

router.get("/dashboard/trends", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "provider") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const providerId = req.user!.id;
    const days = Math.min(Math.max(parseInt(String(req.query.days ?? "7"), 10), 1), 30);

    const since = new Date();
    since.setDate(since.getDate() - days + 1);
    since.setHours(0, 0, 0, 0);

    // Only include vitals for this provider's own patients
    const myPatients = await db
      .select({ id: patientsTable.id })
      .from(patientsTable)
      .where(eq(patientsTable.providerId, providerId));
    const myPatientIds = myPatients.map((p) => p.id);

    let trend: object[] = [];
    let critical = 0, warning = 0, normal = 0;

    if (myPatientIds.length > 0) {
      const rows = await db
        .select({
          day: sql<string>`DATE_TRUNC('day', ${vitalsTable.recordedAt})::text`,
          avgHeartRate: avg(vitalsTable.heartRate),
          avgSystolicBp: avg(vitalsTable.systolicBp),
          avgSpo2: avg(vitalsTable.spo2),
          avgTemperature: avg(vitalsTable.temperature),
          totalReadings: count(),
        })
        .from(vitalsTable)
        .where(and(gte(vitalsTable.recordedAt, since), inArray(vitalsTable.patientId, myPatientIds)))
        .groupBy(sql`DATE_TRUNC('day', ${vitalsTable.recordedAt})`)
        .orderBy(sql`DATE_TRUNC('day', ${vitalsTable.recordedAt})`);

      trend = rows.map((r) => ({
        date: r.day ? (r.day.includes("T") ? r.day.split("T")[0] : r.day.split(" ")[0]) : "",
        avgHeartRate: r.avgHeartRate ? parseFloat(Number(r.avgHeartRate).toFixed(1)) : null,
        avgSystolicBp: r.avgSystolicBp ? parseFloat(Number(r.avgSystolicBp).toFixed(1)) : null,
        avgSpo2: r.avgSpo2 ? parseFloat(Number(r.avgSpo2).toFixed(1)) : null,
        avgTemperature: r.avgTemperature ? parseFloat(Number(r.avgTemperature).toFixed(2)) : null,
        totalReadings: Number(r.totalReadings),
      }));

      for (const p of myPatients) {
        const activeAlerts = await db
          .select()
          .from(alertsTable)
          .where(and(eq(alertsTable.patientId, p.id), eq(alertsTable.status, "active")));
        if (activeAlerts.some((a) => a.severity === "critical")) critical++;
        else if (activeAlerts.some((a) => a.severity === "warning")) warning++;
        else normal++;
      }
    }

    return res.json({ trend, patientStatus: { critical, warning, normal } });
  } catch (err) {
    console.error("Dashboard trends error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
