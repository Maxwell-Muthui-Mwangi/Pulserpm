import { Router } from "express";
import { db, patientsTable, vitalsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { evaluateVitals, getOrCreateThresholds, processAndSaveAlerts } from "../lib/alertEngine.js";
import { broadcastVitals, subscribePatient, subscribeProvider } from "../lib/deviceSSE.js";
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
//   HealthWatch:  { heartRate, heart_rate, systolic, systolicBp, diastolic, diastolicBp, spo2, bloodOxygen, temperature, temp, steps, source, device, recordedAt, timestamp }
//   Apple Health: { HeartRate, BloodPressureSystolic, BloodPressureDiastolic, OxygenSaturation, BodyTemperature, ActiveEnergyBurned, StartDate }
//   Fitbit:       { heart: { restingHeartRate }, spo2: { value }, tempSkin: { value }, calories: { value } }
//   Google Fit:   { heartRate: { bpm }, bloodPressure: { systolic, diastolic }, oxygen: { saturation }, temperature: { celsius } }
// Shared helper – resolves an API key from any of the auth styles companion
// apps use: X-Device-Api-Key header, Authorization: Bearer <key>, or ?apiKey=
function resolveApiKey(req: import("express").Request): string | null {
  const headerKey = req.headers["x-device-api-key"] as string | undefined;
  if (headerKey) return headerKey;

  const auth = req.headers["authorization"] as string | undefined;
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const candidate = auth.slice(7).trim();
    if (UUID_REGEX.test(candidate)) return candidate;
  }

  const queryKey = req.query.apiKey as string | undefined;
  if (queryKey) return queryKey;

  return null;
}

