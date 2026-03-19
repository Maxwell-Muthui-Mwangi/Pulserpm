import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Search, Filter, Activity, Heart, Thermometer, Droplets, Users } from "lucide-react";
import { useListPatients, ListPatientsRiskLevel } from "@workspace/api-client-react";
import { withAuth } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import Layout from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

export default function Patients() {
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<ListPatientsRiskLevel | "all">("all");
  const { isPatient, user } = useAuth();
  const [, setLocation] = useLocation();

  // Patients should go directly to their own profile
  useEffect(() => {
    if (isPatient && user) {
      setLocation(`/patients/${user.id}`);
    }
  }, [isPatient, user, setLocation]);

  const { data: patients, isLoading } = useListPatients(
    { 
      search: search || undefined, 
      riskLevel: riskFilter !== "all" ? riskFilter : undefined 
    }, 
    { request: withAuth(), query: { enabled: !isPatient } as any }
  );

  const getRiskBadge = (level: string) => {
    switch (level) {
      case 'critical': return <Badge variant="critical">Critical</Badge>;
      case 'warning': return <Badge variant="amber">Warning</Badge>;
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
          <Button className="shrink-0 shadow-md">Add Patient</Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 bg-card p-4 rounded-2xl border border-border/50 shadow-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search by name or ID..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 border-border/50 bg-muted/30"
            />
          </div>
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-muted-foreground hidden sm:block" />
            <div className="flex bg-muted/50 rounded-lg p-1 border border-border/50 overflow-x-auto">
              {(["all", "critical", "warning", "normal"] as const).map((risk) => (
                <button
                  key={risk}
                  onClick={() => setRiskFilter(risk as any)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all capitalize whitespace-nowrap ${
                    riskFilter === risk 
                      ? "bg-card text-foreground shadow-sm" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
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
                <Card className={`cursor-pointer transition-all duration-300 hover:shadow-lg border-border/50 hover:border-primary/30 h-full flex flex-col ${patient.riskLevel === 'critical' ? 'ring-1 ring-destructive/20 border-destructive/20' : ''}`}>
                  <CardContent className="p-6 flex-1 flex flex-col">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center space-x-3">
                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg border border-primary/20">
                          {patient.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                        </div>
                        <div>
                          <h3 className="font-bold text-foreground text-lg leading-tight group-hover:text-primary transition-colors">{patient.name}</h3>
                          <p className="text-sm text-muted-foreground">Age {patient.age || '--'} · ID: #{patient.id}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {getRiskBadge(patient.riskLevel)}
                        {patient.activeAlertCount > 0 && (
                          <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                            {patient.activeAlertCount} alert{patient.activeAlertCount > 1 ? 's' : ''}
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
                          {patient.latestVitals?.heartRate ? `${patient.latestVitals.heartRate} bpm` : '--'}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase text-muted-foreground font-semibold flex items-center">
                          <Activity className="w-3 h-3 mr-1 text-blue-500" /> Blood Press.
                        </span>
                        <span className="font-medium text-foreground">
                          {patient.latestVitals?.systolicBp ? `${patient.latestVitals.systolicBp}/${patient.latestVitals.diastolicBp}` : '--'}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase text-muted-foreground font-semibold flex items-center">
                          <Droplets className="w-3 h-3 mr-1 text-cyan-500" /> SpO2
                        </span>
                        <span className="font-medium text-foreground">
                          {patient.latestVitals?.spo2 ? `${patient.latestVitals.spo2}%` : '--'}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase text-muted-foreground font-semibold flex items-center">
                          <Thermometer className="w-3 h-3 mr-1 text-amber-500" /> Temp
                        </span>
                        <span className="font-medium text-foreground">
                          {patient.latestVitals?.temperature ? `${patient.latestVitals.temperature}°C` : '--'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="mt-4 text-xs text-muted-foreground flex justify-between items-center">
                      <span>Conditions: {patient.conditions?.length ? patient.conditions.join(', ') : 'None listed'}</span>
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
    </Layout>
  );
}
