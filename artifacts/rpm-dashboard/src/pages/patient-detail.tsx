import { useState, useEffect, useCallback } from "react";
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
import { format } from "date-fns";
import { 
  Heart, Activity, Droplets, Thermometer, ArrowLeft, Settings, Bell, 
  CheckCircle2, XCircle, Loader2, Smartphone, Copy, RefreshCw, Trash2,
  Wifi, Apple, Watch
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

  const { data: patient, isLoading: pLoading } = useGetPatient(patientId, { request: withAuth(), query: { enabled: !!patientId } as any });
  const { data: vitals, isLoading: vLoading } = useGetPatientVitals(patientId, { period, limit: 100 }, { request: withAuth(), query: { enabled: !!patientId && activeTab === "charts" } as any });
  const { data: alerts, refetch: refetchAlerts } = useGetPatientAlerts(patientId, { status: "active" }, { request: withAuth(), query: { enabled: !!patientId } as any });
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

  const ingestUrl = `${window.location.origin}${API_BASE}/api/device/ingest`;
  const syncPageUrl = deviceApiKey
    ? `${window.location.origin}${API_BASE}/sync?apiKey=${deviceApiKey}`
    : "";

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header Section */}
        <div className="flex items-center space-x-4 mb-2">
          <Button variant="ghost" size="icon" asChild className="rounded-full">
            <Link href={isPatient ? "/" : "/patients"}><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <div>
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
          <div className="space-y-6 max-w-3xl">
            {/* QR Code Pair Cards — Healthwear + Oraimo side by side */}
            {deviceApiKey ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {/* ── Healthwear QR ── */}
                <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-transparent shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                          <Watch className="h-4 w-4 text-emerald-600" />
                        </div>
                        <span><span className="font-extrabold text-emerald-600">Health</span><span className="font-extrabold text-teal-700">wear</span></span>
                      </CardTitle>
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 font-semibold">All vitals</span>
                    </div>
                    <CardDescription className="text-xs">Heart Rate, SpO₂, BP, Temperature, Calories — all fully supported</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-col items-center gap-2">
                      <div className="p-3 bg-white rounded-xl shadow-md border border-emerald-100 ring-2 ring-emerald-100">
                        <QRCodeSVG
                          value={`${window.location.origin}${API_BASE}/sync-healthwear?apiKey=${deviceApiKey}`}
                          size={150}
                          level="M"
                          includeMargin={false}
                          fgColor="#059669"
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground text-center">Scan to open Healthwear sync form</p>
                    </div>
                    <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                      <li>Scan QR with your phone camera</li>
                      <li>Open <strong>Healthwear app → Live Vitals</strong></li>
                      <li>Enter all readings and tap <em>Sync</em></li>
                    </ol>
                  </CardContent>
                </Card>

                {/* ── Oraimo QR ── */}
                <Card className="border-sky-200 bg-gradient-to-br from-sky-50/60 to-transparent shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg bg-sky-100 flex items-center justify-center">
                          <Watch className="h-4 w-4 text-sky-600" />
                        </div>
                        <span><span className="font-bold text-green-600">o</span><span className="font-bold text-sky-700">raimo</span></span>
                      </CardTitle>
                      <span className="text-[10px] bg-sky-50 text-sky-700 border border-sky-200 rounded-full px-2 py-0.5">HR, SpO₂, Temp</span>
                    </div>
                    <CardDescription className="text-xs">Skip Blood Pressure if your model doesn't support it</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-col items-center gap-2">
                      <div className="p-3 bg-white rounded-xl shadow-md border border-sky-100 ring-2 ring-sky-100">
                        <QRCodeSVG
                          value={syncPageUrl}
                          size={150}
                          level="M"
                          includeMargin={false}
                          fgColor="#0284c7"
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground text-center">Scan to open Oraimo sync form</p>
                    </div>
                    <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                      <li>Scan QR with your phone camera</li>
                      <li>Open <strong>Oraimo app → Heart Rate</strong></li>
                      <li>Enter readings, skip unavailable ones</li>
                    </ol>
                  </CardContent>
                </Card>

                {/* ── PulseRPM Mobile App QR ── */}
                <Card className="border-violet-200 bg-gradient-to-br from-violet-50/60 to-transparent shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <div className="h-7 w-7 rounded-lg bg-violet-100 flex items-center justify-center">
                          <Smartphone className="h-4 w-4 text-violet-600" />
                        </div>
                        <span className="font-extrabold text-violet-700">PulseRPM App</span>
                      </CardTitle>
                      <span className="text-[10px] bg-violet-100 text-violet-700 border border-violet-200 rounded-full px-2 py-0.5 font-semibold">Health Connect</span>
                    </div>
                    <CardDescription className="text-xs">Auto-sync via Android Health Connect — Heart Rate, SpO₂, BP, Temperature</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-col items-center gap-2">
                      <div className="p-3 bg-white rounded-xl shadow-md border border-violet-100 ring-2 ring-violet-100">
                        <QRCodeSVG
                          value={`pulserpm-mobile://connect?apiKey=${deviceApiKey}`}
                          size={150}
                          level="M"
                          includeMargin={false}
                          fgColor="#7c3aed"
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground text-center">Scan with Expo Go to open PulseRPM app</p>
                    </div>
                    <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                      <li>Open <strong>Expo Go</strong> → scan this QR</li>
                      <li>App auto-connects with your account</li>
                      <li>Go to <strong>Health tab</strong> → grant permissions → Sync</li>
                    </ol>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card className="border-border/50 shadow-sm">
                <CardContent className="pt-6">
                  <div className="text-center py-8 border border-dashed rounded-xl border-border/50">
                    <Watch className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
                    <p className="text-sm font-medium text-foreground mb-1">No device paired yet</p>
                    <p className="text-sm text-muted-foreground mb-4">Generate QR codes for your Healthwear and Oraimo devices.</p>
                    <Button onClick={handleGenerateKey} disabled={deviceLoading}>
                      {deviceLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Generate QR Codes
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* API Key management */}
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center text-base">
                  <Wifi className="mr-2 h-4 w-4 text-primary" /> Device API Key
                </CardTitle>
                <CardDescription>Your personal key that authenticates both QR codes above. Keep it private.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {deviceApiKey ? (
                  <>
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
                      Regenerating creates a new key and <strong>invalidates both QR codes</strong> — you'll need to re-scan them.
                    </p>
                  </>
                ) : null}
              </CardContent>
            </Card>

            {/* Integration Instructions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Oraimo — primary card */}
              <Card className="border-green-200 bg-green-50/30 shadow-sm md:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Watch className="h-4 w-4 text-green-600" />
                    <span><span className="font-bold text-green-700">o</span>raimo Smartwatch</span>
                    <span className="ml-auto text-xs font-normal bg-green-100 text-green-700 px-2 py-0.5 rounded-full border border-green-200">Recommended</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-3">
                  <p>Sync your Oraimo smartwatch readings directly using the QR code above:</p>
                  <ol className="list-decimal list-inside space-y-1.5 text-xs">
                    <li>Generate your QR code above (if you haven't already)</li>
                    <li>Scan the QR code with your phone camera</li>
                    <li>The <strong>PulseRPM sync form</strong> opens in your browser</li>
                    <li>Open the <strong>Oraimo Health app</strong> and note your latest readings</li>
                    <li>Enter Heart Rate, SpO₂, and Temperature into the form</li>
                    <li><strong>Skip Blood Pressure</strong> if your Oraimo model doesn't measure it</li>
                    <li>Tap <em>"Sync to PulseRPM"</em> — your provider is notified instantly</li>
                  </ol>
                  <div className="bg-white border border-green-100 rounded-lg p-3 text-xs space-y-1">
                    <p className="font-semibold text-gray-700">Supported readings from Oraimo:</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-gray-600">
                      <span>✅ Heart Rate (all models)</span>
                      <span>✅ Blood Oxygen / SpO₂ (most models)</span>
                      <span>⚠️ Body Temperature (select models)</span>
                      <span>⚠️ Blood Pressure (select models only)</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Apple Health */}
              <Card className="border-border/50 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Apple className="h-4 w-4" /> Apple Health / iPhone
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                  <p>Use the <strong>iOS Shortcuts</strong> app to send data automatically:</p>
                  <ol className="list-decimal list-inside space-y-1.5 text-xs">
                    <li>Open Shortcuts → New Shortcut</li>
                    <li>Add action: <em>"Get Health Samples"</em> (Heart Rate, Blood Pressure, etc.)</li>
                    <li>Add action: <em>"Get Contents of URL"</em></li>
                    <li>Set URL to the endpoint below</li>
                    <li>Method: POST, Body: JSON with your vitals</li>
                    <li>Add <code>X-Device-Api-Key</code> header with your key</li>
                    <li>Set as automation to run every hour</li>
                  </ol>
                  <div className="mt-3 p-2 bg-muted rounded text-xs font-mono break-all">{ingestUrl}</div>
                </CardContent>
              </Card>

              {/* Android / Google Fit */}
              <Card className="border-border/50 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Smartphone className="h-4 w-4" /> Android / Google Fit
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                  <p>Use <strong>Tasker</strong> or <strong>Automate</strong> to send Google Fit data:</p>
                  <ol className="list-decimal list-inside space-y-1.5 text-xs">
                    <li>Install Tasker + Google Fit plugin</li>
                    <li>Create a task triggered hourly</li>
                    <li>Action: HTTP POST to endpoint below</li>
                    <li>Add header: <code>X-Device-Api-Key: your-key</code></li>
                    <li>Body: JSON with heartRate, systolicBp, spo2</li>
                  </ol>
                  <div className="mt-3 p-2 bg-muted rounded text-xs font-mono break-all">{ingestUrl}</div>
                </CardContent>
              </Card>

              {/* Wearables */}
              <Card className="border-border/50 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Watch className="h-4 w-4" /> Smartwatch / Wearable
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                  <p>Any device that can make HTTP requests (Garmin, Fitbit, Samsung Health) can push directly:</p>
                  <div className="bg-muted rounded-lg p-2 text-xs font-mono space-y-1">
                    <div className="text-primary">POST {ingestUrl}</div>
                    <div className="text-muted-foreground">X-Device-Api-Key: your-key</div>
                    <div>{"{"}</div>
                    <div className="pl-3">"heartRate": 72,</div>
                    <div className="pl-3">"systolicBp": 120,</div>
                    <div className="pl-3">"diastolicBp": 80,</div>
                    <div className="pl-3">"spo2": 98,</div>
                    <div className="pl-3">"temperature": 36.6</div>
                    <div>{"}"}</div>
                  </div>
                </CardContent>
              </Card>

              {/* REST API */}
              <Card className="border-border/50 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="h-4 w-4" /> REST API / Custom App
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                  <p>Send data from any custom app, script, or health device:</p>
                  <div className="bg-muted rounded-lg p-2 text-xs font-mono space-y-0.5">
                    <div className="text-primary">curl -X POST \</div>
                    <div className="pl-3">-H "X-Device-Api-Key: your-key" \</div>
                    <div className="pl-3">-H "Content-Type: application/json" \</div>
                    <div className="pl-3">-d '{"{"}"heartRate":72,"spo2":98{"}"}' \</div>
                    <div className="pl-3 break-all">{ingestUrl}</div>
                  </div>
                  <p className="text-xs">Supported fields: heartRate, systolicBp, diastolicBp, spo2, temperature, caloriesBurned, recordedAt</p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
