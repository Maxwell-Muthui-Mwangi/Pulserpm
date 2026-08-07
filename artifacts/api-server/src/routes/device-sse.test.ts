/**
 * SSE Integration Tests — end-to-end over a real HTTP server
 *
 * Validates the full path: device ingest → SSE broadcast → dashboard receives.
 * Spins up the Express app in-process on a random port; creates a temporary
 * test patient via the real database and cleans up afterwards.
 *
 * No external credentials required — all test data is self-provisioned.
 *
 * Run:
 *   pnpm --filter @workspace/api-server test
 *
 * The test suite is automatically skipped when DATABASE_URL is not set (e.g.
 * in a pure unit-test environment) so it never fails with a confusing
 * connection error rather than a meaningful SSE failure message.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

type SseEvent = { name: string; data: unknown };
type SseStream = { events: AsyncGenerator<SseEvent>; abort: () => void };

/**
 * The Promise resolve callback for IteratorResult has the signature
 *   (value: IteratorResult<T> | PromiseLike<IteratorResult<T>>) => void
 * Declaring resolveNext with this exact type prevents TypeScript from
 * intersecting the declared type with the assigned type and narrowing to never.
 */
type SseResolver = (
  value: IteratorResult<SseEvent> | PromiseLike<IteratorResult<SseEvent>>,
) => void;

// ── Module refs (populated lazily in before()) ────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pool: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let patientsTable: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let vitalsTable: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let thresholdsTable: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let alertsTable: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let eq: any;
let createToken: (payload: Record<string, unknown>) => string;

const DB_AVAILABLE = !!process.env.DATABASE_URL;

// ── Helpers ───────────────────────────────────────────────────────────────────

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * POST JSON to an endpoint and return the parsed response body (any status).
 * Does NOT throw on HTTP errors — lets the caller assert on the status/body.
 */
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

/**
 * Open an SSE stream and return an async generator that yields parsed events
 * plus an abort function.
 */
function openSseStream(baseUrl: string, token: string): SseStream {
  const controller = new AbortController();

  // Object property instead of a bare `let` — TypeScript does not apply
  // control-flow narrowing to object properties, so the type stays stable
  // across async boundaries and multiple closure writes.
  const ctx: { resolveNext: SseResolver | null } = { resolveNext: null };
  const queue: SseEvent[] = [];
  let done = false;
  let streamError: Error | null = null;

  /** Wake the waiting generator (if any) with a terminal result. */
  function wakeWithDone() {
    if (ctx.resolveNext) {
      ctx.resolveNext({ value: undefined as never, done: true });
      ctx.resolveNext = null;
    }
  }

  /** Wake the waiting generator with a yielded event. */
  function wakeWithEvent(ev: SseEvent) {
    if (ctx.resolveNext) {
      ctx.resolveNext({ value: ev, done: false });
      ctx.resolveNext = null;
    } else {
      queue.push(ev);
    }
  }

  (async () => {
    try {
      const res = await fetch(
        `${baseUrl}/api/device/events?token=${encodeURIComponent(token)}`,
        { headers: { Accept: "text/event-stream" }, signal: controller.signal },
      );
      if (!res.ok || !res.body) {
        streamError = new Error(`SSE endpoint returned HTTP ${res.status}`);
        done = true;
        wakeWithDone();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "message";
      let currentData = "";

      for (;;) {
        const { value, done: readerDone } = await reader.read();
        if (readerDone) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            currentData = line.slice(5).trim();
          } else if (line === "") {
            if (currentData || currentEvent !== "message") {
              let parsed: unknown = currentData;
              try { parsed = JSON.parse(currentData); } catch { /* keep raw string */ }
              wakeWithEvent({ name: currentEvent, data: parsed });
            }
            currentEvent = "message";
            currentData = "";
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== "AbortError") {
        streamError = err instanceof Error ? err : new Error(String(err));
      }
    } finally {
      done = true;
      wakeWithDone();
    }
  })();

  async function* generator(): AsyncGenerator<SseEvent> {
    for (;;) {
      if (queue.length > 0) {
        yield queue.shift()!;
      } else if (done) {
        if (streamError) throw streamError;
        return;
      } else {
        const event = await new Promise<IteratorResult<SseEvent>>(
          (resolve) => { ctx.resolveNext = resolve; },
        );
        if (event.done) {
          if (streamError) throw streamError;
          return;
        }
        yield event.value;
      }
    }
  }

  return { events: generator(), abort: () => controller.abort() };
}

/**
 * Wait for a named SSE event within a deadline; returns its data payload.
 * The error message is crafted to point engineers at the SSE pipeline.
 */
async function waitForEvent(
  gen: AsyncGenerator<SseEvent>,
  eventName: string,
  timeoutMs: number,
): Promise<unknown> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    const next = await Promise.race([
      gen.next(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `Timed out after ${timeoutMs}ms waiting for SSE event "${eventName}". ` +
                  `This is a regression in the ingest→broadcast→SSE pipeline. ` +
                  `Check artifacts/api-server/src/lib/deviceSSE.ts and the ` +
                  `/api/device/events route in artifacts/api-server/src/routes/device.ts.`,
              ),
            ),
          remaining,
        ),
      ),
    ]);
    if (next.done) {
      throw new Error(
        `SSE stream closed before "${eventName}" event arrived — ` +
          `check that the /api/device/events endpoint holds the connection open.`,
      );
    }
    if (next.value.name === eventName) return next.value.data;
  }
  throw new Error(`Timed out waiting for SSE event "${eventName}"`);
}

