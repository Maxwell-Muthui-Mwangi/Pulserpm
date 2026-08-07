/**
 * Patient list staleness tests — API-level integration
 *
 * Verifies that:
 *  1. `deviceType` is included in the GET /api/patients list response
 *     for both wearable and manual patients.
 *  2. `lastSeen` in the list response reflects the timestamp of the most
 *     recent ingest, allowing clients to detect data gaps.
 *  3. A freshly ingested reading (wearable) produces lastSeen within the
 *     last few seconds.
 *  4. A patient whose last reading is older than the threshold can be
 *     identified via lastSeen (staleness logic lives in the dashboard,
 *     but the data contract it depends on is validated here).
 *
 * Automatically skipped when DATABASE_URL is not set.
 *
 * Run:
 *   pnpm --filter @workspace/api-server test
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pool: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let patientsTable: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let providersTable: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let vitalsTable: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let eq: any;
let createToken: (payload: Record<string, unknown>) => string;

const DB_AVAILABLE = !!process.env.DATABASE_URL;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getJson(
  url: string,
  headers: Record<string, string>,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(url, { headers });
  const parsed: unknown = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body: parsed };
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const parsed: unknown = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body: parsed };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe(
  "Patient list — deviceType and staleness contract",
  {
    skip: !DB_AVAILABLE
      ? "DATABASE_URL not set — skipping patient staleness integration tests"
      : false,
  },
  () => {
    let server: http.Server;
    let baseUrl: string;
    let providerId: number;
    let providerJwt: string;
    let wearablePatientId: number;
    let manualPatientId: number;
    let wearableApiKey: string;

    // ── Setup ────────────────────────────────────────────────────────────────

    before(async () => {
      const [appMod, dbMod, drizzleMod, authMod] = await Promise.all([
        import("../app.js"),
        import("@workspace/db"),
        import("drizzle-orm"),
        import("../lib/auth.js"),
      ]);

      db             = dbMod.db;
      pool           = dbMod.pool;
      patientsTable  = dbMod.patientsTable;
      providersTable = dbMod.providersTable;
      vitalsTable    = dbMod.vitalsTable;
      eq             = drizzleMod.eq;
      createToken    = authMod.createToken;

      server = http.createServer(appMod.default);
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const addr = server.address() as { port: number };
      baseUrl = `http://127.0.0.1:${addr.port}`;

      // Create a real provider row in the providers table so patients can
      // be assigned to it (the FK is providers.id, not patients.id).
      const providerEmail = `staleness-provider-${crypto.randomUUID()}@test.invalid`;
      const [provRow] = await db
        .insert(providersTable)
        .values({
          name:         "__staleness_test_provider__",
          email:        providerEmail,
          passwordHash: "x",
          role:         "provider",
        })
        .returning({ id: providersTable.id });
      providerId = provRow.id;

      providerJwt = createToken({
        id:    providerId,
        role:  "provider",
        email: providerEmail,
      });

      // Seed a wearable patient (has a paired device API key).
      wearableApiKey = crypto.randomUUID();
      const [wRow] = await db
        .insert(patientsTable)
        .values({
          name:         "__staleness_wearable__",
          email:        `staleness-wearable-${wearableApiKey}@test.invalid`,
          passwordHash: "x",
          deviceApiKey: wearableApiKey,
          deviceType:   "wearable",
          role:         "patient",
          providerId,
        })
        .returning({ id: patientsTable.id });
      wearablePatientId = wRow.id;

      // Seed a manual patient (no device).
      const [mRow] = await db
        .insert(patientsTable)
        .values({
          name:         "__staleness_manual__",
          email:        `staleness-manual-${crypto.randomUUID()}@test.invalid`,
          passwordHash: "x",
          deviceType:   "manual",
          role:         "patient",
          providerId,
        })
        .returning({ id: patientsTable.id });
      manualPatientId = mRow.id;
    });

    // ── Teardown ──────────────────────────────────────────────────────────────

    after(async () => {
      if (db && wearablePatientId) {
        await db.delete(vitalsTable).where(eq(vitalsTable.patientId, wearablePatientId)).catch(() => {});
        await db.delete(vitalsTable).where(eq(vitalsTable.patientId, manualPatientId)).catch(() => {});
        await db.delete(patientsTable).where(eq(patientsTable.id, wearablePatientId)).catch(() => {});
        await db.delete(patientsTable).where(eq(patientsTable.id, manualPatientId)).catch(() => {});
        await db.delete(providersTable).where(eq(providersTable.id, providerId)).catch(() => {});
      }
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
      await pool?.end().catch(() => {});
    });

    // ── Tests ─────────────────────────────────────────────────────────────────

    it("list response includes deviceType=wearable for a wearable patient", async () => {
      const { ok, body } = await getJson(`${baseUrl}/api/patients`, {
        Authorization: `Bearer ${providerJwt}`,
      });
      assert.equal(ok, true, "GET /api/patients should return 200");

      const patients = body as Array<Record<string, unknown>>;
      const wearable = patients.find((p) => p.id === wearablePatientId);
      assert.ok(wearable, "Wearable patient should appear in the list");
      assert.equal(
        wearable.deviceType,
        "wearable",
        "deviceType should be 'wearable' for a device-paired patient",
      );
    });

    it("list response includes deviceType=manual for a manual patient", async () => {
      const { ok, body } = await getJson(`${baseUrl}/api/patients`, {
        Authorization: `Bearer ${providerJwt}`,
      });
      assert.equal(ok, true, "GET /api/patients should return 200");

      const patients = body as Array<Record<string, unknown>>;
      const manual = patients.find((p) => p.id === manualPatientId);
      assert.ok(manual, "Manual patient should appear in the list");
      assert.equal(
        manual.deviceType,
        "manual",
        "deviceType should be 'manual' for a patient without a device",
      );
    });

    it("lastSeen is null before any reading is ingested", async () => {
      const { ok, body } = await getJson(`${baseUrl}/api/patients`, {
        Authorization: `Bearer ${providerJwt}`,
      });
      assert.equal(ok, true);

      const patients = body as Array<Record<string, unknown>>;
      const wearable = patients.find((p) => p.id === wearablePatientId);
      assert.ok(wearable, "Wearable patient should be in the list");
      assert.equal(
        wearable.lastSeen ?? null,
        null,
        "lastSeen should be null before any vitals are ingested",
      );
    });

    it("lastSeen updates to match the ingest timestamp after a reading is pushed", async () => {
      const beforeIngest = Date.now();

      const ingestRes = await postJson(
        `${baseUrl}/api/device/ingest`,
        { "X-Device-Api-Key": wearableApiKey },
        { heartRate: 72, source: "wearable" },
      );
      assert.equal(ingestRes.ok, true, `Ingest should succeed; got: ${JSON.stringify(ingestRes.body)}`);

      const { ok, body } = await getJson(`${baseUrl}/api/patients`, {
        Authorization: `Bearer ${providerJwt}`,
      });
      assert.equal(ok, true);

      const patients = body as Array<Record<string, unknown>>;
      const wearable = patients.find((p) => p.id === wearablePatientId);
      assert.ok(wearable, "Wearable patient should still be in the list");
      assert.ok(wearable.lastSeen, "lastSeen should be populated after ingest");

      const lastSeenMs = new Date(wearable.lastSeen as string).getTime();
      const afterIngest = Date.now();
      assert.ok(
        lastSeenMs >= beforeIngest - 1000 && lastSeenMs <= afterIngest + 1000,
        `lastSeen (${wearable.lastSeen}) should be within the ingest window [${new Date(beforeIngest).toISOString()}, ${new Date(afterIngest).toISOString()}]`,
      );
    });

    it("a patient with a stale lastSeen can be identified via the DATA_GAP_THRESHOLD", async () => {
      // Insert a vitals row with a recordedAt far in the past to simulate
      // a long gap. The staleness logic (isDataGap) lives in the dashboard,
      // but this test confirms the data contract it depends on is honoured:
      // lastSeen reflects the actual reading timestamp, not the server wall clock.
      const staleTime = new Date(Date.now() - 90 * 60 * 1000); // 90 min ago

      await db.insert(vitalsTable).values({
        patientId:  manualPatientId,
        heartRate:  68,
        source:     "manual",
        recordedAt: staleTime,
      });

      const { ok, body } = await getJson(`${baseUrl}/api/patients`, {
        Authorization: `Bearer ${providerJwt}`,
      });
      assert.equal(ok, true);

      const patients = body as Array<Record<string, unknown>>;
      const manual = patients.find((p) => p.id === manualPatientId);
      assert.ok(manual, "Manual patient should be in the list");
      assert.ok(manual.lastSeen, "lastSeen should be set after inserting a stale reading");

      const lastSeenMs = new Date(manual.lastSeen as string).getTime();
      const DATA_GAP_THRESHOLD_MS = 30 * 60 * 1000; // must match dashboard constant
      assert.ok(
        Date.now() - lastSeenMs > DATA_GAP_THRESHOLD_MS,
        `lastSeen (${manual.lastSeen}) should be older than the 30-min gap threshold so dashboards can flag it`,
      );
    });
  },
);
