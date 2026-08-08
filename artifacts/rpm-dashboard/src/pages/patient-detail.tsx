import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { QRCodeSVG } from "qrcode.react";
import Layout from "@/components/layout";
import { 
  useGetPatient, 
  useGetPatientVitals, 
  useGetPatientAlerts,
  useGetPatientThresholds,
  useUpdatePatientThresholds,
  useAcknowledgeAlert,
  useResolveAlert,
  getGetPatientQueryKey,
  getGetPatientVitalsQueryKey,
  getGetPatientAlertsQueryKey,
  getGetDashboardStatsQueryKey,
} from "@workspace/api-client-react";
import { useRealtimeSync } from "@/lib/use-realtime-sync";
import { withAuth, getAuthToken } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow } from "date-fns";
import { 
  Heart, Activity, Droplets, Thermometer, ArrowLeft, Settings, Bell, 
  CheckCircle2, XCircle, Loader2, Smartphone, Copy, RefreshCw, Trash2,
  Wifi, Apple, Watch, Printer, WifiOff
} from "lucide-react";
import { Link } from "wouter";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  ResponsiveContainer, ReferenceLine 
} from "recharts";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// Threshold after which a wearable device is considered to have a data gap.
// Must stay in sync with the same constant in patients.tsx.
const DATA_GAP_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

// Threshold after which ANY patient's vitals are considered stale and the UI
// degrades to warn the provider that data may no longer reflect reality.
const STALE_VITALS_MS = 60 * 60 * 1000; // 60 minutes