async function handleIngest(req: import("express").Request, res: import("express").Response) {
  try {
    const apiKey = resolveApiKey(req);

    if (!apiKey) {
      res.status(401).json({ error: "Unauthorized", message: "Missing X-Device-Api-Key header, Authorization: Bearer <key>, or apiKey query param" });
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

    const normalized = normalizeVitalReading(req.body, patient.id);
    if (!normalized) {
      res.status(400).json({ error: "Bad Request", message: "No recognizable vital signs in payload" });
      return;
    }

    const [inserted] = await db.insert(vitalsTable).values(normalized).returning();

    // Run alert engine
    const thresholds = await getOrCreateThresholds(patient.id);
    const candidates = evaluateVitals(inserted, thresholds);
    const triggeredAlerts = await processAndSaveAlerts(patient.id, candidates);

    // Classify: is this a real-time reading or a backlogged one?
    // Backlog = device-reported timestamp is >2 h older than server receipt time.
    // Dashboards use this flag to skip overwriting live vital values with stale
    // historical data while still updating receivedAt (proving device is connected).
    const isBacklog = (inserted.createdAt.getTime() - inserted.recordedAt.getTime()) > 2 * 60 * 60 * 1000;

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
      receivedAt: inserted.createdAt,  // server receipt timestamp — always current
      isBacklog,                        // true = old device timestamp, skip vital overwrite
      alertsTriggered: triggeredAlerts.length,
    });

    // Return 200 (not 201) — several companion apps (including HealthWatch) only
    // mark a sync as "Synced" on a 200 response; a 201 causes silent retries.
    res.status(200).json({ 
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
}

// ─── Batch ingest endpoint ────────────────────────────────────────────────────
// Accepts an array of readings in one HTTP request — dramatically faster backlog
// clearing vs. one-reading-per-request. Up to 200 readings per call.
// Body: { readings: [...] }  OR  a bare array  [...].
async function handleBatchIngest(req: import("express").Request, res: import("express").Response) {
  try {
    const apiKey = resolveApiKey(req);
    if (!apiKey) {
      res.status(401).json({ error: "Unauthorized", message: "Missing X-Device-Api-Key header, Authorization: Bearer <key>, or apiKey query param" });
      return;
    }

    const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.deviceApiKey, apiKey));
    if (!patient) {
      res.status(401).json({ error: "Unauthorized", message: "Invalid device API key" });
      return;
    }

    const body = req.body;
    const rawReadings: any[] = Array.isArray(body) ? body
      : Array.isArray(body?.readings) ? body.readings : [];

    if (rawReadings.length === 0) {
      res.status(400).json({ error: "Bad Request", message: "readings array is empty or missing — send { readings: [...] } or a bare array" });
      return;
    }

    const MAX_BATCH = 200;
    const batch = rawReadings.slice(0, MAX_BATCH);
    const normalized = batch
      .map(r => normalizeVitalReading(r, patient.id))
      .filter(Boolean) as NonNullable<ReturnType<typeof normalizeVitalReading>>[];

    if (normalized.length === 0) {
      res.status(400).json({ error: "Bad Request", message: "No recognizable vital signs in any of the provided readings" });
      return;
    }

    // Single bulk INSERT — far faster than N individual round-trips
    const insertedRows = await db.insert(vitalsTable).values(normalized).returning();

    // Run alert engine only on real-time (non-backlog) readings — avoids
    // flooding alerts with old historical data while still catching live events.
    const thresholds = await getOrCreateThresholds(patient.id);
    let alertsTriggered = 0;
    let latestRealtime: (typeof insertedRows)[0] | null = null;
    let latestBacklog:  (typeof insertedRows)[0] | null = null;

    for (const row of insertedRows) {
      const isBacklog = (row.createdAt.getTime() - row.recordedAt.getTime()) > 2 * 60 * 60 * 1000;
      if (!isBacklog) {
        const candidates = evaluateVitals(row, thresholds);
        const triggered  = await processAndSaveAlerts(patient.id, candidates);
        alertsTriggered += triggered.length;
        if (!latestRealtime || row.createdAt > latestRealtime.createdAt) latestRealtime = row;
      } else {
        if (!latestBacklog || row.createdAt > latestBacklog.createdAt) latestBacklog = row;
      }
    }

    // Broadcast once — prefer the latest real-time reading; fall back to latest
    // backlog so the dashboard still knows the device is communicating.
    const bcast = latestRealtime ?? latestBacklog!;
    broadcastVitals(patient.id, {
      vitalsId:       bcast.id,
      patientId:      patient.id,
      heartRate:      bcast.heartRate,
      systolicBp:     bcast.systolicBp,
      diastolicBp:    bcast.diastolicBp,
      spo2:           bcast.spo2,
      temperature:    bcast.temperature,
      caloriesBurned: bcast.caloriesBurned,
      source:         bcast.source,
      recordedAt:     bcast.recordedAt,
      receivedAt:     bcast.createdAt,
      isBacklog:      !latestRealtime,
      alertsTriggered,
    });

    res.status(200).json({
      success: true,
      message: `${insertedRows.length} reading${insertedRows.length !== 1 ? "s" : ""} recorded`,
      inserted: insertedRows.length,
      skipped:  batch.length - normalized.length,
      ...(rawReadings.length > MAX_BATCH ? { truncated: true, limit: MAX_BATCH, received: rawReadings.length } : {}),
      alertsTriggered,
    });
  } catch (err) {
    console.error("Batch ingest error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to ingest batch" });
  }
}

// Primary ingest route + path aliases for companion app compatibility
router.post("/device/ingest",       handleIngest);
router.post("/device/sync",         handleIngest);  // alias: HealthWatch may use /sync
router.post("/ingest",              handleIngest);  // alias: short path

// Batch ingest — send up to 200 readings per HTTP request for fast backlog clearing
router.post("/device/ingest/batch", handleBatchIngest);
router.post("/device/batch",        handleBatchIngest);  // alias
router.post("/ingest/batch",        handleBatchIngest);  // alias
router.post("/batch",               handleBatchIngest);  // alias: short path

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

// ─── Vital normalization helper ───────────────────────────────────────────────
// Shared by single and batch ingest. Returns null when the payload has no
// recognisable vital signs so the caller can skip/reject cleanly.
const ALLOWED_SOURCES = ["oraimo", "healthwear", "healthwatch", "wearable", "manual",
  "apple_health", "google_fit", "fitbit", "tk65", "health_connect", "mobile"] as const;

