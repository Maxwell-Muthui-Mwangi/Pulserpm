import { Router } from "express";
import { db, patientsTable, vitalsTable, alertsTable, thresholdsTable, pendingPatientsTable } from "@workspace/db";
import { eq, and, or, ilike, inArray, sql, count, desc } from "drizzle-orm";
import { hashPassword } from "../lib/auth.js";
import { requireAuth } from "../middlewares/auth.js";
import { getOrCreateThresholds } from "../lib/alertEngine.js";

const router = Router();

function calcAge(dob: string | null): number | undefined {
  if (!dob) return undefined;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

async function computeRiskLevel(patientId: number): Promise<"normal" | "warning" | "critical"> {
  const activeAlerts = await db
    .select()
    .from(alertsTable)
    .where(and(eq(alertsTable.patientId, patientId), eq(alertsTable.status, "active")));

  if (activeAlerts.some((a) => a.severity === "critical")) return "critical";
  if (activeAlerts.some((a) => a.severity === "warning")) return "warning";
  return "normal";
}

router.get("/patients/pending/count", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "provider") { res.status(403).json({ error: "Forbidden" }); return; }
    const [row] = await db.select({ count: count() }).from(pendingPatientsTable).where(eq(pendingPatientsTable.emailVerified, true));
    res.json({ count: Number(row?.count ?? 0) });
  } catch (err) {
    console.error("Pending count error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/patients/pending", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "provider") { res.status(403).json({ error: "Forbidden" }); return; }
    const rows = await db.select({ id: pendingPatientsTable.id, name: pendingPatientsTable.name, email: pendingPatientsTable.email, createdAt: pendingPatientsTable.createdAt })
      .from(pendingPatientsTable)
      .where(eq(pendingPatientsTable.emailVerified, true))
      .orderBy(desc(pendingPatientsTable.createdAt));
    res.json(rows);
  } catch (err) {
    console.error("Pending patients error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/patients/pending/:id/approve", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "provider") { res.status(403).json({ error: "Forbidden" }); return; }
    const pendingId = parseInt(req.params.id, 10);
    const { age, conditions, gender, dateOfBirth, providerId } = req.body;

    const [pending] = await db.select().from(pendingPatientsTable).where(eq(pendingPatientsTable.id, pendingId)).limit(1);
    if (!pending) { res.status(404).json({ error: "Not Found", message: "Pending patient not found" }); return; }

    const conditionsArr: string[] = Array.isArray(conditions) ? conditions : (conditions ? [conditions] : []);
    let dob: string | undefined = dateOfBirth;
    if (!dob && age) {
      const year = new Date().getFullYear() - parseInt(age, 10);
      dob = `${year}-01-01`;
    }

    const [patient] = await db.insert(patientsTable).values({
      name: pending.name,
      email: pending.email,
      passwordHash: pending.passwordHash,
      role: "patient",
      conditions: conditionsArr,
      deviceType: "manual",
      gender: gender || null,
      dateOfBirth: dob || null,
      providerId: providerId ? parseInt(providerId, 10) : (req.user!.id ?? null),
      approvalWelcomePending: true,
    }).returning();

    await db.delete(pendingPatientsTable).where(eq(pendingPatientsTable.id, pendingId));
    res.status(201).json({ id: patient.id, name: patient.name, email: patient.email });
  } catch (err) {
    console.error("Approve patient error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Approval failed" });
  }
});

router.get("/patients", requireAuth, async (req, res) => {
  try {
    const { search, riskLevel, providerId } = req.query;

    let query = db.select().from(patientsTable).$dynamic();

    const conditions = [];

    // Patients can only see themselves
    if (req.user!.role === "patient") {
      conditions.push(eq(patientsTable.id, req.user!.id));
    } else {
      if (providerId) conditions.push(eq(patientsTable.providerId, Number(providerId)));
      if (search) {
        const s = `%${search}%`;
        conditions.push(or(ilike(patientsTable.name, s), ilike(patientsTable.email, s)));
      }
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const patients = await query;

    const results = await Promise.all(
      patients.map(async (p) => {
        const [latestVitals] = await db
          .select()
          .from(vitalsTable)
          .where(eq(vitalsTable.patientId, p.id))
          .orderBy(desc(vitalsTable.recordedAt))
          .limit(1);

        const [alertCount] = await db
          .select({ count: count() })
          .from(alertsTable)
          .where(and(eq(alertsTable.patientId, p.id), eq(alertsTable.status, "active")));

        const risk = await computeRiskLevel(p.id);

        const summary = {
          id: p.id,
          name: p.name,
          email: p.email,
          age: calcAge(p.dateOfBirth),
          conditions: p.conditions ?? [],
          riskLevel: risk,
          activeAlertCount: Number(alertCount.count),
          lastSeen: latestVitals?.recordedAt ?? null,
          latestVitals: latestVitals
            ? {
                heartRate: latestVitals.heartRate,
                systolicBp: latestVitals.systolicBp,
                diastolicBp: latestVitals.diastolicBp,
                spo2: latestVitals.spo2,
                caloriesBurned: latestVitals.caloriesBurned,
                temperature: latestVitals.temperature,
                recordedAt: latestVitals.recordedAt,
              }
            : null,
        };

        return summary;
      })
    );

    const filtered = riskLevel ? results.filter((r) => r.riskLevel === riskLevel) : results;
    res.json(filtered);
  } catch (err) {
    console.error("List patients error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to list patients" });
  }
});

