/**
 * useRealtimeSync — bulletproof SSE hook for the PulseRPM dashboard.
 *
 * Prevents the dashboard from ever freezing by handling every failure mode:
 *
 *  1. Fast reconnect   — 0 ms on first failure, then 500 ms → 1 s → 2 s → 5 s max.
 *                        Never the slow 1 s → 30 s exponential backoff.
 *  2. Heartbeat watchdog — server sends an SSE comment every 25 s.
 *                        If the client sees nothing for 35 s it forces a reconnect,
 *                        catching silently dead connections that never fire onerror.
 *  3. Tab visibility   — reconnects the moment the user switches back to the tab
 *                        (browser can throttle or drop SSE in hidden tabs).
 *  4. Network online   — reconnects when the network comes back after going offline.
 *  5. Missed-event catch-up — on every successful reconnect, fires onReconnect()
 *                        so callers can invalidate queries and fetch anything they
 *                        might have missed while the stream was down.
 *
 * Callbacks (onVitals, onReconnect, setConnected) are always accessed via refs so
 * the effect only runs when userId changes — no spurious reconnects on re-renders.
 */

import { useEffect, useRef } from "react";
import { getAuthToken } from "@/lib/utils";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/** Reconnect delays (ms): immediate, then fast backoff, capped at 5 s */
const BACKOFF_MS = [0, 500, 1_000, 2_000, 5_000];

/**
 * How long to wait without any SSE traffic (vitals or server heartbeat)
 * before declaring the connection silently dead and forcing a reconnect.
 * Server heartbeats arrive every 25 s, so 35 s gives a 10 s grace window.
 */
const HEARTBEAT_TIMEOUT_MS = 35_000;

interface Options {
  /**
   * Stable identity for the current user.
   * The SSE effect re-connects only when this changes.
   */
  userId: number | undefined;
  /**
   * Called with the JSON-parsed vitals payload every time a `vitals` SSE event
   * arrives. The caller applies data directly to the React Query cache.
   */
  onVitals: (data: Record<string, unknown>) => void;
  /**
   * Called after every successful SSE reconnect (including the first connection).
   * Use this to invalidate queries so any data missed while the stream was down
   * is fetched immediately.
   */
  onReconnect?: () => void;
  /** Called whenever the SSE connection status changes. */
  setConnected?: (connected: boolean) => void;
}

export function useRealtimeSync({
  userId,
  onVitals,
  onReconnect,
  setConnected = () => {},
}: Options): void {
  // Stable refs so the effect never needs to re-run due to callback identity changes
  const onVitalsRef    = useRef(onVitals);
  const onReconnectRef = useRef(onReconnect);
  const setConnectedRef = useRef(setConnected);

  // Keep refs in sync with latest prop values on every render
  onVitalsRef.current    = onVitals;
  onReconnectRef.current = onReconnect;
  setConnectedRef.current = setConnected;

  useEffect(() => {
    if (!userId) return;

    let retryCount    = 0;
    let retryTimer:    ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
    let unmounted     = false;
    let currentEs:    EventSource | null = null;

    // ── Heartbeat watchdog ────────────────────────────────────────────────────
    function resetHeartbeat() {
      if (heartbeatTimer) clearTimeout(heartbeatTimer);
      heartbeatTimer = setTimeout(() => {
        // Silence for 35 s: connection is silently dead → reconnect immediately
        currentEs?.close();
        currentEs = null;
        setConnectedRef.current(false);
        scheduleConnect(0); // bypass backoff — this is a silent drop, not a crash
      }, HEARTBEAT_TIMEOUT_MS);
    }

    function clearHeartbeat() {
      if (heartbeatTimer) { clearTimeout(heartbeatTimer); heartbeatTimer = null; }
    }

    // ── Retry scheduler ───────────────────────────────────────────────────────
    function scheduleConnect(delayMs: number) {
      if (unmounted) return;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(doConnect, delayMs);
    }

    // ── Core SSE connect ─────────────────────────────────────────────────────
    function doConnect() {
      if (unmounted) return;
      const token = getAuthToken();
      if (!token) return;

      // Close any existing connection before opening a new one
      currentEs?.close();
      currentEs = null;

      const url = `${API_BASE}/api/device/events?token=${encodeURIComponent(token)}`;
      const es = new EventSource(url);
      currentEs = es;

      es.addEventListener("connected", () => {
        if (unmounted || es !== currentEs) return;
        retryCount = 0;
        setConnectedRef.current(true);
        resetHeartbeat();
        // Fetch anything missed while the stream was down
        onReconnectRef.current?.();
      });

      es.addEventListener("vitals", (e: MessageEvent) => {
        if (unmounted || es !== currentEs) return;
        resetHeartbeat(); // vitals count as proof-of-life
        try {
          onVitalsRef.current(JSON.parse(e.data) as Record<string, unknown>);
        } catch { /* malformed JSON — ignore */ }
      });

      es.onerror = () => {
        if (unmounted || es !== currentEs) return;
        setConnectedRef.current(false);
        es.close();
        currentEs = null;
        clearHeartbeat();

        const delay = BACKOFF_MS[Math.min(retryCount, BACKOFF_MS.length - 1)];
        retryCount  = Math.min(retryCount + 1, BACKOFF_MS.length - 1);
        scheduleConnect(delay);
      };
    }

    // ── Page visibility: reconnect when tab becomes active ────────────────────
    function onVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      // Reset backoff — user switching back to tab should be instant
      retryCount = 0;
      doConnect();
    }

    // ── Network: reconnect when we come back online ───────────────────────────
    function onOnline() {
      retryCount = 0;
      doConnect();
    }

    // ── Boot ─────────────────────────────────────────────────────────────────
    doConnect();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);

    return () => {
      unmounted = true;
      currentEs?.close();
      currentEs = null;
      if (retryTimer)    clearTimeout(retryTimer);
      clearHeartbeat();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
      setConnectedRef.current(false);
    };
  }, [userId]); // ← only reconnects when the logged-in user changes
}
