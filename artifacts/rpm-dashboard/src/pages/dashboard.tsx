import React, { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { QRCodeSVG } from "qrcode.react";
import { 
  Users, 
  AlertTriangle, 
  Activity, 
  HeartPulse,
  ArrowRight,
  ShieldAlert,
  CheckCircle2,
  TrendingUp,
  Thermometer,
  Droplets,
  Heart,
  Clock,
  ChevronRight,
  Loader2,
  RefreshCw,
  Zap,
  Smartphone,
  ScanLine,
} from "lucide-react";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { 
  useGetDashboardStats, useListAlerts, useListPatients,
  getGetPatientQueryKey,
  getGetDashboardStatsQueryKey,
} from "@workspace/api-client-react";
import { useRealtimeSync } from "@/lib/use-realtime-sync";
import { withAuth, getAuthToken } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, formatDistanceToNow } from "date-fns";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } },
};

const riskBadge: Record<string, { label: string; dot: string; badge: string }> = {
  critical: { label: "Critical", dot: "bg-destructive animate-pulse", badge: "bg-destructive/10 text-destructive border-destructive/20" },
  warning:  { label: "Warning",  dot: "bg-warning",                   badge: "bg-warning/10 text-warning-foreground border-warning/20" },
  normal:   { label: "Normal",   dot: "bg-success",                   badge: "bg-success/10 text-success-foreground border-success/20" },
};

function VitalPill({ icon: Icon, value, unit, warn }: { icon: React.ElementType; value?: number | null; unit: string; warn?: boolean }) {
  if (value == null) return <span className="text-xs text-muted-foreground/40">—</span>;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-mono ${warn ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
      <Icon className="h-3 w-3 shrink-0" />
      {value.toFixed(0)}<span className="opacity-60">{unit}</span>
    </span>
  );
}

interface TrendPoint {
  date: string;
  avgHeartRate: number | null;
  avgSystolicBp: number | null;
  avgSpo2: number | null;
  avgTemperature: number | null;
  totalReadings: number;
}

function useTrends() {
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [patientStatus, setPatientStatus] = useState<{ critical: number; warning: number; normal: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTrends = useCallback(() => {
    const token = getAuthToken();
    return window.fetch(`${API_BASE}/api/dashboard/trends?days=7`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setTrend(data.trend ?? []);
        setPatientStatus(data.patientStatus ?? null);
        setLoading(false);
      })
      .catch(() => { setLoading(false); });
  }, []);

  useEffect(() => {
    fetchTrends();
    // Poll every 60 s as a fallback when no device is pushing via SSE
    const id = setInterval(fetchTrends, 60_000);
    return () => clearInterval(id);
  }, [fetchTrends]);

  return { trend, patientStatus, loading };
}

