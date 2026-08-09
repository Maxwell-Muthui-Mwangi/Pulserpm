import { useState, useEffect, useCallback } from "react";
import { Shield, RefreshCw, Filter, CheckCircle2, XCircle, AlertTriangle, Clock, User, Monitor, Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useTimezone } from "@/lib/timezone-context";
import { getAuthToken } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import Layout from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface AuditLog {
  id: number;
  timestamp: string;
  actorId: number | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  outcome: "success" | "failure" | "denied";
  details: string | null;
}

const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Login",
  "auth.login_failed": "Login Failed",
  "auth.signup": "Sign Up",
  "auth.dismiss_welcome": "Welcome Dismissed",
  "vitals.write": "Vitals Submitted",
  "vitals.read": "Vitals Viewed",
  "patient.read": "Patient Viewed",
  "patient.update": "Patient Updated",
  "patient.delete": "Patient Deleted",
  "alert.acknowledge": "Alert Acknowledged",
  "alert.resolve": "Alert Resolved",
  "thresholds.update": "Thresholds Updated",
  "admin.approve_patient": "Patient Approved",
  "device.ingest": "Device Sync",
};

const ACTION_COLORS: Record<string, string> = {
  "auth.login": "bg-sky-100 text-sky-800 border-sky-200",
  "auth.login_failed": "bg-red-100 text-red-800 border-red-200",
  "auth.signup": "bg-purple-100 text-purple-800 border-purple-200",
  "vitals.write": "bg-green-100 text-green-800 border-green-200",
  "vitals.read": "bg-slate-100 text-slate-700 border-slate-200",
  "patient.read": "bg-slate-100 text-slate-700 border-slate-200",
  "patient.update": "bg-amber-100 text-amber-800 border-amber-200",
  "patient.delete": "bg-red-100 text-red-800 border-red-200",
  "alert.acknowledge": "bg-amber-100 text-amber-800 border-amber-200",
  "alert.resolve": "bg-green-100 text-green-800 border-green-200",
  "thresholds.update": "bg-orange-100 text-orange-800 border-orange-200",
  "admin.approve_patient": "bg-emerald-100 text-emerald-800 border-emerald-200",
  "device.ingest": "bg-blue-100 text-blue-800 border-blue-200",
};

function OutcomeBadge({ outcome }: { outcome: string }) {
  if (outcome === "success") return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
      <CheckCircle2 className="h-3.5 w-3.5" /> Success
    </span>
  );
  if (outcome === "denied") return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
      <AlertTriangle className="h-3.5 w-3.5" /> Denied
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
      <XCircle className="h-3.5 w-3.5" /> Failed
    </span>
  );
}

function ActionBadge({ action }: { action: string }) {
  const label = ACTION_LABELS[action] ?? action;
  const color = ACTION_COLORS[action] ?? "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${color}`}>
      {label}
    </span>
  );
}

const LIMIT = 25;