// ── Test suite ────────────────────────────────────────────────────────────────

const TIMEOUT_MS = 8_000;

describe(
  "SSE pipeline — end-to-end integration",
  {
    skip: !DB_AVAILABLE
      ? "DATABASE_URL not set — skipping SSE HTTP integration tests"
      : false,
  },
  () => {
    let server: http.Server;
    let baseUrl: string;
    let testPatientId: number;
    let testDeviceApiKey: string;
    let providerJwt: string;

    // ── Setup: import modules, start server, create test data ─────────────────
    // Lazy import keeps module-level DB initialisation off the cold path for
    // pure unit-test runs where DATABASE_URL is absent.

    before(async () => {
      const [appMod, dbMod, drizzleMod, authMod] = await Promise.all([
        import("../app.js"),
        import("@workspace/db"),
        import("drizzle-orm"),
        import("../lib/auth.js"),
      ]);

      db              = dbMod.db;
      pool            = dbMod.pool;        // pg Pool — needed to drain connections on exit
      patientsTable   = dbMod.patientsTable;
      vitalsTable     = dbMod.vitalsTable;
      thresholdsTable = dbMod.thresholdsTable;
      alertsTable     = dbMod.alertsTable;
      eq              = drizzleMod.eq;
      createToken     = authMod.createToken;

      // Start the Express app on a random OS-assigned port.
      server = http.createServer(appMod.default);
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const addr = server.address() as { port: number };
      baseUrl = `http://127.0.0.1:${addr.port}`;

      // Seed an isolated test patient with a known device API key.
      testDeviceApiKey = crypto.randomUUID();
      const [inserted] = await db
        .insert(patientsTable)
        .values({
          name:         "__sse_test_patient__",
          email:        `sse-test-${testDeviceApiKey}@test.invalid`,
          passwordHash: "x",
          deviceApiKey: testDeviceApiKey,
          deviceType:   "wearable",
          role:         "patient",
        })
        .returning({ id: patientsTable.id });
      testPatientId = inserted.id;

      // Forge a valid provider JWT.  The SSE endpoint only calls verifyToken()
      // (signature check) — no provider row is required in the DB.
      providerJwt = createToken({
        id:    99999,
        role:  "provider",
        email: "test-provider@test.invalid",
      });
    });

    // ── Teardown: remove test data, close server + DB pool ────────────────────

    after(async () => {
      if (testPatientId) {
        // Delete in FK order: alerts → thresholds → vitals → patient.
        await db.delete(alertsTable).where(eq(alertsTable.patientId, testPatientId));
        await db.delete(thresholdsTable).where(eq(thresholdsTable.patientId, testPatientId));
        await db.delete(vitalsTable).where(eq(vitalsTable.patientId, testPatientId));
        await db.delete(patientsTable).where(eq(patientsTable.id, testPatientId));
      }
      // Force-close all open HTTP connections (including lingering SSE streams)
      // so server.close() returns promptly rather than waiting indefinitely.
      if (typeof server.closeAllConnections === "function") {
        server.closeAllConnections();
      }
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
      // End all idle DB pool connections so the Node process can exit cleanly.
      if (pool) await pool.end();
    });

    // ── Step 1: health check ──────────────────────────────────────────────────

    it("API server responds to /api/healthz", async () => {
      const res = await fetch(`${baseUrl}/api/healthz`);
      assert.ok(res.ok, `Expected 2xx from /api/healthz but got ${res.status}`);
      const body = await res.json() as Record<string, unknown>;
      assert.ok(body.status, "Health response should include a 'status' field");
    });

    // ── Step 2: ingest endpoint ───────────────────────────────────────────────

    it("POST /api/device/ingest accepts vitals and returns a vitalsId", async () => {
      const { ok, status, body } = await postJson(
        `${baseUrl}/api/device/ingest`,
        { "X-Device-Api-Key": testDeviceApiKey },
        { heartRate: 72, systolicBp: 120, diastolicBp: 80, spo2: 98, temperature: 36.6, source: "manual" },
      );
      const b = body as Record<string, unknown>;
      assert.ok(ok, `Ingest returned ${status}: ${JSON.stringify(body)}`);
      assert.ok(
        typeof b.vitalsId === "number",
        `Expected numeric vitalsId in response, got ${JSON.stringify(body)}`,
      );
    });

    // ── Step 3: SSE connected event ───────────────────────────────────────────

    it("GET /api/device/events sends a 'connected' event to a JWT-authenticated provider", async () => {
      const { events, abort } = openSseStream(baseUrl, providerJwt);
      try {
        const data = await waitForEvent(events, "connected", TIMEOUT_MS);
        const payload = data as Record<string, unknown>;
        assert.equal(
          payload.role,
          "provider",
          `Expected role='provider' in connected payload, got ${JSON.stringify(payload)}`,
        );
      } finally {
        abort();
      }
    });

    // ── Step 4: ingest → SSE fan-out (core regression guard) ─────────────────

    it("POST /api/device/ingest broadcasts a 'vitals' SSE event to open provider streams", async () => {
      const { events, abort } = openSseStream(baseUrl, providerJwt);
      try {
        // Wait for the subscription to be active before ingesting.
        await waitForEvent(events, "connected", TIMEOUT_MS);

        const [ingestResult, sseData] = await Promise.all([
          postJson(
            `${baseUrl}/api/device/ingest`,
            { "X-Device-Api-Key": testDeviceApiKey },
            { heartRate: 88, systolicBp: 130, diastolicBp: 85, spo2: 97, temperature: 37.1, source: "manual" },
          ),
          waitForEvent(events, "vitals", TIMEOUT_MS),
        ]);

        assert.ok(
          ingestResult.ok,
          `Ingest failed: ${ingestResult.status} — ${JSON.stringify(ingestResult.body)}`,
        );
        const payload = sseData as Record<string, unknown>;
        assert.equal(payload.heartRate, 88, `Expected HR=88 in SSE payload, got ${JSON.stringify(payload)}`);
        assert.equal(payload.patientId, testPatientId, "SSE patientId mismatch");
      } finally {
        abort();
      }
    });

    // ── Steps 5–7: reconnect (simulates a dropped connection) ─────────────────

    it("SSE stream delivers vitals on a new connection after the previous one is dropped", async () => {
      // Open, confirm the subscription is live, then force-close the connection.
      const first = openSseStream(baseUrl, providerJwt);
      await waitForEvent(first.events, "connected", TIMEOUT_MS);
      first.abort();
      await wait(300); // let the server-side close handler fire

      // Reconnect on a fresh connection.
      const second = openSseStream(baseUrl, providerJwt);
      try {
        await waitForEvent(second.events, "connected", TIMEOUT_MS);

        const [ingestResult, sseData] = await Promise.all([
          postJson(
            `${baseUrl}/api/device/ingest`,
            { "X-Device-Api-Key": testDeviceApiKey },
            { heartRate: 76, systolicBp: 118, diastolicBp: 78, spo2: 99, temperature: 36.8, source: "manual" },
          ),
          waitForEvent(second.events, "vitals", TIMEOUT_MS),
        ]);

        assert.ok(
          ingestResult.ok,
          `Post-reconnect ingest failed: ${ingestResult.status} — ${JSON.stringify(ingestResult.body)}`,
        );
        const payload = sseData as Record<string, unknown>;
        assert.equal(payload.heartRate, 76, `Expected HR=76 after reconnect, got ${JSON.stringify(payload)}`);
      } finally {
        second.abort();
      }
    });
  },
);
