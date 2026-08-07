/**
 * VitalsBus — pub/sub adapter between vitals ingestion and SSE fan-out.
 *
 * Decouples broadcastVitals() from the in-process SSE subscriber maps so that
 * a multi-instance deployment can use Redis Pub/Sub to cross-broadcast events.
 *
 * Active adapter is selected at startup:
 *   REDIS_URL set   → RedisVitalsBus  (cross-instance broadcast via Redis Pub/Sub)
 *   REDIS_URL unset → LocalVitalsBus  (in-process EventEmitter; single-host default)
 */

import { EventEmitter } from "events";
import Redis from "ioredis";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VitalsPayload {
  patientId: number;
  data: Record<string, unknown>;
}

export interface VitalsBus {
  /** Publish a vitals event; all instances' subscribers will receive it. */
  publish(patientId: number, data: Record<string, unknown>): void | Promise<void>;
  /** Register a handler called for every published event on this instance. */
  subscribe(handler: (payload: VitalsPayload) => void): () => void;
}

// ─── Payload validation ───────────────────────────────────────────────────────

/**
 * Guard against arbitrary JSON reaching SSE fan-out code.
 * A malformed Redis message (null, array, missing/non-numeric patientId, etc.)
 * must be discarded before it reaches the subscriber handler which destructures
 * the payload — an invalid shape would throw synchronously and crash the
 * Redis message callback, disrupting all live SSE connections on this instance.
 */
export function isValidVitalsPayload(value: unknown): value is VitalsPayload {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  if (!Number.isFinite(obj.patientId)) return false;
  if (obj.data === null || typeof obj.data !== "object" || Array.isArray(obj.data)) return false;
  return true;
}

// ─── Local (in-process) implementation ───────────────────────────────────────

export class LocalVitalsBus implements VitalsBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Suppress MaxListenersExceededWarning — one listener per SSE connection is expected.
    this.emitter.setMaxListeners(0);
  }

  publish(patientId: number, data: Record<string, unknown>): void {
    this.emitter.emit("vitals", { patientId, data } satisfies VitalsPayload);
  }

  subscribe(handler: (payload: VitalsPayload) => void): () => void {
    this.emitter.on("vitals", handler);
    return () => this.emitter.off("vitals", handler);
  }
}

// ─── Redis implementation ─────────────────────────────────────────────────────
//
// Uses two dedicated connections:
//   pub — issues PUBLISH commands (a subscribed connection cannot send PUBLISH)
//   sub — receives SUBSCRIBE messages and fans out to local handlers
//
// Both connections are configured to reconnect automatically.  The SSE flow
// degrades gracefully during a Redis outage: events stop until Redis recovers,
// but the process keeps serving HTTP requests (publish errors are handled by
// the fire-and-forget wrapper in broadcastVitals).

const REDIS_CHANNEL = "vitals:events";

export class RedisVitalsBus implements VitalsBus {
  private readonly pub: Redis;
  private readonly sub: Redis;
  private readonly emitter = new EventEmitter();

  /**
   * @param redisUrl   Redis connection URL (e.g. redis://host:6379)
   * @param retryStrategy  Optional override for ioredis retryStrategy. Defaults
   *   to exponential back-off up to 30 s. Pass `() => null` to disable retries
   *   (useful in tests).
   */
  constructor(
    redisUrl: string,
    retryStrategy?: (times: number) => number | null,
  ) {
    const opts = {
      retryStrategy: retryStrategy ?? ((times: number) => Math.min(times * 200, 30_000)),
      lazyConnect: false,
      enableReadyCheck: true,
    };

    this.pub = new Redis(redisUrl, opts);
    this.sub = new Redis(redisUrl, opts);

    this.emitter.setMaxListeners(0);

    this.pub.on("error", (err) =>
      console.error("[vitalsbus] Redis pub connection error:", err.message),
    );
    this.sub.on("error", (err) =>
      console.error("[vitalsbus] Redis sub connection error:", err.message),
    );
    this.pub.on("ready", () => console.info("[vitalsbus] Redis pub ready"));
    this.sub.on("ready", () => console.info("[vitalsbus] Redis sub ready"));

    this.sub.subscribe(REDIS_CHANNEL).catch((err) =>
      console.error("[vitalsbus] Redis SUBSCRIBE failed:", err.message),
    );

    this.sub.on("message", (_channel: string, message: string) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(message);
      } catch {
        console.error("[vitalsbus] Malformed Redis message (invalid JSON) — discarding");
        return;
      }
      if (!isValidVitalsPayload(parsed)) {
        console.error("[vitalsbus] Invalid payload shape — discarding:", message.slice(0, 200));
        return;
      }
      this.emitter.emit("vitals", parsed);
    });
  }

  async publish(patientId: number, data: Record<string, unknown>): Promise<void> {
    const message = JSON.stringify({ patientId, data } satisfies VitalsPayload);
    await this.pub.publish(REDIS_CHANNEL, message);
  }

  subscribe(handler: (payload: VitalsPayload) => void): () => void {
    this.emitter.on("vitals", handler);
    return () => this.emitter.off("vitals", handler);
  }

  /** Immediately sever both Redis connections (useful in tests and graceful shutdown). */
  disconnect(): void {
    this.pub.disconnect();
    this.sub.disconnect();
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

function createBus(): VitalsBus {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    console.info("[vitalsbus] Redis URL detected — using RedisVitalsBus (cross-instance broadcast)");
    return new RedisVitalsBus(redisUrl);
  }
  console.info("[vitalsbus] No REDIS_URL — using LocalVitalsBus (single-host in-process broadcast)");
  return new LocalVitalsBus();
}

export const vitalsBus: VitalsBus = createBus();
