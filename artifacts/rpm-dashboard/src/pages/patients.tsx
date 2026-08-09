import { useEffect, useState, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { Search, Filter, Activity, Heart, Thermometer, Droplets, Users, UserPlus, X, CheckCircle2, Loader2, Plus, WifiOff } from "lucide-react";
import { useListPatients, ListPatientsRiskLevel } from "@workspace/api-client-react";
import { withAuth, getAuthToken } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import Layout from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// Alert providers when a wearable device hasn't sent any reading in this window.
// Chosen to be long enough to absorb normal background-sync jitter (15–20 min)
// but short enough to catch genuine OS suspension or connectivity loss.
const DATA_GAP_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

function isDataGap(
  patient: { deviceType?: string | null | undefined; lastSeen?: string | Date | null },
  now: Date,
): boolean {
  if (patient.deviceType !== "wearable") return false;
  if (!patient.lastSeen) return false;
  return now.getTime() - new Date(patient.lastSeen).getTime() > DATA_GAP_THRESHOLD_MS;
}

interface PendingPatient {
  id: number;
  name: string;
  email: string;
  createdAt: string;
}

function AddPatientModal({ onClose, onApproved }: { onClose: () => void; onApproved: () => void }) {
  const { toast } = useToast();
  const [pending, setPending] = useState<PendingPatient[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selected, setSelected] = useState<PendingPatient | null>(null);
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [conditions, setConditions] = useState("");
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState<PendingPatient | null>(null);

  const loadPending = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch(`${API_BASE}/api/patients/pending`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (res.ok) setPending(await res.json());
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => { loadPending(); }, [loadPending]);

  const handleApprove = async () => {
    if (!selected) return;
    setApproving(true);
    try {
      const conditionsArr = conditions
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      const res = await fetch(`${API_BASE}/api/patients/pending/${selected.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ age: age || undefined, gender: gender || undefined, conditions: conditionsArr }),
      });
      if (res.ok) {
        setApproved(selected);
        onApproved();
      } else {
        const d = await res.json();
        toast({ title: "Approval failed", description: d.message ?? "Something went wrong", variant: "destructive" });
      }
    } catch {
      toast({ title: "Approval failed", description: "Network error.", variant: "destructive" });
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card w-full max-w-lg rounded-2xl shadow-2xl border border-border/50 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            <h2 className="font-bold text-lg text-foreground">Add Patient</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors rounded-lg p-1 hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 max-h-[75vh] overflow-y-auto space-y-5">
          {/* Success state */}
          {approved && (
            <div className="text-center space-y-4 py-4">
              <div className="flex items-center justify-center">
                <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-success" />
                </div>
              </div>
              <div>
                <h3 className="font-bold text-lg text-foreground">{approved.name} approved!</h3>
                <p className="text-sm text-muted-foreground mt-1">They have been added as a monitored patient and will receive a notification when they next log in.</p>
              </div>
              <div className="flex gap-3 justify-center">
                <Button variant="outline" onClick={() => { setApproved(null); setSelected(null); setAge(""); setGender(""); setConditions(""); loadPending(); }}>
                  Approve another
                </Button>
                <Button onClick={onClose}>Done</Button>
              </div>
            </div>
          )}

          {/* Patient selection */}
          {!approved && !selected && (
            <>
              <div>
                <p className="text-sm text-muted-foreground mb-3">
                  The following patients have verified their email and are awaiting your approval to be added for monitoring.
                </p>
                {loadingList ? (
                  <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary h-6 w-6" /></div>
                ) : pending.length === 0 ? (
                  <div className="text-center py-10 border border-dashed border-border/50 rounded-xl bg-muted/20">
                    <Users className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm font-medium text-foreground">No pending requests</p>
                    <p className="text-xs text-muted-foreground mt-1">Patients who sign up and verify their email will appear here.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pending.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => { setSelected(p); setAge(""); setGender(""); setConditions(""); }}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border/50 hover:border-primary/40 hover:bg-primary/5 transition-all text-left group"
                      >
                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                          {p.name.split(" ").map((n) => n[0]).join("").substring(0, 2)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground text-sm truncate group-hover:text-primary transition-colors">{p.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(p.createdAt), { addSuffix: true })}</p>
                          <p className="text-xs text-primary font-medium mt-0.5">Click to review →</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Approval form */}
          {!approved && selected && (
            <div className="space-y-5">
              <button onClick={() => setSelected(null)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                ← Back to list
              </button>

              <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-xl border border-primary/20">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                  {selected.name.split(" ").map((n) => n[0]).join("").substring(0, 2)}
                </div>
                <div>
                  <p className="font-semibold text-foreground text-sm">{selected.name}</p>
                  <p className="text-xs text-muted-foreground">{selected.email}</p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">Enter initial patient information before approving. You can update these details later.</p>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="age" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Age</Label>
                    <Input id="age" type="number" min="1" max="120" value={age} onChange={(e) => setAge(e.target.value)}
                      placeholder="e.g. 65" className="mt-1.5" />
                  </div>
                  <div>
                    <Label htmlFor="gender" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Gender</Label>
                    <select id="gender" value={gender} onChange={(e) => setGender(e.target.value)}
                      className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                      <option value="">Not specified</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="conditions" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Health Conditions <span className="font-normal normal-case">(comma-separated)</span>
                  </Label>
                  <Input id="conditions" type="text" value={conditions} onChange={(e) => setConditions(e.target.value)}
                    placeholder="e.g. Hypertension, Type 2 Diabetes" className="mt-1.5" />
                  <p className="text-xs text-muted-foreground mt-1">Leave blank if unknown. You can add these later.</p>
                </div>

                <div className="bg-muted/40 rounded-xl px-4 py-3 border border-border/30">
                  <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Note: </span>
                  A unique patient ID will be assigned automatically upon approval.</p>
                </div>
              </div>

              <Button onClick={handleApprove} disabled={approving} className="w-full h-11 shadow-md">
                {approving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Approving...</> : <><CheckCircle2 className="mr-2 h-4 w-4" />Approve & Add Patient</>}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Patients() {
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<ListPatientsRiskLevel | "all">("all");
  const { isPatient, user, isProvider } = useAuth();
  const [, setLocation] = useLocation();
  const [showModal, setShowModal] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const { toast } = useToast();

  // Tick every 30 s so data-gap badges appear/disappear at the threshold
  // without requiring a user interaction or a full data refetch.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (isPatient && user) setLocation(`/patients/${user.id}`);
  }, [isPatient, user, setLocation]);

  const { data: patients, isLoading, refetch: refetchPatients } = useListPatients(
    { search: search || undefined, riskLevel: riskFilter !== "all" ? riskFilter : undefined },
    { request: withAuth(), query: { enabled: !isPatient, refetchInterval: 30_000 } as any }
  );

  const fetchPendingCount = useCallback(async () => {
    if (!isProvider) return;
    try {
      const res = await fetch(`${API_BASE}/api/patients/pending/count`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPendingCount(data.count ?? 0);
      }
    } catch { /* ignore */ }
  }, [isProvider]);

  useEffect(() => {
    fetchPendingCount();
    const interval = setInterval(fetchPendingCount, 30000);
    return () => clearInterval(interval);
  }, [fetchPendingCount]);

  const getRiskBadge = (level: string) => {
    switch (level) {
      case "critical": return <Badge variant="critical">Critical</Badge>;
      case "warning": return <Badge variant="amber">Warning</Badge>;
      default: return <Badge variant="normal">Normal</Badge>;
    }
  };

  if (isPatient) {
    return (
      <Layout>
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Patients</h1>
            <p className="text-muted-foreground mt-1">Manage and monitor your patient cohort.</p>
          </div>
          <div className="relative shrink-0">
            <Button className="shadow-md gap-2" onClick={() => setShowModal(true)}>
              <Plus className="h-4 w-4" />
              Add Patient
            </Button>
            {pendingCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center shadow-sm border-2 border-card pointer-events-none">
                {pendingCount > 9 ? "9+" : pendingCount}
              </span>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 bg-card p-4 rounded-2xl border border-border/50 shadow-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by name or ID..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="pl-9 border-border/50 bg-muted/30" />
          </div>
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-muted-foreground hidden sm:block" />
            <div className="flex bg-muted/50 rounded-lg p-1 border border-border/50 overflow-x-auto">
              {(["all", "critical", "warning", "normal"] as const).map((risk) => (
                <button key={risk} onClick={() => setRiskFilter(risk as any)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all capitalize whitespace-nowrap ${riskFilter === risk ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                >
                  {risk}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Patient Grid */}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : patients && patients.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {patients.map((patient) => (
              <Link key={patient.id} href={`/patients/${patient.id}`}>
                <Card className={`cursor-pointer transition-all duration-300 hover:shadow-lg border-border/50 hover:border-primary/30 h-full flex flex-col ${patient.riskLevel === "critical" ? "ring-1 ring-destructive/20 border-destructive/20" : ""}`}>
                  <CardContent className="p-6 flex-1 flex flex-col">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center space-x-3">
                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg border border-primary/20">
                          {patient.name.split(" ").map((n) => n[0]).join("").substring(0, 2)}
                        </div>
                        <div>
                          <h3 className="font-bold text-foreground text-lg leading-tight">{patient.name}</h3>
                          <p className="text-sm text-muted-foreground">Age {patient.age || "--"} · ID: #{patient.id}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {getRiskBadge(patient.riskLevel)}
                        {patient.activeAlertCount > 0 && (
                          <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                            {patient.activeAlertCount} alert{patient.activeAlertCount > 1 ? "s" : ""}
                          </Badge>
                        )}
                        {isDataGap(patient, now) && (
                          <Badge className="h-5 px-1.5 text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 flex items-center gap-1">
                            <WifiOff className="h-2.5 w-2.5" /> Data Gap
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-auto bg-muted/30 p-3 rounded-xl border border-border/50">
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase text-muted-foreground font-semibold flex items-center">
                          <Heart className="w-3 h-3 mr-1 text-rose-500" /> Heart Rate
                        </span>
                        <span className="font-medium text-foreground">
                          {patient.latestVitals?.heartRate ? `${patient.latestVitals.heartRate} bpm` : "--"}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase text-muted-foreground font-semibold flex items-center">
                          <Activity className="w-3 h-3 mr-1 text-blue-500" /> Blood Press.
                        </span>
                        <span className="font-medium text-foreground">
                          {patient.latestVitals?.systolicBp ? `${patient.latestVitals.systolicBp}/${patient.latestVitals.diastolicBp}` : "--"}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase text-muted-foreground font-semibold flex items-center">
                          <Droplets className="w-3 h-3 mr-1 text-cyan-500" /> SpO2
                        </span>
                        <span className="font-medium text-foreground">
                          {patient.latestVitals?.spo2 ? `${patient.latestVitals.spo2}%` : "--"}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase text-muted-foreground font-semibold flex items-center">
                          <Thermometer className="w-3 h-3 mr-1 text-amber-500" /> Temp
                        </span>
                        <span className="font-medium text-foreground">
                          {patient.latestVitals?.temperature ? `${patient.latestVitals.temperature}°C` : "--"}
                        </span>
                      </div>
                    </div>
                    <div className="mt-4 text-xs text-muted-foreground flex justify-between items-center">
                      <span>Conditions: {patient.conditions?.length ? patient.conditions.join(", ") : "None listed"}</span>
                      {patient.lastSeen && (
                        <span>{formatDistanceToNow(new Date(patient.lastSeen), { addSuffix: true })}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-card rounded-2xl border border-border/50 border-dashed">
            <Users className="mx-auto h-12 w-12 text-muted-foreground/50 mb-3" />
            <h3 className="text-lg font-medium text-foreground">No patients found</h3>
            <p className="text-muted-foreground text-sm mt-1">Adjust your search or filter criteria.</p>
          </div>
        )}
      </div>

      {showModal && (
        <AddPatientModal
          onClose={() => setShowModal(false)}
          onApproved={() => {
            refetchPatients();
            fetchPendingCount();
          }}
        />
      )}
    </Layout>
  );
}
