# SSE Live Vitals Smoke Test — Runbook

Confirms that live vital signs keep flowing to the dashboard after an API server restart or scale-out event that drops existing Server-Sent Events (SSE) connections.

---

## Background

The dashboard (`dashboard.tsx` and `patient-detail.tsx`) maintains persistent SSE connections to `/api/device/events`. When the API server restarts or a new instance replaces the old one, every open SSE connection is immediately dropped. Both pages implement **exponential-backoff auto-reconnect** (1 s → 2 s → 4 s → … → 30 s cap) so the dashboard recovers without a manual page refresh.

This runbook verifies that the full pipeline:

```
Mobile / device POST → /api/device/ingest → broadcastVitals() → SSE push → dashboard UI update
```

continues to work after a simulated or real connection drop.

---

## Automated Smoke Test

The script at `artifacts/api-server/scripts/smoke-test-sse.ts` exercises all seven steps programmatically:

| Step | What it tests |
|------|---------------|
| 1 | API server is reachable (`/api/health`) |
| 2 | `POST /api/device/ingest` returns 201 with a `vitalsId` |
| 3 | Opening the provider SSE channel returns a `connected` event |
| 4 | A second ingest POST causes the open SSE connection to receive a `vitals` event |
| 5 | Closing the SSE connection simulates a server drop |
| 6 | Re-opening the connection receives a new `connected` event (reconnect) |
| 7 | A third ingest POST after reconnect is still delivered via SSE (vitals flow unbroken) |

### Prerequisites

You need three values — all can be obtained from the running dashboard:

| Variable | Where to get it |
|----------|-----------------|
| `BASE_URL` | Production URL (e.g. `https://your-app.replit.app`) |
| `DEVICE_API_KEY` | Log in as a **patient** → Dashboard → Connect Device → Generate QR Code. Copy the UUID from the QR URL parameter `?apiKey=<uuid>` |
| `PROVIDER_JWT` | Log in as a **provider**, open browser DevTools Console, run: `localStorage.getItem('token')` |

### Run against production

```bash
BASE_URL=https://your-app.replit.app \
DEVICE_API_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx \
PROVIDER_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... \
pnpm --filter @workspace/api-server tsx scripts/smoke-test-sse.ts
```

### Run against local dev

```bash
BASE_URL=http://localhost:3001 \
DEVICE_API_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx \
PROVIDER_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... \
pnpm --filter @workspace/api-server tsx scripts/smoke-test-sse.ts
```

### Expected output (all passing)

```
╔══════════════════════════════════════════════════════════╗
║        PulseRPM — SSE Live Vitals Smoke Test             ║
╚══════════════════════════════════════════════════════════╝
  Target: https://your-app.replit.app
  Timeout per event: 10s

Step 1: Verify API server is reachable … PASS (status=ok)
Step 2: POST vitals to ingest endpoint … PASS (vitalsId=42)
Step 3: Open provider SSE channel → receive 'connected' event … PASS (data={"role":"provider"})
Step 4: POST vitals → SSE channel delivers 'vitals' event to open connection … PASS (vitalsId=43, HR=88)
Step 5: Simulate SSE drop → close connection, wait 1500ms … PASS (connection closed (simulates server restart / scale-in dropping SSE))
Step 6: Re-open SSE channel after drop → receive 'connected' event (reconnect) … PASS (data={"role":"provider"})
Step 7: POST vitals after reconnect → SSE delivers 'vitals' event on new connection … PASS (vitalsId=44, HR=76)

────────────────────────────────────────────────────────────
✓ All 7 steps passed — SSE pipeline is healthy.
────────────────────────────────────────────────────────────
```

---

## Manual Browser Verification

Use this to visually confirm the dashboard auto-reconnects after a forced drop.

### 1 — Open the dashboard and watch for the live indicator

1. Log in as a provider at `https://your-app.replit.app`.
2. Navigate to any patient's detail page.
3. On the **Overview** tab, look for the **"Live"** badge (green pulsing dot) next to "Latest Readings". If it shows "Auto-refreshing" instead, SSE is not yet connected.