export default function PatientDetail() {
  const [, params] = useRoute("/patients/:id");
  const patientId = parseInt(params?.id || "0", 10);
  const { toast } = useToast();
  const { isPatient } = useAuth();
  
  const urlTab = new URLSearchParams(window.location.search).get("tab") as "overview" | "charts" | "thresholds" | "device" | null;
  const defaultTab = (isPatient && urlTab) ? urlTab : "overview";
  const [activeTab, setActiveTab] = useState<"overview" | "charts" | "thresholds" | "device">(defaultTab);
  const [period, setPeriod] = useState<"day" | "week" | "month">("day");

  const [deviceApiKey, setDeviceApiKey] = useState<string | null>(null);
  const [deviceLoading, setDeviceLoading] = useState(false);
  // Starts true when the tab loads so we never flash "No QR code yet" while fetching
  const [keyLoading, setKeyLoading] = useState(defaultTab === "device");
  // Briefly true after Regenerate so the patient knows to scan the new QR immediately
  const [justRegenerated, setJustRegenerated] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  // Tracks the last time any SSE vital event arrived (backlog or live).
  // SSE fires on every ingest so this is a reliable device-is-communicating signal.
  // Persisted in sessionStorage so a page refresh doesn't reset it to null and
  // flash STALE before the SSE stream reconnects (~1-3 s after load).
  const [sseLastEventAt, setSseLastEventAt] = useState<Date | null>(() => {
    try {
      const stored = sessionStorage.getItem("pulserpm_sseLastEventAt");
      if (stored) {
        const d = new Date(stored);
        if (!isNaN(d.getTime()) && Date.now() - d.getTime() < STALE_VITALS_MS) return d;
      }
    } catch { /* SSR / incognito — ignore */ }
    return null;
  });
  const [now, setNow] = useState(() => new Date());
  const queryClient = useQueryClient();

  // Tick every 30 s so "Last synced X ago" stays current without a data refetch
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const { data: patient, isLoading: pLoading } = useGetPatient(patientId, { request: withAuth(), query: { enabled: !!patientId, refetchInterval: 5_000, refetchIntervalInBackground: true } as any });
  const { data: vitals, isLoading: vLoading } = useGetPatientVitals(patientId, { period, limit: 100 }, { request: withAuth(), query: { enabled: !!patientId && activeTab === "charts", refetchInterval: activeTab === "charts" ? 5_000 : false, refetchIntervalInBackground: true } as any });
  const { data: alerts, refetch: refetchAlerts } = useGetPatientAlerts(patientId, { status: "active" }, { request: withAuth(), query: { enabled: !!patientId, refetchInterval: 5_000, refetchIntervalInBackground: true } as any });
  const { data: thresholds } = useGetPatientThresholds(patientId, { request: withAuth(), query: { enabled: !!patientId && activeTab === "thresholds" } as any });
  
  const updateThresholds = useUpdatePatientThresholds();
  const ackAlert = useAcknowledgeAlert();
  const resAlert = useResolveAlert();

  // ── Liveness signal cascade ────────────────────────────────────────────────
  // Each level proves the device is connected with decreasing certainty:
  //  1. receivedAt      = server DB insertion time — always NOW when data arrives
  //  2. sseLastEventAt  = last SSE vital event in this session (survives refresh
  //                       via sessionStorage) — fires on every ingest incl. backlog
  //  3. latestAlertAt   = most recent alert triggeredAt — alerts can ONLY be created
  //                       when new vitals arrive, so a fresh alert proves data flow
  //  4. recordedAt      = device-reported timestamp — last resort; may be stale if
  //                       the device batches readings with old timestamps
  const effectiveSyncAt: Date | null = (() => {
    const rv = patient?.latestVitals?.receivedAt;
    if (rv) return new Date(rv);
    if (sseLastEventAt) return sseLastEventAt;
    const alertsList = Array.isArray(alerts) ? alerts : ((alerts as any)?.data ?? []);
    const latestAlertTs = (alertsList[0] as any)?.triggeredAt ?? null;
    if (latestAlertTs) {
      const alertDate = new Date(latestAlertTs);
      const ra2 = patient?.latestVitals?.recordedAt ? new Date(patient.latestVitals.recordedAt) : new Date(0);
      if (alertDate > ra2) return alertDate;
    }
    const ra = patient?.latestVitals?.recordedAt;
    if (ra) return new Date(ra);
    return null;
  })();

  // ── Single source of truth for device activity ────────────────────────────
  // True when we have strong evidence the device is actively communicating.
  // ALL STALE badges, offline banners, and data-gap warnings read from this one
  // boolean — so nothing disagrees and the logic stays in one place.
  const isDeviceActive = (() => {
    const recentCutoff = now.getTime() - STALE_VITALS_MS; // 60 min ago
    // SSE event time is the strongest signal — updated on every ingest
    if (sseLastEventAt && sseLastEventAt.getTime() > recentCutoff) return true;
    // Any other liveness signal (receivedAt, alert, recordedAt) within threshold
    if (effectiveSyncAt && effectiveSyncAt.getTime() > recentCutoff) return true;
    return false;
  })();

  const fetchDeviceKey = useCallback(async () => {
    setKeyLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/device/key`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDeviceApiKey(data.apiKey || null);
      }
    } catch {
      // ignore — key stays null, patient can generate one
    } finally {
      setKeyLoading(false);
    }
  }, []);

  // Real-time SSE — bulletproof hook handles reconnect, heartbeat watchdog,
  // tab visibility, and network events so vitals never go stale.
  useRealtimeSync({
    userId: patientId,
    setConnected: setSseConnected,
    onVitals: (data) => {
      // Every SSE vital event (backlog or live) proves the device is communicating.
      // Persist to sessionStorage so a page refresh doesn't flash STALE mid-session.
      const sseEventTime = new Date();
      setSseLastEventAt(sseEventTime);
      try { sessionStorage.setItem("pulserpm_sseLastEventAt", sseEventTime.toISOString()); } catch { /* incognito */ }
      // Optimistic cache patch — zero-latency UI update when cache is warm
      let cacheWasCold = false;
      queryClient.setQueryData(
        getGetPatientQueryKey(patientId),
        (old: Record<string, unknown> | undefined) => {
          if (!old) {
            // Cache is cold (page still loading or evicted) — flag for refetch below
            cacheWasCold = true;
            return old;
          }
          const prev = (old.latestVitals ?? {}) as Record<string, unknown>;
          const patch: Record<string, unknown> = {};

          // receivedAt = server receipt time — always update so "last synced"
          // stays current even when the device sends backlogged old-timestamped data.
          if (data.receivedAt) patch.receivedAt = data.receivedAt;

          // For backlogged readings (device timestamp >2 h behind server receipt),
          // skip patching vital values and recordedAt — the cache already holds a
          // more recent live reading and we don't want historical data to overwrite it.
          if (!data.isBacklog) {
            if (data.heartRate      != null) patch.heartRate      = data.heartRate;
            if (data.systolicBp     != null) patch.systolicBp     = data.systolicBp;
            if (data.diastolicBp    != null) patch.diastolicBp    = data.diastolicBp;
            if (data.spo2           != null) patch.spo2           = data.spo2;
            if (data.temperature    != null) patch.temperature    = data.temperature;
            if (data.caloriesBurned != null) patch.caloriesBurned = data.caloriesBurned;
            if (data.recordedAt)             patch.recordedAt     = data.recordedAt;
          }
          return { ...old, latestVitals: { ...prev, ...patch } };
        },
      );
      // Always invalidate the patient query — if cache was warm this is a
      // background sync to confirm accuracy; if cold it's the primary fetch trigger.
      void queryClient.invalidateQueries({ queryKey: getGetPatientQueryKey(patientId) });
      // Targeted refetch for data NOT in the SSE payload (alerts, chart history)
      void queryClient.invalidateQueries({ queryKey: getGetPatientAlertsQueryKey(patientId) });
      void queryClient.invalidateQueries({ queryKey: getGetPatientVitalsQueryKey(patientId) });
      void queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
      // Suppress unused-variable lint warning — cacheWasCold is used for documentation
      void cacheWasCold;
    },
    onReconnect: () => {
      // Connection (re)established — immediately refetch everything to catch up
      // on any vitals posted while the stream was down.
      void queryClient.invalidateQueries({ queryKey: getGetPatientQueryKey(patientId) });
      void queryClient.invalidateQueries({ queryKey: getGetPatientAlertsQueryKey(patientId) });
      void queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
      void queryClient.invalidateQueries(); // sweep remaining queries
    },
  });

  useEffect(() => {
    if (activeTab === "device" && isPatient) {
      fetchDeviceKey();
    }
  }, [activeTab, isPatient, fetchDeviceKey]);

  const handleGenerateKey = async () => {
    const isRegenerate = !!deviceApiKey; // true when replacing an existing key
    setDeviceLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/device/generate-key`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getAuthToken()}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDeviceApiKey(data.apiKey);
        if (isRegenerate) {
          // Flash the "scan now" banner for 60 s so the patient doesn't miss it
          setJustRegenerated(true);
          setTimeout(() => setJustRegenerated(false), 60_000);
          toast({
            title: "New QR code ready",
            description: "Your app shows 'Link Expired' — scan the new QR code below to reconnect.",
          });
        } else {
          toast({ title: "QR code generated", description: "Scan it with the PulseRPM app to connect your device." });
        }
      } else {
        toast({ title: "Failed to generate key", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to generate key", variant: "destructive" });
    } finally {
      setDeviceLoading(false);
    }
  };

  const handleRevokeKey = async () => {
    setDeviceLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/device/key`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getAuthToken()}` }
      });
      if (res.ok) {
        setDeviceApiKey(null);
        toast({ title: "Device key revoked" });
      }
    } catch {
      toast({ title: "Failed to revoke key", variant: "destructive" });
    } finally {
      setDeviceLoading(false);
    }
  };

  const handleCopyKey = () => {
    if (deviceApiKey) {
      navigator.clipboard.writeText(deviceApiKey);
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 2000);
    }
  };

  const handlePrint = async () => {
    if (!patient) return;
    setPrinting(true);
    try {
      const vitalsRes = await fetch(
        `${API_BASE}/api/patients/${patientId}/vitals?period=week&limit=200`,
        { headers: { Authorization: `Bearer ${getAuthToken()}` } }
      );
      const weekVitals: Array<{
        recordedAt?: string;
        heartRate?: number;
        systolicBp?: number;
        diastolicBp?: number;
        spo2?: number;
        temperature?: number;
        source?: string;
      }> = vitalsRes.ok ? await vitalsRes.json() : [];

      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const W = 210;
      const MARGIN = 15;
      const contentWidth = W - MARGIN * 2;
      let y = 0;

      // ── Blue header bar ──
      doc.setFillColor(37, 99, 235);
      doc.rect(0, 0, W, 32, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont("helvetica", "bold");
      doc.text("PulseRPM", MARGIN, 14);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text("Remote Patient Monitoring — Health Report", MARGIN, 22);
      doc.setFontSize(8);
      doc.text(`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}`, W - MARGIN, 22, { align: "right" });

      y = 42;

      // ── Patient demographics ──
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(patient.name, MARGIN, y); y += 7;

      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      const demo = [`ID: ${patient.id}`, `Age: ${patient.age}`, `Gender: ${patient.gender}`, `DOB: ${patient.dateOfBirth}`].join("   •   ");
      doc.text(demo, MARGIN, y); y += 5;
      if (patient.email) { doc.text(`Email: ${patient.email}`, MARGIN, y); y += 5; }
      if (patient.conditions?.length) {
        doc.text(`Conditions: ${patient.conditions.join(", ")}`, MARGIN, y); y += 5;
      }
      const riskColors: Record<string, [number, number, number]> = { critical: [220, 38, 38], warning: [217, 119, 6], normal: [22, 163, 74] };
      const rc = riskColors[patient.riskLevel ?? "normal"] ?? [22, 163, 74];
      doc.setTextColor(...rc);
      doc.setFont("helvetica", "bold");
      doc.text(`Risk Level: ${(patient.riskLevel ?? "normal").toUpperCase()}`, MARGIN, y); y += 5;

      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.line(MARGIN, y + 2, W - MARGIN, y + 2); y += 10;

      // ── Latest Readings ──
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("LATEST READINGS", MARGIN, y); y += 7;

      const boxW = (contentWidth - 9) / 4;
      const readingBoxes = [
        { label: "Heart Rate", value: patient.latestVitals?.heartRate ? `${patient.latestVitals.heartRate} bpm` : "—", accent: [239, 68, 68] as [number, number, number] },
        { label: "Blood Pressure", value: patient.latestVitals?.systolicBp ? `${patient.latestVitals.systolicBp}/${patient.latestVitals.diastolicBp} mmHg` : "—", accent: [59, 130, 246] as [number, number, number] },
        { label: "SpO\u2082", value: patient.latestVitals?.spo2 ? `${patient.latestVitals.spo2} %` : "—", accent: [6, 182, 212] as [number, number, number] },
        { label: "Temperature", value: patient.latestVitals?.temperature ? `${patient.latestVitals.temperature} \u00b0C` : "—", accent: [245, 158, 11] as [number, number, number] },
      ];
      readingBoxes.forEach((box, i) => {
        const bx = MARGIN + i * (boxW + 3);
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.roundedRect(bx, y, boxW, 22, 2, 2, "FD");
        doc.setFillColor(...box.accent);
        doc.roundedRect(bx, y, boxW, 3.5, 1, 1, "F");
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.text(box.label, bx + boxW / 2, y + 11, { align: "center" });
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(9.5);
        doc.setFont("helvetica", "bold");
        doc.text(box.value, bx + boxW / 2, y + 18, { align: "center" });
      });
      y += 30;

      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.line(MARGIN, y, W - MARGIN, y); y += 8;

      // ── Vitals History ──
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("VITALS HISTORY — PAST 7 DAYS", MARGIN, y); y += 7;

      if (weekVitals.length === 0) {
        doc.setFontSize(8.5);
        doc.setFont("helvetica", "italic");
        doc.setTextColor(100, 116, 139);
        doc.text("No vitals recorded in the past 7 days.", MARGIN, y); y += 8;
      } else {
        const cols = [
          { header: "Date & Time", w: 38 },
          { header: "Heart Rate", w: 24 },
          { header: "BP (sys/dia)", w: 30 },
          { header: "SpO\u2082 %", w: 20 },
          { header: "Temp \u00b0C", w: 20 },
          { header: "Source", w: contentWidth - 38 - 24 - 30 - 20 - 20 },
        ];

        // Header row
        doc.setFillColor(37, 99, 235);
        doc.rect(MARGIN, y, contentWidth, 7, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        let cx = MARGIN + 2;
        cols.forEach((c) => { doc.text(c.header, cx, y + 5); cx += c.w; });
        y += 7;

        const sorted = [...weekVitals].reverse();
        sorted.forEach((v, idx) => {
          if (y > 272) {
            doc.addPage(); y = 20;
            doc.setFillColor(37, 99, 235);
            doc.rect(MARGIN, y, contentWidth, 7, "F");
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(7.5);
            doc.setFont("helvetica", "bold");
            cx = MARGIN + 2;
            cols.forEach((c) => { doc.text(c.header, cx, y + 5); cx += c.w; });
            y += 7;
          }
          const bg: [number, number, number] = idx % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
          doc.setFillColor(...bg);
          doc.setDrawColor(226, 232, 240);
          doc.setLineWidth(0.15);
          doc.rect(MARGIN, y, contentWidth, 6, "FD");

          const d = v.recordedAt ? new Date(v.recordedAt) : null;
          const vals = [
            d && !isNaN(d.getTime()) ? format(d, "dd MMM yyyy HH:mm") : "—",
            v.heartRate ? `${v.heartRate} bpm` : "—",
            v.systolicBp ? `${v.systolicBp}/${v.diastolicBp}` : "—",
            v.spo2 ? `${v.spo2}%` : "—",
            v.temperature ? `${v.temperature}\u00b0C` : "—",
            (v.source ?? "manual").replace(/_/g, " "),
          ];
          doc.setTextColor(30, 41, 59);
          doc.setFontSize(7);
          doc.setFont("helvetica", "normal");
          cx = MARGIN + 2;
          cols.forEach((c, ci) => { doc.text(vals[ci], cx, y + 4.3); cx += c.w; });
          y += 6;
        });
      }

      // ── Footer on every page ──
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        doc.setFillColor(241, 245, 249);
        doc.rect(0, 285, W, 12, "F");
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.setFont("helvetica", "normal");
        doc.text("PulseRPM — Confidential Patient Health Report", MARGIN, 291);
        doc.text(`Page ${p} of ${pageCount}`, W - MARGIN, 291, { align: "right" });
      }

      const fileName = `PulseRPM_${patient.name.replace(/\s+/g, "_")}_${format(new Date(), "yyyy-MM-dd")}.pdf`;
      doc.save(fileName);
      toast({ title: "Report downloaded", description: fileName });
    } catch (err) {
      console.error(err);
      toast({ title: "Failed to generate report", variant: "destructive" });
    } finally {
      setPrinting(false);
    }
  };

  const handleAction = (action: 'ack' | 'resolve', alertId: number) => {
    const mutation = action === 'ack' ? ackAlert : resAlert;
    mutation.mutate({ alertId }, {
      onSuccess: () => {
        toast({ title: `Alert ${action === 'ack' ? 'acknowledged' : 'resolved'} successfully` });
        refetchAlerts();
      }
    });
  };

  const handleThresholdSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data: Record<string, number> = {};
    formData.forEach((val, key) => {
      if (val) data[key] = Number(val);
    });
    
    updateThresholds.mutate({ patientId, data }, {
      onSuccess: () => toast({ title: "Thresholds updated" }),
      onError: () => toast({ title: "Update failed", variant: "destructive" })
    });
  };

  if (pLoading) return <Layout><div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary h-8 w-8" /></div></Layout>;
  if (!patient) return <Layout><div className="text-center py-20">Patient not found</div></Layout>;

  const chartData = vitals?.map(v => {
    const date = v.recordedAt ? new Date(v.recordedAt) : null;
    const isValid = date && !isNaN(date.getTime());
    return {
      time: isValid ? format(date!, period === 'day' ? 'HH:mm' : 'MMM dd') : '—',
      hr: v.heartRate,
      sys: v.systolicBp,
      dia: v.diastolicBp,
      spo2: v.spo2
    };
  }).reverse() || [];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header Section */}
        <div className="flex items-center space-x-4 mb-2">
          <Button variant="ghost" size="icon" asChild className="rounded-full">
            <Link href={isPatient ? "/" : "/patients"}><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-display font-bold text-foreground flex items-center">
              {isPatient ? "My Health Profile" : patient.name}
              {patient.riskLevel === 'critical' && <Badge variant="critical" className="ml-3">Critical</Badge>}
              {patient.riskLevel === 'warning' && <Badge variant="amber" className="ml-3">{isPatient ? "Average" : "Warning"}</Badge>}
              {patient.riskLevel === 'normal' && <Badge variant="normal" className="ml-3">{isPatient ? "Good" : "Normal"}</Badge>}
            </h1>
            <p className="text-muted-foreground text-sm flex items-center mt-1">
              {isPatient ? patient.email : `ID: ${patient.id} • ${patient.gender} • ${patient.age} yrs • DOB: ${patient.dateOfBirth}`}
            </p>
          </div>
          {!isPatient && (
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              disabled={printing}
              className="gap-2 shrink-0"
            >
              {printing
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Printer className="h-4 w-4" />}
              {printing ? "Generating…" : "Print Report"}
            </Button>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-border/50 overflow-x-auto">
          <button 
            onClick={() => setActiveTab("overview")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === "overview" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {isPatient ? "My Vitals" : "Overview"}
          </button>
          <button 
            onClick={() => setActiveTab("charts")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === "charts" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            Vitals History
          </button>
          {!isPatient && (
            <button 
              onClick={() => setActiveTab("thresholds")}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === "thresholds" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              Alert Thresholds
            </button>
          )}
          {isPatient && (
            <button 
              onClick={() => setActiveTab("device")}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${activeTab === "device" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              <Smartphone className="h-4 w-4" /> Connect Device
            </button>
          )}
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <h3 className="font-display font-bold text-lg text-foreground flex items-center gap-2">
                Latest Readings
                {isDeviceActive ? (
                  <span className="flex items-center gap-1 text-xs font-normal text-success bg-success/10 border border-success/20 rounded-full px-2 py-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                    Live
                  </span>
                ) : sseConnected ? (
                  <span className="flex items-center gap-1 text-xs font-normal text-blue-500 bg-blue-500/10 border border-blue-500/20 rounded-full px-2 py-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                    Monitoring
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                    <RefreshCw className="h-3 w-3" />
                    Auto-refreshing
                  </span>
                )}
              </h3>
              {(() => {
                const syncedAt = effectiveSyncAt;
                const diffMs = syncedAt ? now.getTime() - syncedAt.getTime() : 0;
                // Suppress STALE on cards when device is actively communicating —
                // buffered old timestamps must not dim the display while data flows.
                const isStaleCards = !isDeviceActive && (syncedAt ? diffMs > STALE_VITALS_MS : false);
                return (
                  <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 transition-opacity duration-300 ${isStaleCards ? "opacity-50" : ""}`}>
                    <Card className="border-border/50 shadow-sm bg-gradient-to-br from-card to-card">
                      <CardContent className="p-4 flex flex-col justify-center items-center text-center">
                        <Heart className="h-6 w-6 text-rose-500 mb-2" />
                        <span className="text-xs text-muted-foreground font-semibold uppercase">Heart Rate</span>
                        <span className="text-2xl font-bold mt-1">{patient.latestVitals?.heartRate ?? '--'} <span className="text-sm font-normal text-muted-foreground">bpm</span></span>
                        {isStaleCards && <span className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 rounded-full px-1.5 py-0.5">Stale</span>}
                      </CardContent>
                    </Card>
                    <Card className="border-border/50 shadow-sm">
                      <CardContent className="p-4 flex flex-col justify-center items-center text-center">
                        <Activity className="h-6 w-6 text-blue-500 mb-2" />
                        <span className="text-xs text-muted-foreground font-semibold uppercase">Blood Pressure</span>
                        <span className="text-2xl font-bold mt-1">
                          {patient.latestVitals?.systolicBp ?? '--'}/{patient.latestVitals?.diastolicBp ?? '--'}
                          <span className="text-sm font-normal text-muted-foreground ml-1">mmHg</span>
                        </span>
                        {isStaleCards && <span className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 rounded-full px-1.5 py-0.5">Stale</span>}
                      </CardContent>
                    </Card>
                    <Card className="border-border/50 shadow-sm">
                      <CardContent className="p-4 flex flex-col justify-center items-center text-center">
                        <Droplets className="h-6 w-6 text-cyan-500 mb-2" />
                        <span className="text-xs text-muted-foreground font-semibold uppercase">SpO2</span>
                        <span className="text-2xl font-bold mt-1">{patient.latestVitals?.spo2 ?? '--'} <span className="text-sm font-normal text-muted-foreground">%</span></span>
                        {isStaleCards && <span className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 rounded-full px-1.5 py-0.5">Stale</span>}
                      </CardContent>
                    </Card>
                    <Card className="border-border/50 shadow-sm">
                      <CardContent className="p-4 flex flex-col justify-center items-center text-center">
                        <Thermometer className="h-6 w-6 text-amber-500 mb-2" />
                        <span className="text-xs text-muted-foreground font-semibold uppercase">Temperature</span>
                        <span className="text-2xl font-bold mt-1">{patient.latestVitals?.temperature ?? '--'} <span className="text-sm font-normal text-muted-foreground">°C</span></span>
                        {isStaleCards && <span className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 rounded-full px-1.5 py-0.5">Stale</span>}
                      </CardContent>
                    </Card>
                  </div>
                );
              })()}

              {/* Last synced timestamp — re-renders every 30 s via the `now` ticker */}
              {effectiveSyncAt ? (() => {
                const syncedAt = effectiveSyncAt;
                const diffMs = now.getTime() - syncedAt.getTime();
                const isRecent = diffMs < 5 * 60 * 1000; // < 5 minutes
                // Gate both banners on !isDeviceActive — SSE events arriving proves
                // the device is online even if the displayed timestamp looks old.
                const isStale = !isDeviceActive && diffMs > STALE_VITALS_MS;
                const isDataGap = !isDeviceActive && !isStale && patient.deviceType === "wearable" && diffMs > DATA_GAP_THRESHOLD_MS;
                const staleHours = diffMs / 3_600_000;
                const staleLabel = staleHours >= 1
                  ? `${Math.floor(staleHours)} hour${Math.floor(staleHours) !== 1 ? "s" : ""}`
                  : `${Math.round(diffMs / 60_000)} minutes`;
                return (
                  <>
                    {isStale && (
                      <div className="flex items-start gap-3 rounded-xl border border-orange-500/40 bg-orange-500/10 px-4 py-3 -mt-2">
                        <WifiOff className="h-4 w-4 text-orange-600 dark:text-orange-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-orange-700 dark:text-orange-400">
                            No sync in {staleLabel} — device may be offline
                          </p>
                          <p className="text-xs text-orange-600/80 dark:text-orange-400/70 mt-0.5">
                            The readings above are from the last successful sync and may no longer reflect the patient's current condition.
                          </p>
                        </div>
                      </div>
                    )}
                    {isDataGap && (
                      <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 -mt-2">
                        <WifiOff className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                            Data gap detected — no reading for {Math.round(diffMs / 60_000)} minutes
                          </p>
                          <p className="text-xs text-amber-600/80 dark:text-amber-400/70 mt-0.5">
                            The patient's device may be offline, battery-depleted, or suspended by the OS. Displayed values are from the last successful sync.
                          </p>
                        </div>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 -mt-2">
                      <span className={`h-1.5 w-1.5 rounded-full inline-block ${isDeviceActive || isRecent ? "bg-green-500 animate-pulse" : isStale ? "bg-orange-500" : isDataGap ? "bg-amber-500" : "bg-muted-foreground/50"}`} />
                      {isRecent
                        ? <span className="text-green-600 font-medium">Just synced</span>
                        : <>Last synced {formatDistanceToNow(syncedAt, { addSuffix: true })}</>
                      }
                      {" · "}{format(syncedAt, "MMM d 'at' h:mm a")}
                    </p>
                  </>
                );
              })() : (
                <p className="text-xs text-muted-foreground -mt-2">No readings recorded yet</p>
              )}

              <Card className="border-border/50 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Medical Profile</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    {!isPatient && (
                      <div>
                        <p className="text-sm text-muted-foreground">Email</p>
                        <p className="font-medium">{patient.email}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-sm text-muted-foreground">Device</p>
                      <p className="font-medium capitalize">{patient.deviceType?.replace('_', ' ') || 'None'}</p>
                    </div>
                    {isPatient && (
                      <div>
                        <p className="text-sm text-muted-foreground">Age</p>
                        <p className="font-medium">{patient.age} years old</p>
                      </div>
                    )}
                    <div className="col-span-2">
                      <p className="text-sm text-muted-foreground mb-1">Conditions</p>
                      <div className="flex gap-2 flex-wrap">
                        {patient.conditions?.map((c, i) => (
                          <Badge key={i} variant="secondary">{c}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Active Alerts Sidebar */}
            <div className="lg:col-span-1 space-y-4">
              <h3 className="font-display font-bold text-lg text-foreground flex items-center">
                <Bell className="h-5 w-5 mr-2 text-destructive" /> {isPatient ? "My Active Alerts" : "Active Alerts"}
                {alerts && alerts.length > 0 && (
                  <Badge variant="destructive" className="ml-auto rounded-full w-6 h-6 p-0 flex items-center justify-center">{alerts.length}</Badge>
                )}
              </h3>
              
              {alerts && alerts.length > 0 ? (
                <div className="space-y-3">
                  {alerts.map(alert => (
                    <Card key={alert.id} className={`border ${alert.severity === 'critical' ? 'border-destructive/50 bg-destructive/5' : 'border-warning/50 bg-warning/5'} shadow-sm`}>
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-2">
                          <Badge variant={alert.severity === 'critical' ? 'critical' : 'amber'} className="capitalize">
                            {isPatient && alert.severity === 'warning' ? 'average' : alert.severity}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{alert.triggeredAt && !isNaN(new Date(alert.triggeredAt).getTime()) ? format(new Date(alert.triggeredAt), 'h:mm a') : '—'}</span>
                        </div>
                        <p className="font-medium text-sm text-foreground">{alert.message}</p>
                        <p className="text-xs text-muted-foreground mt-1 mb-3">Value: <span className="font-semibold text-foreground">{alert.value}</span> (Threshold: {alert.threshold})</p>
                        
                        {!isPatient && (
                          <div className="flex space-x-2">
                            <Button size="sm" variant="outline" className="flex-1 text-xs h-8" onClick={() => handleAction('ack', alert.id)}>
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Ack
                            </Button>
                            <Button size="sm" variant="default" className="flex-1 text-xs h-8 bg-success hover:bg-success/80 text-white" onClick={() => handleAction('resolve', alert.id)}>
                              <XCircle className="h-3 w-3 mr-1" /> Resolve
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center border border-border/50 border-dashed rounded-xl bg-card">
                  <CheckCircle2 className="h-10 w-10 text-success mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-medium text-foreground">No active alerts</p>
                  <p className="text-xs text-muted-foreground">{isPatient ? "You're looking good!" : "Patient is currently stable."}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Charts Tab */}
        {activeTab === "charts" && (
          <div className="space-y-6">
            <div className="flex justify-end space-x-2">
              {(['day', 'week', 'month'] as const).map(p => (
                <Button 
                  key={p} 
                  variant={period === p ? "default" : "outline"} 
                  size="sm" 
                  onClick={() => setPeriod(p)}
                  className="capitalize"
                >
                  {p}
                </Button>
              ))}
            </div>

            {vLoading ? (
              <div className="h-64 flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>
            ) : chartData.length > 0 ? (
              <>
                <Card className="border-border/50 shadow-sm p-4">
                  <h4 className="font-medium text-sm text-muted-foreground mb-4">Heart Rate (bpm)</h4>
                  <div className="h-72 w-full">
                    <ResponsiveContainer>
                      <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        {thresholds?.heartRateMax && <ReferenceLine y={thresholds.heartRateMax} stroke="hsl(var(--warning))" strokeDasharray="3 3" />}
                        {thresholds?.heartRateCriticalMax && <ReferenceLine y={thresholds.heartRateCriticalMax} stroke="hsl(var(--destructive))" strokeDasharray="3 3" />}
                        <Line type="monotone" dataKey="hr" stroke="#f43f5e" strokeWidth={2} dot={{r: 3, fill: '#f43f5e', strokeWidth: 0}} activeDot={{r: 5}} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card className="border-border/50 shadow-sm p-4">
                  <h4 className="font-medium text-sm text-muted-foreground mb-4">Blood Pressure (mmHg)</h4>
                  <div className="h-72 w-full">
                    <ResponsiveContainer>
                      <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Line type="monotone" dataKey="sys" name="Systolic" stroke="#3b82f6" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="dia" name="Diastolic" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </>
            ) : (
              <div className="text-center py-20 bg-card rounded-xl border border-dashed">No vitals data for this period.</div>
            )}
          </div>
        )}

        {/* Alert Thresholds Tab (providers only) */}
        {activeTab === "thresholds" && !isPatient && (
          <Card className="max-w-3xl border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center"><Settings className="mr-2 w-5 h-5 text-muted-foreground" /> Alert Configuration</CardTitle>
              <CardDescription>Set custom vital thresholds to trigger warnings or critical alerts for this specific patient.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleThresholdSubmit} className="space-y-8">
                <div>
                  <h4 className="font-medium text-foreground mb-4 border-b pb-2 flex items-center">
                    <Heart className="w-4 h-4 mr-2 text-rose-500" /> Heart Rate (bpm)
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-destructive">Critical Min</Label>
                      <Input name="heartRateCriticalMin" type="number" defaultValue={thresholds?.heartRateCriticalMin} placeholder="e.g. 40" className="bg-destructive/5" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-warning-foreground">Warning Min</Label>
                      <Input name="heartRateMin" type="number" defaultValue={thresholds?.heartRateMin} placeholder="e.g. 50" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-warning-foreground">Warning Max</Label>
                      <Input name="heartRateMax" type="number" defaultValue={thresholds?.heartRateMax} placeholder="e.g. 100" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-destructive">Critical Max</Label>
                      <Input name="heartRateCriticalMax" type="number" defaultValue={thresholds?.heartRateCriticalMax} placeholder="e.g. 120" className="bg-destructive/5" />
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-foreground mb-4 border-b pb-2 flex items-center">
                    <Activity className="w-4 h-4 mr-2 text-blue-500" /> Blood Pressure (mmHg)
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Systolic Warning Max</Label>
                      <Input name="systolicBpMax" type="number" defaultValue={thresholds?.systolicBpMax} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-destructive">Systolic Crit Max</Label>
                      <Input name="systolicBpCriticalMax" type="number" defaultValue={thresholds?.systolicBpCriticalMax} className="bg-destructive/5" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Diastolic Warning Max</Label>
                      <Input name="diastolicBpMax" type="number" defaultValue={thresholds?.diastolicBpMax} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-destructive">Diastolic Crit Max</Label>
                      <Input name="diastolicBpCriticalMax" type="number" defaultValue={thresholds?.diastolicBpCriticalMax} className="bg-destructive/5" />
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <Button type="submit" disabled={updateThresholds.isPending} className="shadow-md hover:shadow-lg transition-all">
                    {updateThresholds.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Configuration
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Connect Device Tab (patients only) */}
        {activeTab === "device" && isPatient && (
          <div className="space-y-6 max-w-md mx-auto">

            {/* ── Offline reconnection alert ─────────────────────────────────── */}
            {(() => {
              const syncedAt = effectiveSyncAt ?? (
                (patient as any)?.latestVitals?.recordedAt
                  ? new Date((patient as any).latestVitals.recordedAt)
                  : null
              );
              const msSince = syncedAt ? now.getTime() - syncedAt.getTime() : null;
              // Don't warn about offline when SSE events are proving device activity
              if (isDeviceActive || !msSince || msSince < STALE_VITALS_MS) return null;
              return (
                <Card className="border-amber-300 bg-amber-50 shadow-sm">
                  <CardContent className="p-4 flex gap-3 items-start">
                    <WifiOff className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-amber-900 text-sm">
                        Device offline — last synced {formatDistanceToNow(syncedAt!, { addSuffix: true })}
                      </p>
                      <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                        To resume syncing, open the <strong>PulseRPM</strong> app on your phone and
                        re-scan the QR code below. This updates the app to point at this server.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {/* ── Loading state ──────────────────────────────────────────────── */}
            {keyLoading ? (
              <Card className="border-border/50 shadow-sm">
                <CardContent className="py-20 flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Loading your connection details…</p>
                </CardContent>
              </Card>

            ) : deviceApiKey ? (
              <>
                {/* Single QR Code */}
                <Card className="border-violet-200 bg-gradient-to-br from-violet-50/60 to-transparent shadow-md">
                  <CardHeader className="pb-2 text-center">
                    <CardTitle className="text-xl font-bold flex items-center justify-center gap-2 text-violet-700">
                      <Smartphone className="h-5 w-5" /> Connect PulseRPM App
                      {isDeviceActive && (
                        <span className="flex items-center gap-1 text-xs font-normal text-success bg-success/10 border border-success/20 rounded-full px-2 py-0.5 ml-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                          Live
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription className="text-sm">
                      Scan this QR code with the PulseRPM mobile app to link your account and start syncing automatically.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center gap-5 pt-2">
                    {/* "Scan now" banner — shown for 60 s after Regenerate */}
                    {justRegenerated && (
                      <div className="w-full flex items-center gap-2 bg-green-50 border border-green-300 rounded-xl px-4 py-3">
                        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-green-800">New QR code generated</p>
                          <p className="text-xs text-green-700">Open your app and tap <strong>Re-scan QR</strong> to reconnect</p>
                        </div>
                      </div>
                    )}
                    {/* Pulsing ring on the QR for 60 s after regeneration */}
                    <div className={`p-4 bg-white rounded-2xl shadow-lg border transition-all duration-500 ${
                      justRegenerated
                        ? "border-green-400 ring-4 ring-green-300 ring-offset-2 animate-pulse"
                        : "border-violet-100 ring-2 ring-violet-200"
                    }`}>
                      <QRCodeSVG
                        value={`${window.location.origin}/api/device/connect?apiKey=${deviceApiKey}`}
                        size={220}
                        level="M"
                        includeMargin={false}
                        fgColor={justRegenerated ? "#15803d" : "#7c3aed"}
                      />
                    </div>
                    <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside w-full">
                      <li>Open the <strong>PulseRPM</strong> app on your phone</li>
                      <li>Tap <strong>{justRegenerated ? "Re-scan QR" : "Scan QR Code"}</strong> on the connect screen</li>
                      <li>Point at this QR — the app links and syncs instantly</li>
                    </ol>
                  </CardContent>
                </Card>

                {/* Server connection info — helps patient verify their app is hitting the right URL */}
                <Card className="border-border/50 shadow-sm bg-muted/30">
                  <CardContent className="p-4 space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <Wifi className="h-3.5 w-3.5" /> Your device should be sending data to:
                    </p>
                    <code className="text-xs font-mono bg-background border border-border/50 rounded px-2.5 py-1.5 block break-all text-foreground">
                      {window.location.origin}/api/device/ingest
                    </code>
                    <p className="text-xs text-muted-foreground">
                      If your app shows a different URL, re-scan the QR code above — it will update automatically.
                    </p>
                  </CardContent>
                </Card>

                {/* API Key management */}
                <Card className="border-border/50 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center text-base">
                      <Wifi className="mr-2 h-4 w-4 text-primary" /> Your API Key
                    </CardTitle>
                    <CardDescription>This key is embedded in the QR code above. Keep it private.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-muted rounded-lg px-3 py-2 text-xs font-mono text-foreground break-all border border-border/50">
                        {deviceApiKey}
                      </code>
                      <Button variant="outline" size="icon" onClick={handleCopyKey} className="shrink-0 h-8 w-8">
                        {keyCopied ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={handleGenerateKey} disabled={deviceLoading} className="gap-1.5">
                        <RefreshCw className={`h-4 w-4 ${deviceLoading ? 'animate-spin' : ''}`} /> Regenerate
                      </Button>
                      <Button variant="ghost" size="sm" onClick={handleRevokeKey} disabled={deviceLoading} className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive">
                        <Trash2 className="h-4 w-4" /> Revoke
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Regenerating creates a new key and <strong>invalidates the QR code</strong> — re-scan after regenerating.
                    </p>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card className="border-border/50 shadow-sm">
                <CardContent className="pt-6">
                  <div className="text-center py-12 border border-dashed rounded-xl border-border/50">
                    <Smartphone className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-foreground mb-1">No QR code yet</p>
                    <p className="text-sm text-muted-foreground mb-6">Generate your personal QR code to connect the PulseRPM mobile app.</p>
                    <Button onClick={handleGenerateKey} disabled={deviceLoading} className="gap-2">
                      {deviceLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
                      Generate QR Code
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

      </div>
    </Layout>
  );
}
