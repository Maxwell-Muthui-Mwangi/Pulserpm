/**
 * In-memory SSE subscriber registry.
 *
 * Companion apps POST vitals → ingest endpoint → broadcastVitals()
 * Dashboard tabs subscribe via GET /api/device/events → receive push events
 * immediately, no polling needed.
 */
import type { Response } from "express";

const subscribers = new Map<number, Set<Response>>();

/** Register a dashboard SSE connection for a patient; returns an unsubscribe fn. */
export function subscribe(patientId: number, res: Response): () => void {
  if (!subscribers.has(patientId)) subscribers.set(patientId, new Set());
  subscribers.get(patientId)!.add(res);
  return () => {
    const subs = subscribers.get(patientId);
    if (!subs) return;
    subs.delete(res);
    if (subs.size === 0) subscribers.delete(patientId);
  };
}

/** Push a named SSE event to every dashboard tab watching this patient. */
export function broadcastVitals(
  patientId: number,
  data: Record<string, unknown>,
): void {
  const subs = subscribers.get(patientId);
  if (!subs || subs.size === 0) return;
  const payload = `event: vitals\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of subs) {
    try {
      res.write(payload);
    } catch {
      // client already disconnected — will be cleaned up by its own close listener
    }
  }
}

/** Number of active SSE connections (for diagnostics). */
export function activeConnections(): number {
  let n = 0;
  for (const subs of subscribers.values()) n += subs.size;
  return n;
}