router.post("/patients", requireAuth, async (req, res) => {
  try {
    const { name, email, password, dateOfBirth, gender, conditions, providerId, deviceType } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ error: "Bad Request", message: "name, email, and password are required" });
      return;
    }

    const [existing] = await db
      .select()
      .from(patientsTable)
      .where(eq(patientsTable.email, email))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: "Conflict", message: "Email already in use" });
      return;
    }

    const [patient] = await db
      .insert(patientsTable)
      .values({
        name,
        email,
        passwordHash: hashPassword(password),
        dateOfBirth: dateOfBirth || null,
        gender: gender || null,
        conditions: conditions || [],
        providerId: providerId || null,
        deviceType: deviceType || "manual",
        role: "patient",
      })
      .returning();

    await db.insert(thresholdsTable).values({ patientId: patient.id });

    res.status(201).json(patient);
  } catch (err) {
    console.error("Create patient error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to create patient" });
  }
});

router.get("/patients/:patientId", requireAuth, async (req, res) => {
  try {
    const patientId = Number(req.params.patientId);
    if (req.user!.role === "patient" && req.user!.id !== patientId) {
      res.status(403).json({ error: "Forbidden", message: "Access denied" });
      return;
    }
    const [patient] = await db
      .select()
      .from(patientsTable)
      .where(eq(patientsTable.id, patientId))
      .limit(1);

    if (!patient) {
      res.status(404).json({ error: "Not Found", message: "Patient not found" });
      return;
    }

    const [latestVitals] = await db
      .select()
      .from(vitalsTable)
      .where(eq(vitalsTable.patientId, patientId))
      .orderBy(desc(vitalsTable.recordedAt))
      .limit(1);

    const [alertCount] = await db
      .select({ count: count() })
      .from(alertsTable)
      .where(and(eq(alertsTable.patientId, patientId), eq(alertsTable.status, "active")));

    const thresholds = await getOrCreateThresholds(patientId);
    const risk = await computeRiskLevel(patientId);

    res.json({
      id: patient.id,
      name: patient.name,
      email: patient.email,
      dateOfBirth: patient.dateOfBirth,
      age: calcAge(patient.dateOfBirth),
      gender: patient.gender,
      conditions: patient.conditions ?? [],
      providerId: patient.providerId,
      deviceType: patient.deviceType,
      riskLevel: risk,
      activeAlertCount: Number(alertCount.count),
      latestVitals: latestVitals
        ? {
            heartRate: latestVitals.heartRate,
            systolicBp: latestVitals.systolicBp,
            diastolicBp: latestVitals.diastolicBp,
            spo2: latestVitals.spo2,
            caloriesBurned: latestVitals.caloriesBurned,
            temperature: latestVitals.temperature,
            recordedAt: latestVitals.recordedAt,
          }
        : null,
      thresholds,
      createdAt: patient.createdAt,
    });
  } catch (err) {
    console.error("Get patient error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to get patient" });
  }
});

router.put("/patients/:patientId", requireAuth, async (req, res) => {
  try {
    const patientId = Number(req.params.patientId);
    const { name, email, dateOfBirth, gender, conditions, providerId, deviceType } = req.body;

    const [updated] = await db
      .update(patientsTable)
      .set({
        ...(name !== undefined && { name }),
        ...(email !== undefined && { email }),
        ...(dateOfBirth !== undefined && { dateOfBirth }),
        ...(gender !== undefined && { gender }),
        ...(conditions !== undefined && { conditions }),
        ...(providerId !== undefined && { providerId }),
        ...(deviceType !== undefined && { deviceType }),
        updatedAt: new Date(),
      })
      .where(eq(patientsTable.id, patientId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Not Found", message: "Patient not found" });
      return;
    }

    res.json(updated);
  } catch (err) {
    console.error("Update patient error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to update patient" });
  }
});

export default router;
