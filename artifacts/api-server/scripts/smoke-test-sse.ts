#!/usr/bin/env tsx
/**
 * SSE Smoke Test — Confirm live vitals flow end-to-end
 *
 * Tests the full path: device ingest → SSE broadcast → dashboard receives update.
 * Also simulates an SSE connection drop and verifies reconnect + fresh vitals delivery.
 *
 * Usage:
 *   BASE_URL=https://your-app.replit.app \
 *   DEVICE_API_KEY=<uuid> \
 *   PROVIDER_JWT=<token> \
 *   tsx artifacts/api-server/scripts/smoke-test-sse.ts
 *
 * Or against local dev:
 *   BASE_URL=http://localhost:3001 DEVICE_API_KEY=... PROVIDER_JWT=... tsx ...
 *
 * Required env vars:
 *   BASE_URL        — API server base URL (no trailing slash)
 *   DEVICE_API_KEY  — UUID device key for a patient account
 *   PROVIDER_JWT    — JWT for a provider account (from browser localStorage under 'token')
 *
 * Exit codes: 0 = all steps passed, 1 = one or more steps failed.
 */

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const DEVICE_API_KEY = process.env.DEVICE_API_KEY ?? "";
const PROVIDER_JWT = process.env.PROVIDER_JWT ?? "";

const TIMEOUT_MS = 10_000; // max wait per SSE event
const RECONNECT_DELAY_MS = 1_500; // time to wait after closing before re-opening

// ─── ANSI colours ────────────────────────────────────────────────────────────
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red   = (s: string) => `\x1b[31m${s}\x1b[0m`;
const cyan  = (s: string) => `\x1b[36m${s}\x1b[0m`;
const bold  = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim   = (s: string) => `\x1b[2m${s}\x1b[0m`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

let stepIdx = 0;
const results: { label: string; passed: boolean; detail?: string }[] = [];

function step(label: string) {
  stepIdx++;
  process.stdout.write(`\n${bold(`Step ${stepIdx}:`)} ${label} … `);
}

function pass(detail?: string) {
  results.push({ label: results.length === 0 ? "" : "", passed: true, detail });
  console.log(green("PASS") + (detail ? dim(` (${detail})`) : ""));
}

function fail(detail: string): never {
  results.push({ label: "", passed: false, detail });
  console.log(red("FAIL") + dim(` (${detail})`));
  printSummary();
  process.exit(1);
}

function printSummary() {
  const passed = results.filter(r => r.passed).length;
  const total  = results.length;
  console.log(`\n${"─".repeat(60)}`);
  if (passed === total) {
    console.log(bold(green(`✓ All ${total} steps passed — SSE pipeline is healthy.`)));
  } else {
    console.log(bold(red(`✗ ${total - passed} of ${total} steps failed.`)));
  }
  console.log("─".repeat(60));
}

