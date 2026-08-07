/**
 * In-memory SSE subscriber registry.
 *
 * Companion apps POST vitals → ingest endpoint → broadcastVitals()
 * Dashboard tabs subscribe via GET /api/device/events:
 *   - Patients:  receive events for their own patientId
 *   - Providers: receive events for ALL patients (global channel)
 */
import type { Response } from "express";

/** Patient-specific SSE connections: patientId → set of responses */
const patientSubscribers = new Map<number, Set<Response>>();

/** Provider-wide SSE connections — receive every vitals broadcast */
const providerSubscribers = new Set<Response>();

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

/** Push a named SSE event to every dashboard tab watching this patient. */
export function broadcastVitals(
  patientId: number,
  data: Record<string, unknown>,
): void {
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
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────

/** Number of active SSE connections (for health checks). */
export function activeConnections(): number {
  let n = providerSubscribers.size;
  for (const subs of patientSubscribers.values()) n += subs.size;
  return n;
}