function useWatchKey(isPatient: boolean) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [keyLoaded, setKeyLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/device/key`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (res.ok) {
        const d = await res.json();
        setApiKey(d.apiKey || null);
      }
    } catch { /* ignore */ }
    finally { setKeyLoaded(true); }
  }, []);

  useEffect(() => { if (isPatient) load(); }, [isPatient, load]);

  const generate = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/device/generate-key`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (res.ok) {
        const d = await res.json();
        setApiKey(d.apiKey);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const revoke = async () => {
    setLoading(true);
    try {
      await fetch(`${API_BASE}/api/device/key`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      setApiKey(null);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  return { apiKey, loading, keyLoaded, generate, revoke, reload: load };
}

interface SmartWatchCardProps {
  watch: ReturnType<typeof useWatchKey>;
  userId?: number;
  apiBase: string;
}

function SmartWatchCard({ watch, userId, apiBase }: SmartWatchCardProps) {
  const syncUrl = watch.apiKey
    ? `${window.location.origin}${apiBase}/api/device/connect?apiKey=${watch.apiKey}`
    : "";

  const steps = [
    { icon: <Smartphone className="h-4 w-4 text-violet-600" />, title: "Open the PulseRPM app", desc: "Download it if you haven't already" },
    { icon: <ScanLine className="h-4 w-4 text-violet-600" />, title: "Tap \"Scan QR Code\"", desc: "Point your camera at the QR code below" },
    { icon: <Zap className="h-4 w-4 text-violet-600" />, title: "That's it — you're synced", desc: "Your vitals sync automatically via Health Connect" },
  ];

  return (
    <Card className="border-border/50 shadow-sm overflow-hidden relative">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/3 via-transparent to-transparent pointer-events-none" />
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Smartphone className="h-4 w-4 text-primary" />
            </div>
            Connect the PulseRPM App
          </CardTitle>
          {watch.apiKey && (
            <div className="flex items-center gap-1.5 bg-success/10 border border-success/20 rounded-full px-3 py-1">
              <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
              <span className="text-xs font-medium text-success-foreground">Device Paired</span>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">Auto-sync via Android Health Connect</p>
      </CardHeader>

      <CardContent>
        {!watch.keyLoaded ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : watch.apiKey ? (
          <div className="flex flex-col md:flex-row gap-6 items-start">
            {/* QR Code */}
            <div className="flex flex-col items-center gap-3 shrink-0">
              <div className="relative">
                <div className="p-4 bg-white rounded-2xl shadow-lg border border-border/30 ring-2 ring-violet-200">
                  <QRCodeSVG
                    value={syncUrl}
                    size={156}
                    level="M"
                    includeMargin={false}
                    fgColor="#7c3aed"
                  />
                </div>
                <div className="absolute -top-2 -right-2 h-6 w-6 bg-violet-600 rounded-full flex items-center justify-center shadow-md">
                  <ScanLine className="h-3 w-3 text-white" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-center max-w-[160px]">
                Scan with the PulseRPM app
              </p>
            </div>

            {/* Steps */}
            <div className="flex-1 space-y-2.5">
              <p className="text-sm font-semibold text-foreground">How to connect:</p>
              {steps.map((step, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-muted/40 border border-border/30">
                  <div className="h-7 w-7 rounded-lg bg-background border border-border/50 flex items-center justify-center shrink-0 shadow-sm">
                    {step.icon}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{step.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{step.desc}</p>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={watch.generate} disabled={watch.loading}>
                  {watch.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Regenerate QR
                </Button>
                <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground" asChild>
                  <Link href={`/patients/${userId}?tab=device`}>
                    <Smartphone className="h-3.5 w-3.5" /> Advanced Setup
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="flex flex-col items-center gap-3 text-center sm:w-44 shrink-0">
              <div className="h-20 w-20 rounded-2xl border-2 border-dashed border-border/50 bg-muted/30 flex items-center justify-center">
                <Smartphone className="h-9 w-9 text-muted-foreground/40" />
              </div>
              <p className="text-xs text-muted-foreground">No device paired yet</p>
            </div>
            <div className="flex-1 space-y-3">
              <p className="text-sm text-muted-foreground">
                Generate your QR code to link the <strong>PulseRPM app</strong>. Scan once and your vitals sync automatically via Health Connect.
              </p>
              <Button onClick={watch.generate} disabled={watch.loading} className="gap-2 shadow-sm">
                {watch.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                Generate My QR Code
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { isPatient, user } = useAuth();
  const { data: stats, isLoading: statsLoading, dataUpdatedAt: statsUpdatedAt } = useGetDashboardStats(
    { request: withAuth(), query: { refetchInterval: 30_000 } as any }
  );
  const { data: alerts, isLoading: alertsLoading } = useListAlerts(
    { status: "active", limit: 5 },
    { request: withAuth(), query: { refetchInterval: 30_000 } as any }
  );
  const { data: patients, isLoading: patientsLoading } = useListPatients(
    {},
    { query: { enabled: !isPatient, refetchInterval: 30_000 } as any, request: withAuth() }
  );
  const { trend, patientStatus, loading: trendsLoading } = useTrends();
  const watch = useWatchKey(!!isPatient);
  const queryClient = useQueryClient();

  // Track when data was last refreshed for the "live" indicator
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [sseActive, setSseActive] = useState(false);
  const [, setTick] = useState(0);

  // Tick every 15 s so the "Updated X ago" label stays current
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  // Update last-refresh whenever the server responds
  useEffect(() => {
    if (statsUpdatedAt) setLastRefresh(new Date(statsUpdatedAt));
  }, [statsUpdatedAt]);

  // Real-time SSE — bulletproof hook handles reconnect, heartbeat watchdog,
  // tab visibility, and network events so the dashboard never freezes.
  useRealtimeSync({
    userId: user?.id,
    setConnected: setSseActive,
    onVitals: (data) => {
      // Apply non-null vitals directly to the patient cache — zero-latency update
      const pid = data.patientId as number | undefined;
      if (pid) {
        queryClient.setQueryData(
          getGetPatientQueryKey(pid),
          (old: Record<string, unknown> | undefined) => {
            if (!old) return old;
            const prev = (old.latestVitals ?? {}) as Record<string, unknown>;
            const patch: Record<string, unknown> = {};
            if (data.heartRate      != null) patch.heartRate      = data.heartRate;
            if (data.systolicBp     != null) patch.systolicBp     = data.systolicBp;
            if (data.diastolicBp    != null) patch.diastolicBp    = data.diastolicBp;
            if (data.spo2           != null) patch.spo2           = data.spo2;
            if (data.temperature    != null) patch.temperature    = data.temperature;
            if (data.caloriesBurned != null) patch.caloriesBurned = data.caloriesBurned;
            if (data.recordedAt)              patch.recordedAt    = data.recordedAt;
            return { ...old, latestVitals: { ...prev, ...patch } };
          },
        );
      }
      // Refetch stats and lists (not in the SSE payload)
      void queryClient.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      setLastRefresh(new Date());
    },
    onReconnect: () => {
      // Catch up on anything missed while the stream was down
      void queryClient.invalidateQueries();
      setLastRefresh(new Date());
    },
  });

  const isLoading = statsLoading || alertsLoading || (!isPatient && patientsLoading);

  if (isLoading) {
    return (
      <Layout>
        <div className="flex h-64 items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      </Layout>
    );
  }

  // ── Patient view ────────────────────────────────────────────────────────────
  if (isPatient && stats && (stats as any).isPatientView) {
    const ps = stats as any;
    const overallStatus: "critical" | "average" | "good" = ps.overallStatus ?? "good";

    const statusConfig = {
      critical: { label: "Critical", color: "text-red-900",        bg: "bg-destructive/5", border: "border-destructive/20", dot: "bg-destructive animate-pulse" },
      average:  { label: "Average",  color: "text-orange-800", bg: "bg-warning/5",     border: "border-warning/10",    dot: "bg-warning" },
      good:     { label: "Good",     color: "text-green-800", bg: "bg-success/5",     border: "border-success/10",    dot: "bg-success" },
    };
    const sc = statusConfig[overallStatus];

    return (
      <Layout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">
              Welcome back, {user?.name.split(" ")[0]}
            </h1>
            <p className="text-muted-foreground mt-1">Here's a summary of your health today.</p>
          </div>

          <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <motion.div variants={item}>
              <Card className="border-border/50 shadow-sm hover:shadow-md transition-all">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">Active Alerts</p>
                      <h3 className="text-3xl font-bold font-display text-foreground">{ps.activeAlerts ?? 0}</h3>
                    </div>
                    <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${ps.activeAlerts > 0 ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}>
                      <AlertTriangle className="h-6 w-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div variants={item}>
              <Card className="border-border/50 shadow-sm hover:shadow-md transition-all">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">Today's Readings</p>
                      <h3 className="text-3xl font-bold font-display text-foreground">{ps.todaysReadings ?? 0}</h3>
                    </div>
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                      <Activity className="h-6 w-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div variants={item}>
              <Card className={`border shadow-sm hover:shadow-md transition-all ${sc.border}`}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">Overall Status</p>
                      <h3 className={`text-3xl font-bold font-display ${sc.color}`}>{sc.label}</h3>
                    </div>
                    <div className={`h-12 w-12 rounded-2xl ${sc.bg} flex items-center justify-center`}>
                      {overallStatus === "good"
                        ? <CheckCircle2 className="h-6 w-6 text-success" />
                        : overallStatus === "average"
                          ? <TrendingUp className="h-6 w-6 text-warning-foreground" />
                          : <ShieldAlert className="h-6 w-6 text-destructive" />}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1 shadow-sm border-border/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <HeartPulse className="h-5 w-5 mr-2 text-primary" />Your Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(["critical","average","good"] as const).map((s) => {
                    const count = s === "critical" ? (ps.criticalAlerts ?? 0) : s === "average" ? (ps.averageAlerts ?? 0) : (overallStatus === "good" ? 1 : 0);
                    const active = overallStatus === s;
                    return (
                      <div key={s} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                        active
                          ? `${statusConfig[s].bg} ${statusConfig[s].border} ring-1 ring-offset-0`
                          : `${statusConfig[s].bg} ${statusConfig[s].border}`
                      }`}>
                        <div className="flex items-center">
                          <div className={`w-3 h-3 rounded-full mr-3 ${statusConfig[s].dot}`} />
                          <span className={`font-medium ${statusConfig[s].color}`}>{statusConfig[s].label}</span>
                        </div>
                        <span className="font-bold">{count}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-5">
                  <Button variant="outline" className="w-full" asChild>
                    <Link href={`/patients/${user?.id}`}>View My Profile</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2 shadow-sm border-border/50">
              <CardHeader className="flex flex-row items-center justify-between py-4">
                <CardTitle className="text-lg flex items-center">
                  <AlertTriangle className="h-5 w-5 mr-2 text-destructive" />My Recent Alerts
                </CardTitle>
                <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80 hover:bg-primary/10" asChild>
                  <Link href="/alerts" className="flex items-center">View All <ArrowRight className="ml-1 h-4 w-4" /></Link>
                </Button>
              </CardHeader>
              <CardContent>
                {alerts && alerts.length > 0 ? (
                  <div className="space-y-3">
                    {alerts.map((alert) => (
                      <div key={alert.id} className="flex items-start space-x-4 p-4 rounded-xl border border-border/50 hover:border-border hover:shadow-sm transition-all bg-card">
                        <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${alert.severity === "critical" ? "bg-destructive animate-pulse" : "bg-warning"}`} />
                        <div className="flex-1">
                          <p className="font-medium text-foreground">{(alert.vitalType ?? "").replace("_", " ")}</p>
                          <p className="text-sm text-muted-foreground mt-0.5">{alert.message}</p>
                          <div className="flex items-center space-x-2 mt-2">
                            <Badge variant={alert.severity === "critical" ? "critical" : "amber"} className="text-[10px] px-1.5 py-0">
                              {alert.severity === "warning" ? "average" : alert.severity}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {alert.triggeredAt && !isNaN(new Date(alert.triggeredAt).getTime()) ? format(new Date(alert.triggeredAt), "MMM d, h:mm a") : "—"}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="h-12 w-12 rounded-full bg-success/10 flex items-center justify-center mb-3">
                      <CheckCircle2 className="h-6 w-6 text-success" />
                    </div>
                    <p className="text-foreground font-medium">All good!</p>
                    <p className="text-sm text-muted-foreground mt-1">You have no active alerts at this time.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Smartwatch QR Pairing ─────────────────────────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <SmartWatchCard watch={watch} userId={user?.id} apiBase={API_BASE} />
          </motion.div>
        </div>
      </Layout>
    );
  }

  // ── Provider view ──────────────────────────────────────────────────────────
  const sortedPatients = [...(patients ?? [])].sort((a, b) => {
    const order = { critical: 0, warning: 1, normal: 2 };
    return (order[(a as any).riskLevel as keyof typeof order] ?? 2) - (order[(b as any).riskLevel as keyof typeof order] ?? 2);
  });

  const dangerCount = (patientStatus?.critical ?? 0) + (patientStatus?.warning ?? 0);
  const totalPatientsCount = (patientStatus?.critical ?? 0) + (patientStatus?.warning ?? 0) + (patientStatus?.normal ?? 0);

  const trendChartData = trend.map((d) => {
    let dateLabel = d.date ?? "";
    if (dateLabel) {
      try {
        dateLabel = format(new Date(dateLabel + "T12:00:00"), "MMM d");
      } catch {
        dateLabel = dateLabel.slice(5);
      }
    }
    return {
      date: dateLabel,
      "Heart Rate": d.avgHeartRate,
      "Systolic BP": d.avgSystolicBp,
      "SpO2": d.avgSpo2,
      "Temperature": d.avgTemperature,
      readings: d.totalReadings,
    };
  });

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">
              Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, Dr. {user?.name.split(" ").at(-1)}
            </h1>
            <p className="text-muted-foreground mt-1">
              {stats?.activeAlerts
                ? `${stats.activeAlerts} active alert${stats.activeAlerts !== 1 ? "s" : ""} require your attention.`
                : "All patients are currently stable. No active alerts."}
            </p>
          </div>
          {/* Live indicator */}
          <div className="flex items-center gap-2 bg-card border border-border/50 rounded-full px-3 py-1.5 shadow-sm text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
            <span className="font-medium text-success-foreground">Live</span>
            <span className="text-muted-foreground/70">·</span>
            <span>Updated {formatDistanceToNow(lastRefresh, { addSuffix: true })}</span>
          </div>
        </div>

        {/* KPI row */}
        <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <motion.div variants={item}>
            <Card className="border-border/50 shadow-sm hover:shadow-md transition-all">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Total Patients</p>
                    <h3 className="text-3xl font-bold font-display">{stats?.totalPatients ?? 0}</h3>
                  </div>
                  <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                    <Users className="h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={item}>
            <Card className="border-border/50 shadow-sm hover:shadow-md transition-all relative overflow-hidden">
              {(stats?.activeAlerts ?? 0) > 0 && <div className="absolute top-0 right-0 w-1.5 h-full bg-destructive" />}
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Active Alerts</p>
                    <h3 className="text-3xl font-bold font-display text-destructive">{stats?.activeAlerts ?? 0}</h3>
                  </div>
                  <div className="h-12 w-12 rounded-2xl bg-destructive/10 flex items-center justify-center text-destructive">
                    <AlertTriangle className="h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={item}>
            <Card className="border-border/50 shadow-sm hover:shadow-md transition-all">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Patients in Danger</p>
                    <h3 className="text-3xl font-bold font-display text-destructive">{dangerCount}</h3>
                  </div>
                  <div className="h-12 w-12 rounded-2xl bg-destructive/10 flex items-center justify-center text-destructive">
                    <ShieldAlert className="h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={item}>
            <Card className="border-border/50 shadow-sm hover:shadow-md transition-all">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Today's Readings</p>
                    <h3 className="text-3xl font-bold font-display">{stats?.todaysReadings ?? 0}</h3>
                  </div>
                  <div className="h-12 w-12 rounded-2xl bg-success/10 flex items-center justify-center text-success">
                    <Activity className="h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>

        {/* Patient Status Breakdown + 7-day Trends */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Patient status card */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="shadow-sm border-border/50 h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center">
                  <HeartPulse className="h-5 w-5 mr-2 text-primary" />Patient Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 rounded-xl bg-destructive/5 border border-destructive/20">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-destructive animate-pulse" />
                      <div>
                        <p className="font-semibold text-destructive">Critical</p>
                        <p className="text-xs text-muted-foreground">Immediate attention</p>
                      </div>
                    </div>
                    <span className="text-2xl font-bold font-display text-destructive">{patientStatus?.critical ?? stats?.criticalPatients ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-xl bg-warning/5 border border-warning/20">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-warning" />
                      <div>
                        <p className="font-semibold text-orange-500">Warning</p>
                        <p className="text-xs text-muted-foreground">Needs monitoring</p>
                      </div>
                    </div>
                    <span className="text-2xl font-bold font-display text-warning-foreground">{patientStatus?.warning ?? stats?.warningPatients ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-xl bg-success/5 border border-success/20">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-success" />
                      <div>
                        <p className="font-semibold text-green-800">Stable</p>
                        <p className="text-xs text-muted-foreground">Within normal range</p>
                      </div>
                    </div>
                    <span className="text-2xl font-bold font-display text-success-foreground">{patientStatus?.normal ?? stats?.normalPatients ?? totalPatientsCount}</span>
                  </div>
                </div>
                <div className="mt-4">
                  <Button variant="outline" className="w-full" asChild>
                    <Link href="/patients" className="flex items-center justify-center gap-2">
                      <Users className="h-4 w-4" />View All Patients
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* 7-day trends chart */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="lg:col-span-2">
            <Card className="shadow-sm border-border/50 h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center justify-between">
                  <span className="flex items-center">
                    <TrendingUp className="h-5 w-5 mr-2 text-primary" />7-Day Vital Trends
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">Average across all patients</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {trendsLoading ? (
                  <div className="h-52 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
                ) : trendChartData.length === 0 ? (
                  <div className="h-52 flex flex-col items-center justify-center text-center">
                    <Activity className="h-8 w-8 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">No readings in the last 7 days</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Heart Rate + BP chart */}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Heart Rate &amp; Blood Pressure</p>
                      <ResponsiveContainer width="100%" height={120}>
                        <LineChart data={trendChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                          <Tooltip
                            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                            labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                          />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="Heart Rate" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
                          <Line type="monotone" dataKey="Systolic BP" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    {/* SpO2 + Temperature chart */}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">SpO2 &amp; Temperature</p>
                      <ResponsiveContainer width="100%" height={120}>
                        <LineChart data={trendChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                          <Tooltip
                            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                            labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                          />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="SpO2" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
                          <Line type="monotone" dataKey="Temperature" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Patient monitoring table */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="shadow-sm border-border/50">
            <CardHeader className="flex flex-row items-center justify-between py-4 border-b border-border/40">
              <CardTitle className="text-lg flex items-center">
                <HeartPulse className="h-5 w-5 mr-2 text-primary" />
                Patient Monitoring
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  — {sortedPatients.length} patients
                </span>
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80 hover:bg-primary/10" asChild>
                <Link href="/patients" className="flex items-center">
                  All Patients <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {sortedPatients.length > 0 ? (
                <div className="divide-y divide-border/40">
                  {sortedPatients.map((patient, idx) => {
                    const p = patient as any;
                    const risk = riskBadge[p.riskLevel] ?? riskBadge.normal;
                    const lastSeen = p.lastSeen && !isNaN(new Date(p.lastSeen).getTime())
                      ? formatDistanceToNow(new Date(p.lastSeen), { addSuffix: true })
                      : "—";
                    const v = p.latestVitals;

                    return (
                      <motion.div
                        key={p.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 + idx * 0.04 }}
                        className="flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors group"
                      >
                        <div className="flex items-center gap-3 w-44 shrink-0">
                          <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${risk.dot}`} />
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-foreground truncate">{p.name}</p>
                            <p className="text-xs text-muted-foreground">{p.age} yrs</p>
                          </div>
                        </div>

                        <div className="hidden md:flex flex-wrap gap-1 w-40 shrink-0">
                          {(p.conditions ?? []).slice(0, 2).map((c: string) => (
                            <span key={c} className="text-[10px] bg-muted text-muted-foreground rounded-md px-1.5 py-0.5 leading-tight">{c}</span>
                          ))}
                          {p.conditions?.length > 2 && (
                            <span className="text-[10px] bg-muted text-muted-foreground rounded-md px-1.5 py-0.5">+{p.conditions.length - 2}</span>
                          )}
                        </div>

                        <div className="hidden lg:flex items-center gap-4 flex-1 min-w-0">
                          <VitalPill icon={Heart} value={v?.heartRate} unit=" bpm" warn={v?.heartRate > 100 || v?.heartRate < 50} />
                          <VitalPill icon={Activity} value={v?.systolicBp} unit=" sys" warn={v?.systolicBp > 140} />
                          <VitalPill icon={Droplets} value={v?.spo2} unit="%" warn={v?.spo2 < 92} />
                          <VitalPill icon={Thermometer} value={v?.temperature} unit="°C" warn={v?.temperature > 38} />
                        </div>

                        <div className="flex items-center gap-3 ml-auto shrink-0">
                          {p.activeAlertCount > 0 && (
                            <span className="flex items-center gap-1 text-xs text-destructive font-medium">
                              <AlertTriangle className="h-3.5 w-3.5" />{p.activeAlertCount}
                            </span>
                          )}
                          <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />{lastSeen}
                          </span>
                          <span className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${risk.badge}`}>
                            {risk.label}
                          </span>
                          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg" asChild>
                            <Link href={`/patients/${p.id}`}><ChevronRight className="h-4 w-4" /></Link>
                          </Button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-foreground font-medium">No patients found</p>
                  <p className="text-sm text-muted-foreground mt-1">Patients will appear here once added.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent alerts */}
        {alerts && alerts.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <Card className="shadow-sm border-border/50">
              <CardHeader className="flex flex-row items-center justify-between py-4 border-b border-border/40">
                <CardTitle className="text-lg flex items-center">
                  <AlertTriangle className="h-5 w-5 mr-2 text-destructive" />
                  Active Alerts
                </CardTitle>
                <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80 hover:bg-primary/10" asChild>
                  <Link href="/alerts" className="flex items-center">View All <ArrowRight className="ml-1 h-4 w-4" /></Link>
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/40">
                  {alerts.map((alert) => (
                    <div key={alert.id} className="flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors group">
                      <div className="flex items-start gap-4">
                        <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${alert.severity === "critical" ? "bg-destructive animate-pulse" : "bg-warning"}`} />
                        <div>
                          <p className="font-medium text-sm text-foreground">
                            {alert.patientName}
                            <span className="text-muted-foreground font-normal ml-1.5">· {(alert.vitalType ?? "").replace("_", " ")}</span>
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">{alert.message}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <Badge variant={alert.severity === "critical" ? "critical" : "amber"} className="text-[10px] px-1.5 py-0">
                              {alert.severity}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {alert.triggeredAt && !isNaN(new Date(alert.triggeredAt).getTime())
                                ? format(new Date(alert.triggeredAt), "MMM d, h:mm a") : "—"}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Button variant="secondary" size="sm" asChild className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href={`/patients/${alert.patientId}`}>View Patient</Link>
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </Layout>
  );
}