function normalizeVitalReading(body: any, patientId: number) {
  const heartRate = normalizeField(body,
    ["heartRate", "HeartRate", "heart_rate", "bpm"],
    body.heart?.restingHeartRate, body.heartRate?.bpm);
  const systolicBp = normalizeField(body,
    ["systolicBp", "BloodPressureSystolic", "systolic_bp", "systolic"],
    body.bloodPressure?.systolic);
  const diastolicBp = normalizeField(body,
    ["diastolicBp", "BloodPressureDiastolic", "diastolic_bp", "diastolic"],
    body.bloodPressure?.diastolic);
  const spo2 = normalizeField(body,
    ["spo2", "OxygenSaturation", "oxygen_saturation", "SpO2", "bloodOxygen", "blood_oxygen"],
    body.spo2?.value, body.oxygen?.saturation);
  const temperature = normalizeField(body,
    ["temperature", "BodyTemperature", "body_temperature", "tempSkin", "temp"],
    body.tempSkin?.value, body.temperature?.celsius);
  const caloriesBurned = normalizeField(body,
    ["caloriesBurned", "ActiveEnergyBurned", "calories_burned", "calories"],
    body.calories?.value);
  // Steps stored in caloriesBurned column — keeps "last synced" current even
  // when the watch isn't actively measuring HR/SpO₂/BP.
  const steps = normalizeField(body, ["steps", "stepCount", "step_count", "dailySteps"]);
  const effectiveCalories = caloriesBurned ?? steps;

  if (!heartRate && !systolicBp && !spo2 && !temperature && !effectiveCalories) return null;

  const rawTs = body.recordedAt || body.StartDate || body.startDate || body.timestamp || new Date().toISOString();
  const source = (typeof body.source === "string" && (ALLOWED_SOURCES as readonly string[]).includes(body.source))
    ? body.source : "wearable";

  return {
    patientId,
    heartRate:      heartRate      ? Math.round(heartRate)            : null,
    systolicBp:     systolicBp     ? Math.round(systolicBp)           : null,
    diastolicBp:    diastolicBp    ? Math.round(diastolicBp)          : null,
    spo2:           spo2           ? Math.round(spo2)                 : null,
    temperature:    temperature    ? Number(temperature.toFixed(1))   : null,
    caloriesBurned: effectiveCalories ? Math.round(effectiveCalories) : null,
    source,
    recordedAt: new Date(rawTs),
  };
}

// ─── Shared identity response builder ────────────────────────────────────────
async function buildIdentityResponse(
  apiKey: string,
  req: import("express").Request,
  res: import("express").Response
): Promise<void> {
  if (!UUID_REGEX.test(apiKey)) {
    res.status(401).json({ valid: false, error: "Missing or invalid API key" });
    return;
  }
  const [patient] = await db
    .select({ id: patientsTable.id, name: patientsTable.name, email: patientsTable.email })
    .from(patientsTable)
    .where(eq(patientsTable.deviceApiKey, apiKey))
    .limit(1);
  if (!patient) {
    res.status(401).json({ valid: false, error: "API key not recognised" });
    return;
  }
  const base = `${req.protocol}://${req.get("host")}`;
  const ingestUrl = `${base}/api/device/ingest`;
  const eventsUrl = `${base}/api/device/events`;
  res.json({
    // Identity — all field names HealthWatch may read
    valid: true,
    patientId: patient.id,
    patient_id: patient.id,
    id: patient.id,
    patientName: patient.name,
    name: patient.name,
    email: patient.email,
    accountEmail: patient.email,

    // Ingest URL aliases
    ingestUrl,
    syncUrl: ingestUrl,
    endpoint: ingestUrl,

    // SSE stream URL aliases
    eventsUrl,
    streamUrl: eventsUrl,
    sseUrl: eventsUrl,

    // Base server
    serverUrl: base,
    baseUrl: base,
    pingUrl: `${base}/api/device/ping`,
  });
}

// ─── /device/config — primary identity-resolution endpoint ───────────────────
// HealthWatch calls GET /api/device/config?apiKey=<key> (or X-Device-Api-Key
// header) after QR scan or manual entry to resolve patient ID + email and
// obtain all ingest / SSE URLs in one shot.
router.get("/device/config", async (req, res) => {
  const apiKey = resolveApiKey(req);
  if (!apiKey) { res.status(401).json({ valid: false, error: "Missing API key" }); return; }
  await buildIdentityResponse(apiKey, req, res);
});

