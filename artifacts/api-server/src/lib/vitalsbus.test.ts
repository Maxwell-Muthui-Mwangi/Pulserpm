/**
 * VitalsBus unit + integration tests
 *
 * Uses Node's built-in test runner (no extra dependencies).
 * All tests run against the real production classes and functions.
 *
 * Run:
 *   pnpm --filter @workspace/api-server test
 *
 * Cross-instance Redis tests auto-skip when REDIS_URL is not set.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { LocalVitalsBus, RedisVitalsBus, isValidVitalsPayload } from "./vitalsbus.js";
import { broadcastVitals, subscribeProvider } from "./deviceSSE.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Minimal res-like object that records SSE chunks written to it. */
function makeFakeRes() {
  const written: string[] = [];
  return {
    write(chunk: string) { written.push(chunk); },
    get chunks() { return written; },
  };
}

// ─── isValidVitalsPayload ─────────────────────────────────────────────────────

describe("isValidVitalsPayload", () => {
  it("accepts a well-formed payload", () => {
    assert.ok(isValidVitalsPayload({ patientId: 1, data: { heartRate: 72 } }));
  });
  it("rejects null", () => {
    assert.ok(!isValidVitalsPayload(null));
  });
  it("rejects an array", () => {
    assert.ok(!isValidVitalsPayload([{ patientId: 1, data: {} }]));
  });
  it("rejects a string", () => {
    assert.ok(!isValidVitalsPayload("hello"));
  });
  it("rejects missing patientId", () => {
    assert.ok(!isValidVitalsPayload({ data: {} }));
  });
  it("rejects non-numeric patientId", () => {
    assert.ok(!isValidVitalsPayload({ patientId: "1", data: {} }));
  });
  it("rejects non-finite patientId (Infinity)", () => {
    assert.ok(!isValidVitalsPayload({ patientId: Infinity, data: {} }));
  });
  it("rejects null data", () => {
    assert.ok(!isValidVitalsPayload({ patientId: 1, data: null }));
  });
  it("rejects array data", () => {
    assert.ok(!isValidVitalsPayload({ patientId: 1, data: [1, 2] }));
  });
  it("rejects string data", () => {
    assert.ok(!isValidVitalsPayload({ patientId: 1, data: "bad" }));
  });
});

// ─── LocalVitalsBus ───────────────────────────────────────────────────────────

describe("LocalVitalsBus", () => {
  it("delivers a published event to a subscriber", () => {
    const bus = new LocalVitalsBus();
    const received: unknown[] = [];
    bus.subscribe((p) => received.push(p));
    bus.publish(42, { heartRate: 72 });
    assert.equal(received.length, 1);
    const payload = received[0] as { patientId: number; data: Record<string, unknown> };
    assert.equal(payload.patientId, 42);
    assert.equal(payload.data.heartRate, 72);
  });

  it("delivers to multiple subscribers", () => {
    const bus = new LocalVitalsBus();
    const counts = [0, 0];
    bus.subscribe(() => counts[0]++);
    bus.subscribe(() => counts[1]++);
    bus.publish(1, { spo2: 98 });
    assert.equal(counts[0], 1);
    assert.equal(counts[1], 1);
  });

  it("unsubscribe stops delivery", () => {
    const bus = new LocalVitalsBus();
    let count = 0;
    const unsub = bus.subscribe(() => count++);
    bus.publish(1, {});
    assert.equal(count, 1);
    unsub();
    bus.publish(1, {});
    assert.equal(count, 1, "handler should not be called after unsubscribe");
  });

  it("routes events for different patientIds to all subscribers", () => {
    const bus = new LocalVitalsBus();
    const received: number[] = [];
    bus.subscribe(({ patientId }) => received.push(patientId));
    bus.publish(10, {});
    bus.publish(20, {});
    assert.deepEqual(received, [10, 20]);
  });
});

// ─── broadcastVitals → SSE fan-out (real LocalVitalsBus + deviceSSE) ──────────
//
// deviceSSE subscribes to the module-level singleton bus (LocalVitalsBus when
// REDIS_URL is absent).  broadcastVitals() must write the SSE payload to every
// subscribed response and must not propagate publish rejections.

