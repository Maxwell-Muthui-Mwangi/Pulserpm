import { useState } from "react";
import { useRoute } from "wouter";
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
import { withAuth } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Heart, Activity, Droplets, Thermometer, ArrowLeft, Settings, Bell, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine 
} from "recharts";

export default function PatientDetail() {
  const [, params] = useRoute("/patients/:id");
  const patientId = parseInt(params?.id || "0", 10);
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState<"overview" | "charts" | "thresholds">("overview");
  const [period, setPeriod] = useState<"day" | "week" | "month">("day");

  const { data: patient, isLoading: pLoading } = useGetPatient(patientId, { request: withAuth(), query: { enabled: !!patientId } });
  const { data: vitals, isLoading: vLoading } = useGetPatientVitals(patientId, { period, limit: 100 }, { request: withAuth(), query: { enabled: !!patientId && activeTab === "charts" } });
  const { data: alerts, refetch: refetchAlerts } = useGetPatientAlerts(patientId, { status: "active" }, { request: withAuth(), query: { enabled: !!patientId } });
  const { data: thresholds } = useGetPatientThresholds(patientId, { request: withAuth(), query: { enabled: !!patientId && activeTab === "thresholds" } });
  
  const updateThresholds = useUpdatePatientThresholds();
  const ackAlert = useAcknowledgeAlert();
  const resAlert = useResolveAlert();

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

  const chartData = vitals?.map(v => ({
    time: format(new Date(v.recordedAt), period === 'day' ? 'HH:mm' : 'MMM dd'),
    hr: v.heartRate,
    sys: v.systolicBp,
    dia: v.diastolicBp,
    spo2: v.spo2
  })).reverse() || [];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header Section */}
        <div className="flex items-center space-x-4 mb-2">
          <Button variant="ghost" size="icon" asChild className="rounded-full">
            <Link href="/patients"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground flex items-center">
              {patient.name}
              {patient.riskLevel === 'critical' && <Badge variant="critical" className="ml-3">Critical</Badge>}
              {patient.riskLevel === 'warning' && <Badge variant="amber" className="ml-3">Warning</Badge>}
              {patient.riskLevel === 'normal' && <Badge variant="normal" className="ml-3">Normal</Badge>}
            </h1>
            <p className="text-muted-foreground text-sm flex items-center mt-1">
              ID: {patient.id} • {patient.gender} • {patient.age} yrs • DOB: {patient.dateOfBirth} 
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-border/50">
          <button 
            onClick={() => setActiveTab("overview")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "overview" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            Overview
          </button>
          <button 
            onClick={() => setActiveTab("charts")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "charts" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            Vitals History
          </button>
          <button 
            onClick={() => setActiveTab("thresholds")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "thresholds" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            Alert Thresholds
          </button>
        </div>

        {/* Content based on active tab */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Latest Vitals */}
              <h3 className="font-display font-bold text-lg text-foreground">Latest Readings</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="border-border/50 shadow-sm bg-gradient-to-br from-card to-card">
                  <CardContent className="p-4 flex flex-col justify-center items-center text-center">
                    <Heart className="h-6 w-6 text-rose-500 mb-2" />
                    <span className="text-xs text-muted-foreground font-semibold uppercase">Heart Rate</span>
                    <span className="text-2xl font-bold mt-1">{patient.latestVitals?.heartRate || '--'} <span className="text-sm font-normal text-muted-foreground">bpm</span></span>
                  </CardContent>
                </Card>
                <Card className="border-border/50 shadow-sm">
                  <CardContent className="p-4 flex flex-col justify-center items-center text-center">
                    <Activity className="h-6 w-6 text-blue-500 mb-2" />
                    <span className="text-xs text-muted-foreground font-semibold uppercase">Blood Pressure</span>
                    <span className="text-2xl font-bold mt-1">{patient.latestVitals?.systolicBp || '--'}/{patient.latestVitals?.diastolicBp || '--'}</span>
                  </CardContent>
                </Card>
                <Card className="border-border/50 shadow-sm">
                  <CardContent className="p-4 flex flex-col justify-center items-center text-center">
                    <Droplets className="h-6 w-6 text-cyan-500 mb-2" />
                    <span className="text-xs text-muted-foreground font-semibold uppercase">SpO2</span>
                    <span className="text-2xl font-bold mt-1">{patient.latestVitals?.spo2 || '--'} <span className="text-sm font-normal text-muted-foreground">%</span></span>
                  </CardContent>
                </Card>
                <Card className="border-border/50 shadow-sm">
                  <CardContent className="p-4 flex flex-col justify-center items-center text-center">
                    <Thermometer className="h-6 w-6 text-amber-500 mb-2" />
                    <span className="text-xs text-muted-foreground font-semibold uppercase">Temperature</span>
                    <span className="text-2xl font-bold mt-1">{patient.latestVitals?.temperature || '--'} <span className="text-sm font-normal text-muted-foreground">°C</span></span>
                  </CardContent>
                </Card>
              </div>

              {/* Patient Info Card */}
              <Card className="border-border/50 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Medical Profile</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Email</p>
                      <p className="font-medium">{patient.email}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Device Integration</p>
                      <p className="font-medium capitalize">{patient.deviceType?.replace('_', ' ') || 'None'}</p>
                    </div>
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
                <Bell className="h-5 w-5 mr-2 text-destructive" /> Active Alerts
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
                          <Badge variant={alert.severity === 'critical' ? 'critical' : 'amber'} className="capitalize">{alert.severity}</Badge>
                          <span className="text-xs text-muted-foreground">{format(new Date(alert.triggeredAt), 'h:mm a')}</span>
                        </div>
                        <p className="font-medium text-sm text-foreground">{alert.message}</p>
                        <p className="text-xs text-muted-foreground mt-1 mb-3">Value: <span className="font-semibold text-foreground">{alert.value}</span> (Threshold: {alert.threshold})</p>
                        
                        <div className="flex space-x-2">
                          <Button size="sm" variant="outline" className="flex-1 text-xs h-8" onClick={() => handleAction('ack', alert.id)}>
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Ack
                          </Button>
                          <Button size="sm" variant="default" className="flex-1 text-xs h-8 bg-success hover:bg-success/80 text-white" onClick={() => handleAction('resolve', alert.id)}>
                            <XCircle className="h-3 w-3 mr-1" /> Resolve
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center border border-border/50 border-dashed rounded-xl bg-card">
                  <CheckCircle2 className="h-10 w-10 text-success mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-medium text-foreground">No active alerts</p>
                  <p className="text-xs text-muted-foreground">Patient is currently stable.</p>
                </div>
              )}
            </div>
          </div>
        )}

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
                        <RechartsTooltip 
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        />
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

        {activeTab === "thresholds" && (
          <Card className="max-w-3xl border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center"><Settings className="mr-2 w-5 h-5 text-muted-foreground" /> Alert Configuration</CardTitle>
              <CardDescription>Set custom vital thresholds to trigger warnings or critical alerts for this specific patient.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleThresholdSubmit} className="space-y-8">
                
                {/* Heart Rate Section */}
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

                {/* Blood Pressure */}
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
      </div>
    </Layout>
  );
}