### 2 — Simulate a drop from the browser

Open DevTools → Console and paste:

```javascript
// Force-close every open EventSource on the page (simulates a server drop)
window.__sseTest = new EventSource(
  window.location.origin + '/api/device/events?token=' + localStorage.getItem('token')
);
window.__sseTest.close();
```

The "Live" badge will briefly disappear and show "Auto-refreshing".

### 3 — Watch the auto-reconnect

Within **1–2 seconds** (first backoff interval) the badge should return to "Live" without a page refresh. If it takes longer, check the browser console for SSE reconnect log entries.

### 4 — Confirm vitals flow after reconnect

In a second terminal (or another browser tab), POST a test vital:

```bash
curl -X POST https://your-app.replit.app/api/device/ingest \
  -H "Content-Type: application/json" \
  -H "X-Device-Api-Key: <DEVICE_API_KEY>" \
  -d '{"heartRate": 95, "systolicBp": 125, "diastolicBp": 82, "spo2": 97}'
```

The dashboard should update immediately — the vitals cards refresh and the "Last updated" timestamp changes to "just now".

---

## Simulating a Real Server Restart (Production)

> This requires deployment access.

1. Open the production dashboard in one browser tab.
2. Note the current vitals and the "Live" / "Last updated" timestamp.
3. In the Replit deployment panel, **restart** the API Server deployment.
4. The dashboard will briefly lose SSE (badge drops to "Auto-refreshing").
5. Within the first backoff window (≤ 30 s) the badge returns to "Live".
6. POST a new ingest request (via the mobile app or `curl`) and confirm the dashboard updates.

---

## What the Code Does

### Dashboard (`artifacts/rpm-dashboard/src/pages/dashboard.tsx` lines 307–353)

```
connect()
  → new EventSource(url)
  → on "connected": reset retryCount, set sseActive=true
  → on "vitals":    queryClient.invalidateQueries(), update lastRefresh
  → on error:
      close EventSource
      delay = min(1000 * 2^retryCount, 30000)
      setTimeout(connect, delay)   ← exponential backoff
```

### Patient Detail (`artifacts/rpm-dashboard/src/pages/patient-detail.tsx` lines 82–128)

Identical backoff logic. Displays a "Live" badge when `sseConnected=true`.

### Server (`artifacts/api-server/src/lib/deviceSSE.ts`)

In-memory subscriber sets. A server restart clears all sets — clients reconnect and re-register automatically via the backoff logic above.

---

## Autoscale Caveat

Because SSE state is stored **in-memory** per instance (`deviceSSE.ts`), a new instance that starts alongside an existing one will not hold any SSE connections until clients reconnect to it. The auto-reconnect logic in the dashboard handles this: after any connection drop the client re-establishes the SSE stream against whatever instance responds — which may be the new instance.

If the deployment ever scales to **multiple concurrent instances behind a load balancer**, vitals ingested by one instance will only broadcast to SSE clients connected to *that* instance. This is a known limitation; a Redis pub/sub adapter would be needed to fan out across instances. Document this as acceptable for single-instance deployments.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Step 1 fails (`/api/healthz`) | Wrong `BASE_URL` or server down | Verify the URL and that the API Server workflow is running |
| Step 2 fails with 401 | Invalid `DEVICE_API_KEY` | Re-generate the key from the patient dashboard |
| Step 3 fails with 401 | Expired or wrong `PROVIDER_JWT` | Re-copy the token from `localStorage.getItem('token')` |
| Step 3 times out | SSE endpoint not reachable through proxy | Check that `X-Accel-Buffering: no` is set; confirm the proxy allows streaming |
| Step 4 times out | Broadcast not reaching provider channel | Check `deviceSSE.ts` `broadcastVitals` and that `subscribeProvider` was called |
| Dashboard never shows "Live" | Token expired or SSE blocked by proxy | Hard-refresh, re-login, or check proxy buffering settings |
