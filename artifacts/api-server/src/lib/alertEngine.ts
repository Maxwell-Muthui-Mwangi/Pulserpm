import { db, alertsTable, thresholdsTable, patientsTable, providersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { Vitals, Threshold, InsertAlert } from "@workspace/db";
import { sendAlertEmail } from "./email.js";

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

function computeAge(dateOfBirth: string | null | undefined): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

/**
 * Deduplication window: suppress a new alert if the same patientId+vitalType+severity
 * was already alerted within this period. Uses an in-process Map so the check-and-set
 * is atomic with no DB race-condition window (works reliably on a single-server deploy).
 */
const DEDUP_WINDOW_MS = 5 * 60 * 1_000; // 5 minutes

/** key: `patientId:vitalType:severity` → timestamp of last fire (ms) */
const recentAlertMap = new Map<string, number>();

function isDuplicateAlert(patientId: number, vitalType: string, severity: string): boolean {
  const key = `${patientId}:${vitalType}:${severity}`;
  const lastFired = recentAlertMap.get(key);
  const now = Date.now();
  if (lastFired && now - lastFired < DEDUP_WINDOW_MS) return true;
  recentAlertMap.set(key, now);
  return false;
}

export async function processAndSaveAlerts(
  patientId: number,
  candidates: AlertCandidate[]
): Promise<typeof alertsTable.$inferSelect[]> {
  if (candidates.length === 0) return [];

  // ── Deduplication: skip any candidate whose vitalType+severity fired recently.
  //    In-process Map is checked-and-set atomically (single event-loop tick) so
  //    burst requests can't race past each other.
  const dedupedCandidates = candidates.filter(
    (c) => !isDuplicateAlert(patientId, c.vitalType, c.severity)
  );

  if (dedupedCandidates.length === 0) return [];

  const toInsert: InsertAlert[] = dedupedCandidates.map((c) => ({
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

  setImmediate(async () => {
    try {
      const [patient] = await db
        .select()
        .from(patientsTable)
        .where(eq(patientsTable.id, patientId))
        .limit(1);

      if (!patient) return;

      // Only notify the patient's specifically assigned provider
      if (!patient.providerId) {
        console.warn(`[alertEngine] Patient ${patientId} has no assigned provider — skipping alert email`);
        return;
      }

      const [provider] = await db
        .select()
        .from(providersTable)
        .where(eq(providersTable.id, patient.providerId))
        .limit(1);

      if (!provider) {
        console.warn(`[alertEngine] Assigned provider ${patient.providerId} not found for patient ${patientId} — skipping alert email`);
        return;
      }

      await sendAlertEmail({
        providerName: provider.name,
        providerEmail: provider.email,
        patientId: patient.id,
        patientAge: computeAge(patient.dateOfBirth),
        patientGender: patient.gender,
        patientConditions: patient.conditions ?? [],
        alerts: dedupedCandidates.map((c) => ({
          vitalType: c.vitalType,
          severity: c.severity,
          message: c.message,
          suggestedAction: c.suggestedAction,
        })),
      });
    } catch (err) {
      console.error("[alertEngine] Email notification error:", err);
    }
  });

  return saved;
}
