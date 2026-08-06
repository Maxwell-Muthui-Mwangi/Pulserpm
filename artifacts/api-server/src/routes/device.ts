import { Router } from "express";
import { db, patientsTable, vitalsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { evaluateVitals, getOrCreateThresholds, processAndSaveAlerts } from "../lib/alertEngine.js";
import { broadcastVitals, subscribe } from "../lib/deviceSSE.js";
import { verifyToken } from "../lib/auth.js";
import crypto from "crypto";

const router = Router();

// Generate or retrieve a device API key for the authenticated patient
router.post("/device/generate-key", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "patient") {
      res.status(403).json({ error: "Forbidden", message: "Only patients can generate device keys" });
      return;
    }

    const apiKey = crypto.randomUUID();

    await db
      .update(patientsTable)
      .set({ deviceApiKey: apiKey, deviceType: "wearable" })
      .where(eq(patientsTable.id, req.user!.id));

    res.json({ apiKey, message: "Device API key generated. Keep this key safe — it grants access to your health data." });
  } catch (err) {
    console.error("Generate key error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to generate key" });
  }
});

// Get the current device API key for authenticated patient
router.get("/device/key", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "patient") {
      res.status(403).json({ error: "Forbidden", message: "Only patients can view device keys" });
      return;
    }

    const [patient] = await db
      .select({ deviceApiKey: patientsTable.deviceApiKey, deviceType: patientsTable.deviceType })
      .from(patientsTable)
      .where(eq(patientsTable.id, req.user!.id));

    res.json({ apiKey: patient?.deviceApiKey || null, deviceType: patient?.deviceType || "manual" });
  } catch (err) {
    console.error("Get key error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to get key" });
  }
});

// Revoke the current device API key
router.delete("/device/key", requireAuth, async (req, res) => {
  try {
    if (req.user!.role !== "patient") {
      res.status(403).json({ error: "Forbidden", message: "Only patients can revoke device keys" });
      return;
    }

    await db
      .update(patientsTable)
      .set({ deviceApiKey: null, deviceType: "manual" })
      .where(eq(patientsTable.id, req.user!.id));

    res.json({ message: "Device API key revoked successfully" });
  } catch (err) {
    console.error("Revoke key error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to revoke key" });
  }
});

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Public key validation endpoint ─────────────────────────────────────────
// Used by mobile app to verify a scanned/entered API key before saving it.
router.get("/device/status", async (req, res) => {
  try {
    const apiKey = (req.headers["x-device-api-key"] as string) || (req.query.apiKey as string);
    if (!apiKey || !UUID_REGEX.test(apiKey)) {
      res.status(401).json({ valid: false, error: "Invalid API key" });
      return;
    }

    const [patient] = await db
      .select({ id: patientsTable.id, name: patientsTable.name })
      .from(patientsTable)
      .where(eq(patientsTable.deviceApiKey, apiKey))
      .limit(1);

    if (!patient) {
      res.status(401).json({ valid: false, error: "Invalid API key" });
      return;
    }

    res.json({ valid: true, patientId: patient.id, patientName: patient.name });
  } catch (err) {
    console.error("Device status error:", err);
    res.status(500).json({ valid: false, error: "Server error" });
  }
});

