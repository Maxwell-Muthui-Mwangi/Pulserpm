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
  useResolveAlert
} from "@workspace/api-client-react";
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
  Wifi, Apple, Watch, Printer
} from "lucide-react";
import { Link } from "wouter";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  ResponsiveContainer, ReferenceLine 
} from "recharts";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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
  const [keyCopied, setKeyCopied] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const queryClient = useQueryClient();

  const { data: patient, isLoading: pLoading } = useGetPatient(patientId, { request: withAuth(), query: { enabled: !!patientId, refetchInterval: 30_000 } as any });
  const { data: vitals, isLoading: vLoading } = useGetPatientVitals(patientId, { period, limit: 100 }, { request: withAuth(), query: { enabled: !!patientId && activeTab === "charts", refetchInterval: activeTab === "charts" ? 20_000 : false } as any });
  const { data: alerts, refetch: refetchAlerts } = useGetPatientAlerts(patientId, { status: "active" }, { request: withAuth(), query: { enabled: !!patientId, refetchInterval: 20_000 } as any });
  const { data: thresholds } = useGetPatientThresholds(patientId, { request: withAuth(), query: { enabled: !!patientId && activeTab === "thresholds" } as any });
  
  const updateThresholds = useUpdatePatientThresholds();
  const ackAlert = useAcknowledgeAlert();
  const resAlert = useResolveAlert();

  const fetchDeviceKey = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/device/key`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDeviceApiKey(data.apiKey || null);
      }
    } catch {
      // ignore
    }
  }, []);

  // SSE subscription with auto-reconnect (exponential backoff).
  // Patients  → patient-specific channel.
  // Providers → global provider channel (receives events for all patients;
  //             vitals event includes patientId so the UI can filter if needed).
  useEffect(() => {
    if (!patientId) return;

    let retryCount = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let unmounted = false;
    let es: EventSource | null = null;

    function connect() {
      if (unmounted) return;
      const token = getAuthToken();
      if (!token) return;

      const url = `${API_BASE}/api/device/events?token=${encodeURIComponent(token)}`;
      es = new EventSource(url);

      es.addEventListener("connected", () => {
        retryCount = 0;
        setSseConnected(true);
      });

      es.addEventListener("vitals", () => {
        // Invalidate all queries so vitals, alerts, and patient summary refresh
        queryClient.invalidateQueries();
      });

      es.onerror = () => {
        if (unmounted) return;
        setSseConnected(false);
        es?.close();
        es = null;
        // Exponential backoff: 1 s → 2 s → 4 s → … → 30 s max
        const delay = Math.min(1_000 * Math.pow(2, retryCount), 30_000);
        retryCount = Math.min(retryCount + 1, 10);
        retryTimer = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      unmounted = true;
      es?.close();
      if (retryTimer) clearTimeout(retryTimer);
      setSseConnected(false);
    };
  }, [patientId, queryClient]);

  useEffect(() => {
    if (activeTab === "device" && isPatient) {
      fetchDeviceKey();
    }
  }, [activeTab, isPatient, fetchDeviceKey]);

  const handleGenerateKey = async () => {
    setDeviceLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/device/generate-key`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getAuthToken()}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDeviceApiKey(data.apiKey);
        toast({ title: "Device key generated", description: "Your new API key is ready to use." });
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
                {sseConnected ? (
                  <span className="flex items-center gap-1 text-xs font-normal text-success bg-success/10 border border-success/20 rounded-full px-2 py-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                    Live
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                    <RefreshCw className="h-3 w-3" />
                    Auto-refreshing
                  </span>
                )}
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="border-border/50 shadow-sm bg-gradient-to-br from-card to-card">
                  <CardContent className="p-4 flex flex-col justify-center items-center text-center">
                    <Heart className="h-6 w-6 text-rose-500 mb-2" />
                    <span className="text-xs text-muted-foreground font-semibold uppercase">Heart Rate</span>
                    <span className="text-2xl font-bold mt-1">{patient.latestVitals?.heartRate ?? '--'} <span className="text-sm font-normal text-muted-foreground">bpm</span></span>
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
                  </CardContent>
                </Card>
                <Card className="border-border/50 shadow-sm">
                  <CardContent className="p-4 flex flex-col justify-center items-center text-center">
                    <Droplets className="h-6 w-6 text-cyan-500 mb-2" />
                    <span className="text-xs text-muted-foreground font-semibold uppercase">SpO2</span>
                    <span className="text-2xl font-bold mt-1">{patient.latestVitals?.spo2 ?? '--'} <span className="text-sm font-normal text-muted-foreground">%</span></span>
                  </CardContent>
                </Card>
                <Card className="border-border/50 shadow-sm">
                  <CardContent className="p-4 flex flex-col justify-center items-center text-center">
                    <Thermometer className="h-6 w-6 text-amber-500 mb-2" />
                    <span className="text-xs text-muted-foreground font-semibold uppercase">Temperature</span>
                    <span className="text-2xl font-bold mt-1">{patient.latestVitals?.temperature ?? '--'} <span className="text-sm font-normal text-muted-foreground">°C</span></span>
                  </CardContent>
                </Card>
              </div>

              {/* Last synced timestamp */}
              {patient.latestVitals?.recordedAt ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 -mt-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-success inline-block" />
                  Last synced {formatDistanceToNow(new Date(patient.latestVitals.recordedAt as string), { addSuffix: true })}
                  {" · "}{format(new Date(patient.latestVitals.recordedAt as string), "MMM d 'at' h:mm a")}
                </p>
              ) : (
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
            {deviceApiKey ? (
              <>
                {/* Single QR Code */}
                <Card className="border-violet-200 bg-gradient-to-br from-violet-50/60 to-transparent shadow-md">
                  <CardHeader className="pb-2 text-center">
                    <CardTitle className="text-xl font-bold flex items-center justify-center gap-2 text-violet-700">
                      <Smartphone className="h-5 w-5" /> Connect PulseRPM App
                      {sseConnected && (
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
                    <div className="p-4 bg-white rounded-2xl shadow-lg border border-violet-100 ring-2 ring-violet-200">
                      <QRCodeSVG
                        value={`${window.location.origin}${API_BASE}/api/device/connect?apiKey=${deviceApiKey}`}
                        size={220}
                        level="M"
                        includeMargin={false}
                        fgColor="#7c3aed"
                      />
                    </div>
                    <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside w-full">
                      <li>Open the <strong>PulseRPM</strong> app on your phone</li>
                      <li>Tap <strong>"Scan QR Code"</strong> on the connect screen</li>
                      <li>Point at this QR — the app links and syncs instantly</li>
                    </ol>
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
