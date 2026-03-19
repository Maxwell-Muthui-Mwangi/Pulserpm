import { db, alertsTable, thresholdsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { Vitals, Threshold, InsertAlert } from "@workspace/db";

type RiskLevel = "normal" | "warning" | "critical";

interface AlertCandidate {
  vitalType: string;
  severity: "warning" | "critical";
  message: string;
  value: number;
  threshold: number;
  suggestedAction: string;
}

export async function getOrCreateThresholds(patientId: number): Promise<Threshold> {
  const existing = await db
    .select()
    .from(thresholdsTable)
    .where(eq(thresholdsTable.patientId, patientId))
    .limit(1);

  if (existing.length > 0) return existing[0];

  const [created] = await db
    .insert(thresholdsTable)
    .values({ patientId })
    .returning();
  return created;
}

export function evaluateVitals(vitals: Partial<Vitals>, thresholds: Threshold): AlertCandidate[] {
  const candidates: AlertCandidate[] = [];

  if (vitals.heartRate !== null && vitals.heartRate !== undefined) {
    const hr = vitals.heartRate;
    if (hr <= thresholds.heartRateCriticalMin || hr >= thresholds.heartRateCriticalMax) {
      candidates.push({
        vitalType: "heart_rate",
        severity: "critical",
        message: `Critical heart rate: ${hr} BPM`,
        value: hr,
        threshold: hr < thresholds.heartRateCriticalMin ? thresholds.heartRateCriticalMin : thresholds.heartRateCriticalMax,
        suggestedAction: "Contact patient immediately. Consider emergency response.",
      });
    } else if (hr < thresholds.heartRateMin || hr > thresholds.heartRateMax) {
      candidates.push({
        vitalType: "heart_rate",
        severity: "warning",
        message: `Abnormal heart rate: ${hr} BPM`,
        value: hr,
        threshold: hr < thresholds.heartRateMin ? thresholds.heartRateMin : thresholds.heartRateMax,
        suggestedAction: "Review patient's medication and activity levels. Schedule follow-up.",
      });
    }
  }

  if (vitals.systolicBp !== null && vitals.systolicBp !== undefined) {
    const sbp = vitals.systolicBp;
    if (sbp <= thresholds.systolicBpCriticalMin || sbp >= thresholds.systolicBpCriticalMax) {
      candidates.push({
        vitalType: "blood_pressure",
        severity: "critical",
        message: `Critical systolic BP: ${sbp} mmHg`,
        value: sbp,
        threshold: sbp < thresholds.systolicBpCriticalMin ? thresholds.systolicBpCriticalMin : thresholds.systolicBpCriticalMax,
        suggestedAction: "Immediate medical evaluation required. Check for hypertensive crisis or hypotension.",
      });
    } else if (sbp < thresholds.systolicBpMin || sbp > thresholds.systolicBpMax) {
      candidates.push({
        vitalType: "blood_pressure",
        severity: "warning",
        message: `Elevated systolic BP: ${sbp} mmHg`,
        value: sbp,
        threshold: sbp > thresholds.systolicBpMax ? thresholds.systolicBpMax : thresholds.systolicBpMin,
        suggestedAction: "Review blood pressure medication. Advise patient to rest and reduce sodium intake.",
      });
    }
  }

  if (vitals.diastolicBp !== null && vitals.diastolicBp !== undefined) {
    const dbp = vitals.diastolicBp;
    if (dbp >= thresholds.diastolicBpCriticalMax) {
      candidates.push({
        vitalType: "blood_pressure",
        severity: "critical",
        message: `Critical diastolic BP: ${dbp} mmHg`,
        value: dbp,
        threshold: thresholds.diastolicBpCriticalMax,
        suggestedAction: "Immediate medical evaluation required for hypertensive crisis.",
      });
    } else if (dbp > thresholds.diastolicBpMax) {
      candidates.push({
        vitalType: "blood_pressure",
        severity: "warning",
        message: `High diastolic BP: ${dbp} mmHg`,
        value: dbp,
        threshold: thresholds.diastolicBpMax,
        suggestedAction: "Monitor blood pressure closely. Review antihypertensive therapy.",
      });
    }
  }

  if (vitals.spo2 !== null && vitals.spo2 !== undefined) {
    const spo2 = vitals.spo2;
    if (spo2 <= thresholds.spo2CriticalMin) {
      candidates.push({
        vitalType: "spo2",
        severity: "critical",
        message: `Critical SpO2: ${spo2}%`,
        value: spo2,
        threshold: thresholds.spo2CriticalMin,
        suggestedAction: "Patient may require supplemental oxygen. Immediate medical attention needed.",
      });
    } else if (spo2 < thresholds.spo2Min) {
      candidates.push({
        vitalType: "spo2",
        severity: "warning",
        message: `Low SpO2: ${spo2}%`,
        value: spo2,
        threshold: thresholds.spo2Min,
        suggestedAction: "Monitor respiratory status closely. Consider pulse oximetry follow-up.",
      });
    }
  }

  if (vitals.temperature !== null && vitals.temperature !== undefined) {
    const temp = vitals.temperature;
    if (temp >= thresholds.temperatureCriticalMax) {
      candidates.push({
        vitalType: "temperature",
        severity: "critical",
        message: `High fever: ${temp}°C`,
        value: temp,
        threshold: thresholds.temperatureCriticalMax,
        suggestedAction: "High fever detected. Evaluate for infection and consider antipyretic therapy.",
      });
    } else if (temp > thresholds.temperatureMax || temp < thresholds.temperatureMin) {
      candidates.push({
        vitalType: "temperature",
        severity: "warning",
        message: `Abnormal temperature: ${temp}°C`,
        value: temp,
        threshold: temp > thresholds.temperatureMax ? thresholds.temperatureMax : thresholds.temperatureMin,
        suggestedAction: "Monitor temperature closely. Review recent medications and activities.",
      });
    }
  }

  return candidates;
}

export function computeRiskLevel(alerts: AlertCandidate[]): RiskLevel {
  if (alerts.some((a) => a.severity === "critical")) return "critical";
  if (alerts.some((a) => a.severity === "warning")) return "warning";
  return "normal";
}

export async function processAndSaveAlerts(
  patientId: number,
  candidates: AlertCandidate[]
): Promise<typeof alertsTable.$inferSelect[]> {
  if (candidates.length === 0) return [];

  const toInsert: InsertAlert[] = candidates.map((c) => ({
    patientId,
    vitalType: c.vitalType,
    severity: c.severity,
    message: c.message,
    value: c.value,
    threshold: c.threshold,
    status: "active",
    suggestedAction: c.suggestedAction,
    triggeredAt: new Date(),
  }));

  const saved = await db.insert(alertsTable).values(toInsert).returning();
  return saved;
}