/** POST vitals to the ingest endpoint; returns the parsed JSON body. */
async function ingestVitals(vitals: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE_URL}/api/device/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Device-Api-Key": DEVICE_API_KEY,
    },
    body: JSON.stringify(vitals),
  });
  const body = await res.json() as Record<string, unknown>;
  if (!res.ok) throw new Error(`Ingest failed ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

/**
 * Open an SSE stream and return a controller to read named events and abort.
 * Events are delivered via an AsyncGenerator.
 */
function openSseStream(token: string): {
  events: AsyncGenerator<{ name: string; data: unknown }>;
  abort: () => void;
} {
  const controller = new AbortController();
  const { signal } = controller;

  let resolveNext: ((v: IteratorResult<{ name: string; data: unknown }>) => void) | null = null;
  const queue: { name: string; data: unknown }[] = [];
  let done = false;
  let streamError: Error | null = null;

  // Start fetch in background
  (async () => {
    try {
      const res = await fetch(
        `${BASE_URL}/api/device/events?token=${encodeURIComponent(token)}`,
        {
          headers: { Accept: "text/event-stream" },
          signal,
        },
      );
      if (!res.ok || !res.body) {
        streamError = new Error(`SSE HTTP ${res.status}`);
        done = true;
        resolveNext?.({ value: undefined as any, done: true });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "message";
      let currentData = "";

      while (true) {
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
            // Dispatch event
            if (currentData || currentEvent !== "message") {
              let parsed: unknown = currentData;
              try { parsed = JSON.parse(currentData); } catch { /* keep string */ }
              const ev = { name: currentEvent, data: parsed };
              if (resolveNext) {
                const r = resolveNext;
                resolveNext = null;
                r({ value: ev, done: false });
              } else {
                queue.push(ev);
              }
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
      resolveNext?.({ value: undefined as any, done: true });
    }
  })();

  async function* generator(): AsyncGenerator<{ name: string; data: unknown }> {
    while (true) {
      if (queue.length > 0) {
        yield queue.shift()!;
      } else if (done) {
        if (streamError) throw streamError;
        return;
      } else {
        const event = await new Promise<IteratorResult<{ name: string; data: unknown }>>(
          (resolve) => { resolveNext = resolve; },
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
 * Wait for a specific named SSE event, with a timeout.
 * Returns the parsed data payload.
 */
async function waitForEvent(
  gen: AsyncGenerator<{ name: string; data: unknown }>,
  eventName: string,
  timeoutMs: number,
): Promise<unknown> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    const next = await Promise.race([
      gen.next(),
      new Promise<{ value: { name: string; data: unknown } | undefined; done: boolean }>(
        (_, reject) => setTimeout(() => reject(new Error(`Timed out waiting for SSE event "${eventName}"`)), remaining),
      ),
    ]);
    if (next.done) throw new Error(`SSE stream closed before "${eventName}" event`);
    if (next.value.name === eventName) return next.value.data;
  }
  throw new Error(`Timed out waiting for SSE event "${eventName}"`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(bold(cyan("\n╔══════════════════════════════════════════════════════════╗")));
  console.log(bold(cyan  ("║        PulseRPM — SSE Live Vitals Smoke Test             ║")));
  console.log(bold(cyan  ("╚══════════════════════════════════════════════════════════╝")));
  console.log(dim(`  Target: ${BASE_URL}`));
  console.log(dim(`  Timeout per event: ${TIMEOUT_MS / 1000}s`));

  // ── Pre-flight checks ──────────────────────────────────────────────────────
  if (!DEVICE_API_KEY) {
    console.error(red("\nERROR: DEVICE_API_KEY is not set."));
    console.error("  Generate one from the patient dashboard → Connect Device → Generate My QR Code,");
    console.error("  then copy the key from the QR URL or from the browser's network tab.");
    process.exit(1);
  }
  if (!PROVIDER_JWT) {
    console.error(red("\nERROR: PROVIDER_JWT is not set."));
    console.error("  Log in as a provider in the dashboard, then run in the browser console:");
    console.error("    localStorage.getItem('token')");
    process.exit(1);
  }

  // ── Step 1: Verify the API server is reachable ─────────────────────────────
  step("Verify API server is reachable");
  try {
    const res = await fetch(`${BASE_URL}/api/healthz`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json() as Record<string, unknown>;
    pass(`status=${body.status ?? "ok"}`);
  } catch (err) {
    fail(`API server unreachable: ${(err as Error).message}`);
  }

  // ── Step 2: Ingest baseline vitals ────────────────────────────────────────
  step("POST vitals to ingest endpoint");
  let firstVitalsId: number;
  try {
    const body = await ingestVitals({
      heartRate: 72,
      systolicBp: 120,
      diastolicBp: 80,
      spo2: 98,
      temperature: 36.6,
      source: "manual",
    });
    firstVitalsId = body.vitalsId as number;
    pass(`vitalsId=${firstVitalsId}`);
  } catch (err) {
    fail((err as Error).message);
  }

  // ── Step 3: Open provider SSE channel, expect "connected" event ───────────
  step("Open provider SSE channel → receive 'connected' event");
  let stream = openSseStream(PROVIDER_JWT);
  try {
    const data = await waitForEvent(stream.events, "connected", TIMEOUT_MS);
    pass(`data=${JSON.stringify(data)}`);
  } catch (err) {
    stream.abort();
    fail((err as Error).message);
  }

  // ── Step 4: Ingest vitals, expect "vitals" event on open channel ──────────
  step("POST vitals → SSE channel delivers 'vitals' event to open connection");
  let secondVitalsId: number;
  try {
    // Fire ingest; don't await before starting to race — ingest is fast but
    // we need to be listening before the broadcast fires.
    const [body, data] = await Promise.all([
      ingestVitals({
        heartRate: 88,
        systolicBp: 130,
        diastolicBp: 85,
        spo2: 97,
        temperature: 37.1,
        source: "manual",
      }),
      waitForEvent(stream.events, "vitals", TIMEOUT_MS),
    ]);
    secondVitalsId = body.vitalsId as number;
    const payload = data as Record<string, unknown>;
    pass(`vitalsId=${secondVitalsId}, HR=${payload.heartRate}`);
  } catch (err) {
    stream.abort();
    fail((err as Error).message);
  }

  // ── Step 5: Simulate SSE drop — close the connection ─────────────────────
  step(`Simulate SSE drop → close connection, wait ${RECONNECT_DELAY_MS}ms`);
  stream.abort();
  await new Promise(r => setTimeout(r, RECONNECT_DELAY_MS));
  pass("connection closed (simulates server restart / scale-in dropping SSE)");

  // ── Step 6: Reconnect — expect "connected" event ──────────────────────────
  step("Re-open SSE channel after drop → receive 'connected' event (reconnect)");
  stream = openSseStream(PROVIDER_JWT);
  try {
    const data = await waitForEvent(stream.events, "connected", TIMEOUT_MS);
    pass(`data=${JSON.stringify(data)}`);
  } catch (err) {
    stream.abort();
    fail((err as Error).message);
  }

  // ── Step 7: Ingest after reconnect — verify vitals still flow ─────────────
  step("POST vitals after reconnect → SSE delivers 'vitals' event on new connection");
  try {
    const [body, data] = await Promise.all([
      ingestVitals({
        heartRate: 76,
        systolicBp: 118,
        diastolicBp: 78,
        spo2: 99,
        temperature: 36.8,
        source: "manual",
      }),
      waitForEvent(stream.events, "vitals", TIMEOUT_MS),
    ]);
    const payload = data as Record<string, unknown>;
    pass(`vitalsId=${(body as any).vitalsId}, HR=${payload.heartRate}`);
  } catch (err) {
    stream.abort();
    fail((err as Error).message);
  }

  stream.abort();

  // ── Done ──────────────────────────────────────────────────────────────────
  printSummary();
  process.exit(0);
}

main().catch((err) => {
  console.error(red(`\nUnhandled error: ${err.message}`));
  process.exit(1);
});
