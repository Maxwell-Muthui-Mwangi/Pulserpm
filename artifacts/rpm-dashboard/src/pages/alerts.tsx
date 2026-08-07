import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/layout";
import { useListAlerts, useAcknowledgeAlert, useResolveAlert, ListAlertsStatus } from "@workspace/api-client-react";
import { useRealtimeSync } from "@/lib/use-realtime-sync";
import { useAuth } from "@/lib/auth-context";
import { withAuth } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { AlertCircle, CheckCircle2, XCircle, Search, Filter, Loader2, ArrowRight } from "lucide-react";
import { Link } from "wouter";

export default function Alerts() {
  const [statusFilter, setStatusFilter] = useState<ListAlertsStatus>("active");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: alerts, isLoading, refetch } = useListAlerts(
    { status: statusFilter, limit: 100 }, 
    { request: withAuth(), query: { refetchInterval: 5_000, refetchIntervalInBackground: true } as any }
  );

  const ackAlert = useAcknowledgeAlert();
  const resAlert = useResolveAlert();

  const handleAction = (action: 'ack' | 'resolve', alertId: number) => {
    const mutation = action === 'ack' ? ackAlert : resAlert;
    mutation.mutate({ alertId }, {
      onSuccess: () => {
        toast({ title: `Alert ${action === 'ack' ? 'acknowledged' : 'resolved'}` });
        refetch();
      }
    });
  };

  const { isPatient, user } = useAuth();

  // Real-time SSE: new alerts surface instantly when vitals are ingested
  useRealtimeSync({
    userId: user?.id,
    onVitals: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
    },
    onReconnect: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
    },
  });

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">
            {isPatient ? "My Alerts" : "System Alerts"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isPatient 
              ? "Your personal health alerts and notifications." 
              : "Review and manage clinical alerts across all patients."}
          </p>
        </div>

        {/* Filters */}
        <div className="flex bg-card p-2 rounded-xl border border-border/50 shadow-sm w-fit">
          {(["active", "acknowledged", "resolved"] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status as ListAlertsStatus)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
                statusFilter === status 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        {/* Alerts List */}
        <Card className="border-border/50 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border/50">
                <tr>
                  <th className="px-6 py-4 font-medium">Severity</th>
                  {!isPatient && <th className="px-6 py-4 font-medium">Patient</th>}
                  <th className="px-6 py-4 font-medium">Alert Details</th>
                  <th className="px-6 py-4 font-medium">Time</th>
                  <th className="px-6 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={isPatient ? 4 : 5} className="px-6 py-20 text-center">
                      <Loader2 className="animate-spin h-6 w-6 text-primary mx-auto" />
                    </td>
                  </tr>
                ) : alerts && alerts.length > 0 ? (
                  alerts.map((alert) => (
                    <tr key={alert.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={alert.severity === 'critical' ? 'critical' : 'amber'} className="capitalize">
                          {isPatient && alert.severity === 'warning' ? 'average' : alert.severity}
                        </Badge>
                      </td>
                      {!isPatient && (
                        <td className="px-6 py-4">
                          <div className="font-medium text-foreground">{alert.patientName}</div>
                          <div className="text-xs text-muted-foreground">ID: #{alert.patientId}</div>
                        </td>
                      )}
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground">{alert.message}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          <span className="font-semibold">{(alert.vitalType ?? "").replace('_', ' ')}</span>: {alert.value} (Limit: {alert.threshold})
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                        {alert.triggeredAt && !isNaN(new Date(alert.triggeredAt).getTime()) ? format(new Date(alert.triggeredAt), 'MMM dd, h:mm a') : '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        {isPatient ? (
                          <span className="text-xs text-muted-foreground capitalize">{alert.status}</span>
                        ) : statusFilter === 'active' ? (
                          <div className="flex justify-end space-x-2">
                            <Button size="sm" variant="outline" onClick={() => handleAction('ack', alert.id)}>
                              Acknowledge
                            </Button>
                            <Button size="sm" onClick={() => handleAction('resolve', alert.id)} className="bg-success hover:bg-success/90">
                              Resolve
                            </Button>
                            <Button size="icon" variant="ghost" asChild>
                              <Link href={`/patients/${alert.patientId}`}><ArrowRight className="h-4 w-4" /></Link>
                            </Button>
                          </div>
                        ) : statusFilter === 'acknowledged' ? (
                          <div className="flex justify-end space-x-2">
                            <Button size="sm" onClick={() => handleAction('resolve', alert.id)} className="bg-success hover:bg-success/90">
                              Resolve
                            </Button>
                            <Button size="icon" variant="ghost" asChild>
                              <Link href={`/patients/${alert.patientId}`}><ArrowRight className="h-4 w-4" /></Link>
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="ghost" asChild>
                            <Link href={`/patients/${alert.patientId}`}>View Patient</Link>
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={isPatient ? 4 : 5} className="px-6 py-16 text-center text-muted-foreground">
                      <div className="flex flex-col items-center">
                        <CheckCircle2 className="h-10 w-10 text-success opacity-50 mb-3" />
                        <p>No {statusFilter} alerts found.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
