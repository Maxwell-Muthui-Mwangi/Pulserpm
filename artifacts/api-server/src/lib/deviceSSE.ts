/**
 * SSE subscriber registry + vitals broadcast.
 *
 * Companion apps POST vitals → ingest endpoint → broadcastVitals()
 * Dashboard tabs subscribe via GET /api/device/events:
 *   - Patients:  receive events for their own patientId
 *   - Providers: receive events for ALL patients (global channel)
 *
 * Cross-instance delivery
 * ───────────────────────
 * broadcastVitals() publishes to VitalsBus rather than writing directly to the
 * in-process subscriber maps.  The bus fan-outs to every local SSE connection
 * on *this* instance.  When a Redis-backed VitalsBus is configured (see
 * vitalsbus.ts), the publish travels to every server instance so that clients
 * connected to instance B still receive vitals ingested by instance A.
 */

import type { Response } from "express";
import { vitalsBus } from "./vitalsbus.js";

// ─── Local SSE connection registries ─────────────────────────────────────────

/** Patient-specific SSE connections: patientId → set of responses */
const patientSubscribers = new Map<number, Set<Response>>();

/** Provider-wide SSE connections — receive every vitals broadcast */
const providerSubscribers = new Set<Response>();

// ─── Bus → SSE fan-out ────────────────────────────────────────────────────────
// A single bus subscription drives all local SSE writes.
// When multiple instances share a Redis bus each instance runs this handler
// independently, so every connected client — regardless of which instance they
// hit — receives the event.

vitalsBus.subscribe(({ patientId, data }) => {
  const payload = `event: vitals\ndata: ${JSON.stringify(data)}\n\n`;

  // Patient-specific subscribers
  const subs = patientSubscribers.get(patientId);
  if (subs) {
    for (const res of subs) {
      try { res.write(payload); } catch { /* client already disconnected */ }
    }
  }

  // All provider subscribers (global)
  for (const res of providerSubscribers) {
    try { res.write(payload); } catch { /* client already disconnected */ }
  }
});

// ─── Patient subscriptions ────────────────────────────────────────────────────

/** Register a patient-specific SSE connection; returns an unsubscribe fn. */
export function subscribePatient(patientId: number, res: Response): () => void {
  if (!patientSubscribers.has(patientId)) patientSubscribers.set(patientId, new Set());
  patientSubscribers.get(patientId)!.add(res);
  return () => {
    const subs = patientSubscribers.get(patientId);
    if (!subs) return;
    subs.delete(res);
    if (subs.size === 0) patientSubscribers.delete(patientId);
  };
}

// ─── Provider subscriptions ──────────────────────────────────────────────────

/** Register a provider SSE connection (global — all patients); returns an unsubscribe fn. */
export function subscribeProvider(res: Response): () => void {
  providerSubscribers.add(res);
  return () => providerSubscribers.delete(res);
}

// ─── Broadcast ───────────────────────────────────────────────────────────────

/**
 * Publish a vitals event to VitalsBus.
 * The bus delivers the event to every local SSE connection on this instance,
 * and — when a Redis bus is configured — to every other instance too.
 *
 * Publish is fire-and-forget from the ingest handler's perspective: failures
 * (e.g. Redis unavailable) are logged and swallowed so an SSE hiccup never
 * fails the HTTP 201 response or crashes the process via an unhandled rejection.
 */
export function broadcastVitals(
  patientId: number,
  data: Record<string, unknown>,
): void {
  void Promise.resolve(vitalsBus.publish(patientId, data)).catch((err) =>
    console.error(
      "[vitalsbus] publish error — SSE event dropped for patient",
      patientId,
      ":",
      (err as Error).message,
    ),
  );
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────

/** Number of active SSE connections on this instance (for health checks). */
export function activeConnections(): number {
  let n = providerSubscribers.size;
  for (const subs of patientSubscribers.values()) n += subs.size;
  return n;
}