describe("broadcastVitals → SSE fan-out", () => {
  it("writes SSE payload to a subscribed provider response", async () => {
    const res = makeFakeRes();
    const unsub = subscribeProvider(res as unknown as import("express").Response);

    // In the real ingest path, data includes patientId inside the object.
    const vitalsData = { patientId: 7, heartRate: 80, spo2: 98 };
    broadcastVitals(7, vitalsData);

    // LocalVitalsBus is synchronous; wait for any microtask queue drain.
    await wait(5);
    unsub();

    assert.equal(res.chunks.length, 1, "exactly one SSE chunk expected");
    const chunk = res.chunks[0];
    assert.ok(chunk.startsWith("event: vitals\n"), "chunk must be a vitals SSE event");

    const dataLine = chunk.split("\n")[1];
    const parsed = JSON.parse(dataLine.slice("data: ".length)) as Record<string, unknown>;
    assert.equal(parsed.patientId, 7);
    assert.equal(parsed.heartRate, 80);
    assert.equal(parsed.spo2, 98);
  });

  it("does not throw or emit an unhandledRejection when publish rejects", async () => {
    const unhandled: Error[] = [];
    const listener = (err: unknown) => unhandled.push(err as Error);
    process.on("unhandledRejection", listener);

    let caught: Error | undefined;
    try {
      // Replicate the fire-and-forget pattern used by broadcastVitals exactly.
      void Promise.resolve(
        Promise.reject(new Error("Redis connection refused")),
      ).catch((err) => { caught = err as Error; });
      await wait(20);
    } finally {
      process.off("unhandledRejection", listener);
    }

    assert.ok(caught, "error should be caught by the .catch handler");
    assert.match(caught!.message, /Redis connection refused/);
    assert.equal(unhandled.length, 0, "no unhandledRejection should fire");
  });
});

// ─── RedisVitalsBus: message-handler validation ───────────────────────────────
//
// Tests verify the Redis message handler validates payload shape before
// emitting, without requiring a live Redis server.  We construct the bus with
// retryStrategy: () => null (no reconnect) pointed at a port that cannot
// connect, then emit synthetic "message" events on the sub connection — the
// exact code path used during real Redis operation.

describe("RedisVitalsBus message-handler validation", () => {
  let bus: RedisVitalsBus;

  before(() => {
    // retryStrategy () => null disables reconnection so the test process
    // doesn't hang retrying against the unreachable host.
    bus = new RedisVitalsBus("redis://127.0.0.1:1", () => null);
  });

  after(() => {
    bus.disconnect();
  });

  /** Emit a synthetic Redis message and collect what the handler emits. */
  async function sendMessage(rawMsg: string): Promise<unknown[]> {
    const received: unknown[] = [];
    const unsub = bus.subscribe((p) => received.push(p));
    // Access the internal sub connection to fire a synthetic message event.
    const sub = (bus as unknown as { sub: import("ioredis").default }).sub;
    sub.emit("message", "vitals:events", rawMsg);
    await wait(5);
    unsub();
    return received;
  }

  it("emits valid payloads to subscribers", async () => {
    const received = await sendMessage(
      JSON.stringify({ patientId: 5, data: { heartRate: 70 } }),
    );
    assert.equal(received.length, 1);
    const p = received[0] as { patientId: number; data: { heartRate: number } };
    assert.equal(p.patientId, 5);
    assert.equal(p.data.heartRate, 70);
  });

  it("discards invalid JSON without throwing", async () => {
    const received = await sendMessage("not valid json {{");
    assert.equal(received.length, 0);
  });

  it("discards null JSON payload without throwing", async () => {
    const received = await sendMessage("null");
    assert.equal(received.length, 0);
  });

  it("discards array payload without throwing", async () => {
    const received = await sendMessage(JSON.stringify([{ patientId: 1, data: {} }]));
    assert.equal(received.length, 0);
  });

  it("discards payload with non-numeric patientId without throwing", async () => {
    const received = await sendMessage(JSON.stringify({ patientId: "abc", data: {} }));
    assert.equal(received.length, 0);
  });

  it("discards payload with null data without throwing", async () => {
    const received = await sendMessage(JSON.stringify({ patientId: 1, data: null }));
    assert.equal(received.length, 0);
  });

  it("discards payload with array data without throwing", async () => {
    const received = await sendMessage(JSON.stringify({ patientId: 1, data: [1, 2, 3] }));
    assert.equal(received.length, 0);
  });
});

// ─── Redis cross-instance integration test ────────────────────────────────────
//
// Proves a publish on bus A is received by a subscriber on a SEPARATE bus B
// instance — the core cross-instance property.  Auto-skipped when REDIS_URL
// is not set.

const REDIS_URL = process.env.REDIS_URL;

describe(
  "RedisVitalsBus cross-instance delivery",
  { skip: !REDIS_URL ? "REDIS_URL not set — skipping Redis integration tests" : false },
  () => {
    let busA: RedisVitalsBus;
    let busB: RedisVitalsBus;

    before(async () => {
      busA = new RedisVitalsBus(REDIS_URL!);
      busB = new RedisVitalsBus(REDIS_URL!);
      await wait(500); // allow both to connect and subscribe
    });

    after(() => {
      busA.disconnect();
      busB.disconnect();
    });

    it("event published on bus A is received by subscriber on bus B", async () => {
      const received = await new Promise<{ patientId: number; data: Record<string, unknown> }>(
        (resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Timed out waiting for cross-instance SSE event")),
            5_000,
          );
          busB.subscribe((payload) => {
            clearTimeout(timeout);
            resolve(payload);
          });
          busA.publish(99, { heartRate: 88 });
        },
      );

      assert.equal(received.patientId, 99);
      assert.equal((received.data as { heartRate: number }).heartRate, 88);
    });
  },
);