// ─── Public ingest endpoint (no JWT required) ────────────────────────────────
// Accepts health data from wearables/apps authenticated via device API key.
// Supports multiple data formats:
//   Standard:     { heartRate, systolicBp, diastolicBp, spo2, temperature, caloriesBurned, recordedAt }
//   Apple Health: { HeartRate, BloodPressureSystolic, BloodPressureDiastolic, OxygenSaturation, BodyTemperature, ActiveEnergyBurned, StartDate }
//   Fitbit:       { heart: { restingHeartRate }, spo2: { value }, tempSkin: { value }, calories: { value } }
//   Google Fit:   { heartRate: { bpm }, bloodPressure: { systolic, diastolic }, oxygen: { saturation }, temperature: { celsius } }
router.post("/device/ingest", async (req, res) => {
  try {
    const apiKey = req.headers["x-device-api-key"] as string || req.query.apiKey as string;

    if (!apiKey) {
      res.status(401).json({ error: "Unauthorized", message: "Missing X-Device-Api-Key header or apiKey query param" });
      return;
    }

    const [patient] = await db
      .select()
      .from(patientsTable)
      .where(eq(patientsTable.deviceApiKey, apiKey));

    if (!patient) {
      res.status(401).json({ error: "Unauthorized", message: "Invalid device API key" });
      return;
    }

    const body = req.body;

    // Normalize data from multiple formats
    const heartRate = normalizeField(body,
      ["heartRate", "HeartRate", "heart_rate", "bpm"],
      body.heart?.restingHeartRate,
      body.heartRate?.bpm
    );

    const systolicBp = normalizeField(body,
      ["systolicBp", "BloodPressureSystolic", "systolic_bp", "systolic"],
      body.bloodPressure?.systolic
    );

    const diastolicBp = normalizeField(body,
      ["diastolicBp", "BloodPressureDiastolic", "diastolic_bp", "diastolic"],
      body.bloodPressure?.diastolic
    );

    const spo2 = normalizeField(body,
      ["spo2", "OxygenSaturation", "oxygen_saturation", "SpO2"],
      body.spo2?.value,
      body.oxygen?.saturation
    );

    const temperature = normalizeField(body,
      ["temperature", "BodyTemperature", "body_temperature", "tempSkin"],
      body.tempSkin?.value,
      body.temperature?.celsius
    );

    const caloriesBurned = normalizeField(body,
      ["caloriesBurned", "ActiveEnergyBurned", "calories_burned", "calories"],
      body.calories?.value
    );

    const recordedAt = body.recordedAt || body.StartDate || body.startDate || body.timestamp || new Date().toISOString();

    // Accept source from body (e.g. "oraimo"), fall back to "wearable"
    const ALLOWED_SOURCES = ["oraimo", "healthwear", "wearable", "manual", "apple_health", "google_fit", "fitbit", "tk65", "health_connect", "mobile"];
    const source = (typeof body.source === "string" && ALLOWED_SOURCES.includes(body.source))
      ? body.source
      : "wearable";

    if (!heartRate && !systolicBp && !spo2 && !temperature) {
      res.status(400).json({ error: "Bad Request", message: "No recognizable vital signs in payload" });
      return;
    }

    const [inserted] = await db.insert(vitalsTable).values({
      patientId: patient.id,
      heartRate: heartRate ? Math.round(heartRate) : null,
      systolicBp: systolicBp ? Math.round(systolicBp) : null,
      diastolicBp: diastolicBp ? Math.round(diastolicBp) : null,
      spo2: spo2 ? Math.round(spo2) : null,
      temperature: temperature ? Number(temperature.toFixed(1)) : null,
      caloriesBurned: caloriesBurned ? Math.round(caloriesBurned) : null,
      source,
      recordedAt: new Date(recordedAt),
    }).returning();

    // Run alert engine
    const thresholds = await getOrCreateThresholds(patient.id);
    const candidates = evaluateVitals(inserted, thresholds);
    const triggeredAlerts = await processAndSaveAlerts(patient.id, candidates);

    // Push real-time vitals event to any subscribed dashboard tabs
    broadcastVitals(patient.id, {
      vitalsId: inserted.id,
      patientId: patient.id,
      heartRate: inserted.heartRate,
      systolicBp: inserted.systolicBp,
      diastolicBp: inserted.diastolicBp,
      spo2: inserted.spo2,
      temperature: inserted.temperature,
      caloriesBurned: inserted.caloriesBurned,
      source: inserted.source,
      recordedAt: inserted.recordedAt,
      alertsTriggered: triggeredAlerts.length,
    });

    res.status(201).json({ 
      success: true, 
      message: "Vitals recorded successfully",
      vitalsId: inserted.id,
      patientId: patient.id,
      recordedAt: inserted.recordedAt,
      alertsTriggered: triggeredAlerts.length
    });
  } catch (err) {
    console.error("Device ingest error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to ingest vitals" });
  }
});

