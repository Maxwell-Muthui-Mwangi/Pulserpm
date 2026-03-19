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
  TrendingUp
} from "lucide-react";
import { useGetDashboardStats, useListAlerts } from "@workspace/api-client-react";
import { withAuth } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

export default function Dashboard() {
  const { isPatient, user } = useAuth();
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats({ request: withAuth() });
  const { data: alerts, isLoading: alertsLoading } = useListAlerts(
    { status: "active", limit: 5 }, 
    { request: withAuth() }
  );

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  if (statsLoading || alertsLoading) {
    return (
      <Layout>
        <div className="flex h-64 items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }

  // ── Patient view ──────────────────────────────────────────────────────────
  if (isPatient && stats && (stats as any).isPatientView) {
    const patientStats = stats as any;
    const overallStatus: "critical" | "average" | "good" = patientStats.overallStatus ?? "good";

    const statusConfig = {
      critical: { label: "Critical", color: "text-destructive", bg: "bg-destructive/5", border: "border-destructive/20", dot: "bg-destructive animate-pulse" },
      average:  { label: "Average",  color: "text-warning-foreground", bg: "bg-warning/5", border: "border-warning/10", dot: "bg-warning" },
      good:     { label: "Good",     color: "text-success-foreground", bg: "bg-success/5", border: "border-success/10", dot: "bg-success" },
    };

    return (
      <Layout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">
              Welcome back, {user?.name.split(" ")[0]}
            </h1>
            <p className="text-muted-foreground mt-1">Here's a summary of your health today.</p>
          </div>

          <motion.div 
            variants={container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 md:grid-cols-3 gap-4"
          >
            <motion.div variants={item}>
              <Card className="border-border/50 shadow-sm hover:shadow-md transition-all">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">Active Alerts</p>
                      <h3 className="text-3xl font-bold font-display text-foreground">{patientStats.activeAlerts ?? 0}</h3>
                    </div>
                    <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${patientStats.activeAlerts > 0 ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}>
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
                      <h3 className="text-3xl font-bold font-display text-foreground">{patientStats.todaysReadings ?? 0}</h3>
                    </div>
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                      <Activity className="h-6 w-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div variants={item}>
              <Card className={`border shadow-sm hover:shadow-md transition-all ${statusConfig[overallStatus].border}`}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">Overall Status</p>
                      <h3 className={`text-3xl font-bold font-display ${statusConfig[overallStatus].color}`}>
                        {statusConfig[overallStatus].label}
                      </h3>
                    </div>
                    <div className={`h-12 w-12 rounded-2xl ${statusConfig[overallStatus].bg} flex items-center justify-center`}>
                      {overallStatus === "good" 
                        ? <CheckCircle2 className="h-6 w-6 text-success" />
                        : overallStatus === "average"
                          ? <TrendingUp className="h-6 w-6 text-warning-foreground" />
                          : <ShieldAlert className="h-6 w-6 text-destructive" />
                      }
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
            {/* Your Status */}
            <Card className="lg:col-span-1 shadow-sm border-border/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <HeartPulse className="h-5 w-5 mr-2 text-primary" />
                  Your Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className={`flex items-center justify-between p-3 rounded-xl border ${
                    overallStatus === "critical" 
                      ? "bg-destructive/10 border-destructive/20 ring-1 ring-destructive/30" 
                      : "bg-destructive/5 border-destructive/10"
                  }`}>
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-destructive mr-3 animate-pulse"></div>
                      <span className="font-medium text-destructive">Critical</span>
                    </div>
                    <span className="font-bold">{patientStats.criticalAlerts ?? 0}</span>
                  </div>
                  <div className={`flex items-center justify-between p-3 rounded-xl border ${
                    overallStatus === "average" 
                      ? "bg-warning/10 border-warning/20 ring-1 ring-warning/30" 
                      : "bg-warning/5 border-warning/10"
                  }`}>
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-warning mr-3"></div>
                      <span className="font-medium text-warning-foreground">Average</span>
                    </div>
                    <span className="font-bold">{patientStats.averageAlerts ?? 0}</span>
                  </div>
                  <div className={`flex items-center justify-between p-3 rounded-xl border ${
                    overallStatus === "good" 
                      ? "bg-success/10 border-success/20 ring-1 ring-success/30" 
                      : "bg-success/5 border-success/10"
                  }`}>
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-success mr-3"></div>
                      <span className="font-medium text-success-foreground">Good</span>
                    </div>
                    <span className="font-bold">{overallStatus === "good" ? 1 : 0}</span>
                  </div>
                </div>
                <div className="mt-6">
                  <Button variant="outline" className="w-full" asChild>
                    <Link href={`/patients/${user?.id}`}>View My Profile</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* My Recent Alerts */}
            <Card className="lg:col-span-2 shadow-sm border-border/50">
              <CardHeader className="flex flex-row items-center justify-between py-4">
                <CardTitle className="text-lg flex items-center">
                  <AlertTriangle className="h-5 w-5 mr-2 text-destructive" />
                  My Recent Alerts
                </CardTitle>
                <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80 hover:bg-primary/10" asChild>
                  <Link href="/alerts" className="flex items-center">
                    View All <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                {alerts && alerts.length > 0 ? (
                  <div className="space-y-3">
                    {alerts.map((alert) => (
                      <div key={alert.id} className="flex items-start space-x-4 p-4 rounded-xl border border-border/50 hover:border-border hover:shadow-sm transition-all bg-card">
                        <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${alert.severity === 'critical' ? 'bg-destructive animate-pulse' : 'bg-warning'}`} />
                        <div className="flex-1">
                          <p className="font-medium text-foreground">{alert.vitalType.replace('_', ' ')}</p>
                          <p className="text-sm text-muted-foreground mt-0.5">{alert.message}</p>
                          <div className="flex items-center space-x-2 mt-2">
                            <Badge variant={alert.severity === 'critical' ? 'critical' : 'amber'} className="text-[10px] px-1.5 py-0">
                              {alert.severity === 'warning' ? 'average' : alert.severity}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(alert.triggeredAt), 'MMM d, h:mm a')}
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

  // ── Provider view ─────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Dashboard Overview</h1>
          <p className="text-muted-foreground mt-1">Monitor your patients' vitals and active alerts in real-time.</p>
        </div>

        <motion.div 
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          <motion.div variants={item}>
            <Card className="border-border/50 shadow-sm hover:shadow-md transition-all">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Total Patients</p>
                    <h3 className="text-3xl font-bold font-display text-foreground">{stats?.totalPatients || 0}</h3>
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
              <div className="absolute top-0 right-0 w-2 h-full bg-destructive"></div>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Active Alerts</p>
                    <h3 className="text-3xl font-bold font-display text-foreground">{stats?.activeAlerts || 0}</h3>
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
                    <p className="text-sm font-medium text-muted-foreground mb-1">Critical Patients</p>
                    <h3 className="text-3xl font-bold font-display text-destructive">{stats?.criticalPatients || 0}</h3>
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
                    <h3 className="text-3xl font-bold font-display text-foreground">{stats?.todaysReadings || 0}</h3>
                  </div>
                  <div className="h-12 w-12 rounded-2xl bg-success/10 flex items-center justify-center text-success">
                    <Activity className="h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
          {/* Patient Risk Breakdown */}
          <Card className="lg:col-span-1 shadow-sm border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center">
                <HeartPulse className="h-5 w-5 mr-2 text-primary" />
                Patient Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-xl bg-destructive/5 border border-destructive/10">
                  <div className="flex items-center">
                    <div className="w-3 h-3 rounded-full bg-destructive mr-3 animate-pulse"></div>
                    <span className="font-medium text-destructive">Critical</span>
                  </div>
                  <span className="font-bold">{stats?.criticalPatients || 0}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-warning/5 border border-warning/10">
                  <div className="flex items-center">
                    <div className="w-3 h-3 rounded-full bg-warning mr-3"></div>
                    <span className="font-medium text-warning-foreground">Warning</span>
                  </div>
                  <span className="font-bold">{stats?.warningPatients || 0}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-success/5 border border-success/10">
                  <div className="flex items-center">
                    <div className="w-3 h-3 rounded-full bg-success mr-3"></div>
                    <span className="font-medium text-success-foreground">Normal</span>
                  </div>
                  <span className="font-bold">{stats?.normalPatients || 0}</span>
                </div>
              </div>
              <div className="mt-6">
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/patients">View All Patients</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recent Alerts */}
          <Card className="lg:col-span-2 shadow-sm border-border/50">
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <CardTitle className="text-lg flex items-center">
                <AlertTriangle className="h-5 w-5 mr-2 text-destructive" />
                Recent Active Alerts
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80 hover:bg-primary/10" asChild>
                <Link href="/alerts" className="flex items-center">
                  View All <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {alerts && alerts.length > 0 ? (
                <div className="space-y-3">
                  {alerts.map((alert) => (
                    <div key={alert.id} className="flex items-center justify-between p-4 rounded-xl border border-border/50 hover:border-border hover:shadow-sm transition-all bg-card group">
                      <div className="flex items-start space-x-4">
                        <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${alert.severity === 'critical' ? 'bg-destructive animate-pulse' : 'bg-warning'}`} />
                        <div>
                          <p className="font-medium text-foreground">
                            {alert.patientName} <span className="text-muted-foreground font-normal ml-1">· {alert.vitalType.replace('_', ' ')}</span>
                          </p>
                          <p className="text-sm text-muted-foreground mt-0.5">{alert.message}</p>
                          <div className="flex items-center space-x-2 mt-2">
                            <Badge variant={alert.severity === 'critical' ? 'critical' : 'amber'} className="text-[10px] px-1.5 py-0">
                              {alert.severity}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(alert.triggeredAt), 'MMM d, h:mm a')}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Button variant="secondary" size="sm" asChild className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href={`/patients/${alert.patientId}`}>View</Link>
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="h-12 w-12 rounded-full bg-success/10 flex items-center justify-center mb-3">
                    <Activity className="h-6 w-6 text-success" />
                  </div>
                  <p className="text-foreground font-medium">All clear</p>
                  <p className="text-sm text-muted-foreground mt-1">No active alerts at this time.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