export default function AuditLogPage() {
  const { user } = useAuth();
  const { fmt, abbr } = useTimezone();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [outcomeFilter, setOutcomeFilter] = useState("");
  const [actionSearch, setActionSearch] = useState("");
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchLogs = useCallback(async (off = offset) => {
    setLoading(true);
    const token = getAuthToken();
    const params = new URLSearchParams({ limit: String(LIMIT), offset: String(off) });
    if (outcomeFilter) params.set("outcome", outcomeFilter);
    if (actionSearch) params.set("action", actionSearch);
    try {
      const res = await fetch(`${API_BASE}/api/audit?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs ?? []);
        setTotal(data.total ?? 0);
        setLastRefresh(new Date());
      }
    } catch {}
    setLoading(false);
  }, [offset, outcomeFilter, actionSearch]);

  useEffect(() => {
    fetchLogs(offset);
  }, [offset, outcomeFilter]);

  useEffect(() => {
    setOffset(0);
  }, [outcomeFilter, actionSearch]);

  const successCount = logs.filter(l => l.outcome === "success").length;
  const failureCount = logs.filter(l => l.outcome === "failure").length;
  const deniedCount = logs.filter(l => l.outcome === "denied").length;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Shield className="h-4 w-4 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Security Audit Log</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Complete record of all data access and system events across PulseRPM.
              Last refreshed {formatDistanceToNow(lastRefresh, { addSuffix: true })}.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchLogs(offset)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-foreground">{total}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Total Events</div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-600">{successCount}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Successful (this page)</div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-red-600">{failureCount}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Failed (this page)</div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-amber-600">{deniedCount}</div>
              <div className="text-xs text-muted-foreground mt-0.5">Denied (this page)</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                <input
                  className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
                  placeholder="Search by action (login, vitals, patient…)"
                  value={actionSearch}
                  onChange={e => setActionSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { setOffset(0); fetchLogs(0); } }}
                />
              </div>
              <div className="flex items-center gap-2 border-l border-border pl-3">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <select
                  className="text-sm bg-transparent outline-none text-foreground"
                  value={outcomeFilter}
                  onChange={e => setOutcomeFilter(e.target.value)}
                >
                  <option value="">All outcomes</option>
                  <option value="success">Success</option>
                  <option value="failure">Failure</option>
                  <option value="denied">Denied</option>
                </select>
              </div>
              <Button size="sm" variant="outline" onClick={() => { setOffset(0); fetchLogs(0); }}>Apply</Button>
              {(outcomeFilter || actionSearch) && (
                <Button size="sm" variant="ghost" onClick={() => { setOutcomeFilter(""); setActionSearch(""); setOffset(0); }}>
                  Clear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Time</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actor</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Action</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Resource</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">IP Address</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {loading && (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-muted-foreground">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                      Loading events…
                    </td>
                  </tr>
                )}
                {!loading && logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-16 text-center">
                      <Shield className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                      <p className="text-sm font-medium text-foreground">No audit events yet</p>
                      <p className="text-xs text-muted-foreground mt-1">Events will appear here as users interact with the system.</p>
                    </td>
                  </tr>
                )}
                {!loading && logs.map(log => (
                  <tr key={log.id} className={`hover:bg-muted/30 transition-colors ${log.outcome === "failure" ? "bg-red-50/30" : log.outcome === "denied" ? "bg-amber-50/30" : ""}`}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                        <div>
                          <div className="font-medium text-foreground text-xs">{fmt(new Date(log.timestamp), "MMM d, HH:mm:ss")} <span className="text-muted-foreground/60">{abbr}</span></div>
                          <div className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                        <div>
                          <div className="text-xs font-medium text-foreground">{log.actorEmail ?? "System"}</div>
                          {log.actorRole && (
                            <span className={`text-[10px] capitalize ${log.actorRole === "provider" ? "text-primary" : "text-muted-foreground"}`}>
                              {log.actorRole}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ActionBadge action={log.action} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {log.resourceType ? (
                        <span className="capitalize">{log.resourceType}{log.resourceId ? ` #${log.resourceId}` : ""}</span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Monitor className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                        <span className="text-xs font-mono text-muted-foreground">{log.ipAddress ?? "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <OutcomeBadge outcome={log.outcome} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > LIMIT && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/40 bg-muted/20">
              <span className="text-xs text-muted-foreground">
                Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total} events
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>
                  Previous
                </Button>
                <Button size="sm" variant="outline" disabled={offset + LIMIT >= total} onClick={() => setOffset(offset + LIMIT)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* HIPAA note */}
        <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 border border-primary/15">
          <Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">HIPAA Audit Trail: </span>
            All access to patient data is recorded here in accordance with the HIPAA Security Rule (§164.312(b)) requirement for audit controls. 
            Records include the identity of the accessor, timestamp, data accessed, and the outcome. 
            This log is append-only and cannot be modified by any user.
          </p>
        </div>
      </div>
    </Layout>
  );
}