function normalizeField(body: Record<string, unknown>, keys: string[], ...fallbacks: (number | undefined | null)[]): number | null {
  for (const key of keys) {
    if (body[key] !== undefined && body[key] !== null) {
      const val = Number(body[key]);
      if (!isNaN(val)) return val;
    }
  }
  for (const fallback of fallbacks) {
    if (fallback !== undefined && fallback !== null && !isNaN(fallback)) return fallback;
  }
  return null;
}

// Expose the current Expo Go development URL so the dashboard can generate
// a scannable QR code that opens directly in Expo Go.
// REPLIT_EXPO_DEV_DOMAIN is injected by the Expo workflow environment.
router.get("/device/expo-dev-url", (_req, res) => {
  const expoDomain = process.env.REPLIT_EXPO_DEV_DOMAIN;
  res.json({
    url: expoDomain ? `exp://${expoDomain}/--/pair` : null,
  });
});

// ─── Public connection-config endpoint ──────────────────────────────────────
// Returns JSON connection config for a given API key; used by the QR code URL.
// The companion app GETs this URL after scanning the QR, then saves the config.
router.get("/device/connect", async (req, res) => {
  try {
    const apiKey = req.query.apiKey as string | undefined;
    if (!apiKey || !UUID_REGEX.test(apiKey)) {
      res.status(400).json({ valid: false, error: "Missing or invalid apiKey" });
      return;
    }

    const [patient] = await db
      .select({ id: patientsTable.id })
      .from(patientsTable)
      .where(eq(patientsTable.deviceApiKey, apiKey))
      .limit(1);

    if (!patient) {
      res.status(401).json({ valid: false, error: "Invalid API key" });
      return;
    }

    const base = `${req.protocol}://${req.get("host")}`;
    res.json({
      valid: true,
      apiKey,
      patientId: patient.id,
      ingestUrl: `${base}/api/device/ingest`,
      statusUrl: `${base}/api/device/status`,
      version: 1,
    });
  } catch (err) {
    console.error("Device connect error:", err);
    res.status(500).json({ valid: false, error: "Server error" });
  }
});

// ─── SSE endpoint for real-time vitals push ──────────────────────────────────
// Dashboard tabs subscribe here; EventSource can't set headers so JWT is
// passed as a query param (?token=...).  Nginx proxy buffering is disabled via
// the X-Accel-Buffering header.
router.get("/device/events", async (req, res) => {
  // Authenticate via query-param token (EventSource cannot set headers)
  const token = req.query.token as string | undefined;
  if (!token) {
    res.status(401).json({ error: "Missing token" });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  // Determine which patient's events to stream
  let patientId: number;
  if (payload.role === "patient") {
    patientId = payload.id as number;
  } else {
    // Provider: requires explicit patientId query param
    const qp = parseInt(req.query.patientId as string, 10);
    if (!qp || isNaN(qp)) {
      res.status(400).json({ error: "Missing patientId for provider SSE" });
      return;
    }
    patientId = qp;
  }

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx proxy buffering
  res.flushHeaders();

  // Register subscriber
  const unsubscribe = subscribe(patientId, res);

  // Send initial connected event
  res.write(`event: connected\ndata: ${JSON.stringify({ patientId })}\n\n`);

  // Heartbeat every 25 s to keep the connection alive through proxies
  const heartbeat = setInterval(() => {
    try { res.write(`: heartbeat\n\n`); } catch { /* client gone */ }
  }, 25_000);

  // Clean up on client disconnect
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

export default router;