// ─── /device/ping — lightweight liveness + identity check ────────────────────
// Used by HealthWatch's "Linked to Patient ID" indicator.
router.get("/device/ping", async (req, res) => {
  const apiKey = resolveApiKey(req);
  if (!apiKey) { res.status(401).json({ valid: false, error: "Missing API key" }); return; }
  await buildIdentityResponse(apiKey, req, res);
});

// ─── Ingest route aliases ─────────────────────────────────────────────────────
// Some companion apps use a shorter path. Forward to the same handler.
// ─── Expose current Expo Go dev URL ──────────────────────────────────────────
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
      .select({ id: patientsTable.id, name: patientsTable.name })
      .from(patientsTable)
      .where(eq(patientsTable.deviceApiKey, apiKey))
      .limit(1);

    if (!patient) {
      res.status(401).json({ valid: false, error: "Invalid API key" });
      return;
    }

    const base = `${req.protocol}://${req.get("host")}`;
    const ingestUrl = `${base}/api/device/ingest`;
    const eventsUrl = `${base}/api/device/events`;

    // Return multiple field-name aliases so different companion apps can find
    // what they need regardless of which key name they look for.
    res.json({
      valid: true,
      apiKey,
      patientId: patient.id,
      patientName: patient.name,

      // Ingest URL — all aliases point to the same endpoint
      ingestUrl,
      syncUrl: ingestUrl,
      endpoint: ingestUrl,
      serverUrl: base,
      baseUrl: base,

      // SSE stream URL — companion apps can subscribe for real-time push-back
      eventsUrl,
      streamUrl: eventsUrl,
      sseUrl: eventsUrl,

      // Convenience status endpoint
      statusUrl: `${base}/api/device/status`,
      pingUrl: `${base}/api/device/ping`,

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
//
// Auth modes:
//   ?token=<jwt>    → Patient JWT subscribes to own channel
//                     Provider JWT subscribes to global (all-patients) channel
//   ?apiKey=<uuid>  → Companion app (e.g. HealthWatch) subscribes to patient channel
//                     identified by the device API key — no JWT required
router.get("/device/events", async (req, res) => {
  const token  = req.query.token  as string | undefined;
  const apiKey = req.query.apiKey as string | undefined;

  // ── API-key auth (companion apps) ──────────────────────────────────────────
  if (apiKey && !token) {
    if (!UUID_REGEX.test(apiKey)) {
      res.status(401).json({ error: "Invalid API key format" });
      return;
    }
    const [patient] = await db
      .select({ id: patientsTable.id })
      .from(patientsTable)
      .where(eq(patientsTable.deviceApiKey, apiKey))
      .limit(1);
    if (!patient) {
      res.status(401).json({ error: "API key not recognised" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const unsubscribe = subscribePatient(patient.id, res);
    res.write(`event: connected\ndata: ${JSON.stringify({ patientId: patient.id, auth: "apiKey" })}\n\n`);

    const heartbeat = setInterval(() => {
      try { res.write(`: heartbeat\n\n`); } catch { /* client gone */ }
    }, 25_000);

    req.on("close", () => { clearInterval(heartbeat); unsubscribe(); });
    return;
  }

  // ── JWT auth (dashboard) ────────────────────────────────────────────────────
  if (!token) {
    res.status(401).json({ error: "Missing token or apiKey" });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  // Set SSE headers (override the app-level no-store with no-cache for streaming)
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx proxy buffering
  res.flushHeaders();

  let unsubscribe: () => void;

  if (payload.role === "patient") {
    // Patient: subscribe to their own patient-specific vitals channel
    const patientId = payload.id as number;
    unsubscribe = subscribePatient(patientId, res);
    res.write(`event: connected\ndata: ${JSON.stringify({ patientId })}\n\n`);
  } else {
    // Provider: subscribe to the global channel — receives events for ALL patients
    // so the dashboard updates instantly whenever any patient's device pushes data.
    unsubscribe = subscribeProvider(res);
    res.write(`event: connected\ndata: ${JSON.stringify({ role: "provider" })}\n\n`);
  }

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
