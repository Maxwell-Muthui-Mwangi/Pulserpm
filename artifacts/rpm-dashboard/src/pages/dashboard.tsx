import { motion } from "framer-motion";
import { Link } from "wouter";
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
} from "lucide-react";
import { useGetDashboardStats, useListAlerts, useListPatients } from "@workspace/api-client-react";
import { withAuth } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, formatDistanceToNow } from "date-fns";

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

export default function Dashboard() {
  const { isPatient, user } = useAuth();
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats({ request: withAuth() });
  const { data: alerts, isLoading: alertsLoading } = useListAlerts(
    { status: "active", limit: 5 },
    { request: withAuth() }
  );
  const { data: patients, isLoading: patientsLoading } = useListPatients(
    {},
    { query: { enabled: !isPatient } as any, request: withAuth() }
  );

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
      critical: { label: "Critical", color: "text-destructive",        bg: "bg-destructive/5", border: "border-destructive/20", dot: "bg-destructive animate-pulse" },
      average:  { label: "Average",  color: "text-warning-foreground", bg: "bg-warning/5",     border: "border-warning/10",    dot: "bg-warning" },
      good:     { label: "Good",     color: "text-success-foreground", bg: "bg-success/5",     border: "border-success/10",    dot: "bg-success" },
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
                          <p className="font-medium text-foreground">{alert.vitalType.replace("_", " ")}</p>
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
        </div>
      </Layout>
    );
  }

  // ── Provider view ──────────────────────────────────────────────────────────
  const sortedPatients = [...(patients ?? [])].sort((a, b) => {
    const order = { critical: 0, warning: 1, normal: 2 };
    return (order[(a as any).riskLevel as keyof typeof order] ?? 2) - (order[(b as any).riskLevel as keyof typeof order] ?? 2);
  });

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
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
                    <p className="text-sm font-medium text-muted-foreground mb-1">Critical</p>
                    <h3 className="text-3xl font-bold font-display text-destructive">{stats?.criticalPatients ?? 0}</h3>
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

        {/* Patient monitoring table */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
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
                        {/* Status dot + name */}
                        <div className="flex items-center gap-3 w-44 shrink-0">
                          <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${risk.dot}`} />
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-foreground truncate">{p.name}</p>
                            <p className="text-xs text-muted-foreground">{p.age} yrs</p>
                          </div>
                        </div>

                        {/* Conditions */}
                        <div className="hidden md:flex flex-wrap gap-1 w-40 shrink-0">
                          {(p.conditions ?? []).slice(0, 2).map((c: string) => (
                            <span key={c} className="text-[10px] bg-muted text-muted-foreground rounded-md px-1.5 py-0.5 leading-tight">{c}</span>
                          ))}
                          {p.conditions?.length > 2 && (
                            <span className="text-[10px] bg-muted text-muted-foreground rounded-md px-1.5 py-0.5">+{p.conditions.length - 2}</span>
                          )}
                        </div>

                        {/* Live vitals */}
                        <div className="hidden lg:flex items-center gap-4 flex-1 min-w-0">
                          <VitalPill icon={Heart} value={v?.heartRate} unit=" bpm" warn={v?.heartRate > 100 || v?.heartRate < 50} />
                          <VitalPill icon={Activity} value={v?.systolicBp} unit=" sys" warn={v?.systolicBp > 140} />
                          <VitalPill icon={Droplets} value={v?.spo2} unit="%" warn={v?.spo2 < 92} />
                          <VitalPill icon={Thermometer} value={v?.temperature} unit="°C" warn={v?.temperature > 38} />
                        </div>

                        {/* Right side: alerts + last seen + badge + action */}
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
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
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
                            <span className="text-muted-foreground font-normal ml-1.5">· {alert.vitalType.replace("_", " ")}</span>
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
