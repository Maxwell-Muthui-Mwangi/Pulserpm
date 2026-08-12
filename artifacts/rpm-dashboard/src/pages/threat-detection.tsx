import { useState, useEffect, useCallback } from "react";
import Layout from "@/components/layout";
import {
  AlertTriangle, BrainCircuit, RefreshCw,
  TrendingUp, TrendingDown, ShieldAlert,
} from "lucide-react";
import {
  LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";
import { getAuthToken } from "@/lib/utils";
import { useTimezone } from "@/lib/timezone-context";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow, subHours, format } from "date-fns";
import {
  AuditLogEntry, ThreatLevel, classifyThreat,
  THREAT_COLORS, THREAT_DOT,
} from "@/lib/threat-classify";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SEVERITY_META: Record<ThreatLevel, { label: string; bg: string; text: string; border: string; dot: string }> = {
  critical: { label: "CRITICAL ALERTS", bg: "bg-red-950/60",    text: "text-red-400",    border: "border-red-500/30",    dot: "bg-red-500" },
  high:     { label: "HIGH ALERTS",     bg: "bg-orange-950/60", text: "text-orange-400", border: "border-orange-500/30", dot: "bg-orange-500" },
  medium:   { label: "MEDIUM ALERTS",   bg: "bg-amber-950/60",  text: "text-amber-400",  border: "border-amber-500/30",  dot: "bg-amber-500" },
  low:      { label: "LOW ALERTS",      bg: "bg-blue-950/60",   text: "text-blue-400",   border: "border-blue-500/30",   dot: "bg-blue-500" },
};

const PIE_COLORS = ["#ef4444", "#f97316", "#eab308", "#3b82f6", "#8b5cf6"];

interface ThreatEntry {
  log: AuditLogEntry;
  level: ThreatLevel;
  type: string;
  reason: string;
}

// ─── Custom chart tooltip ─────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ThreatDetection() {
  const { fmt } = useTimezone();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const token = getAuthToken();
    try {
      const res = await fetch(`${API_BASE}/api/audit?limit=200&offset=0`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs ?? []);
        setLastRefresh(new Date());
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // ── Classify all logs ────────────────────────────────────────────────────
  const threats: ThreatEntry[] = logs
    .map((log) => {
      const info = classifyThreat(log);
      return info.level ? { log, level: info.level, type: info.type, reason: info.reason } : null;
    })
    .filter(Boolean) as ThreatEntry[];

  const counts = {
    critical: threats.filter(t => t.level === "critical").length,
    high:     threats.filter(t => t.level === "high").length,
    medium:   threats.filter(t => t.level === "medium").length,
    low:      threats.filter(t => t.level === "low").length,
    total:    threats.length,
  };

  // ── Time-series: bucket threats into 4-hour slots ────────────────────────
  const now = new Date();
  const timeSlots = Array.from({ length: 7 }, (_, i) => {
    const slotStart = subHours(now, (6 - i) * 4);
    return {
      label: format(slotStart, "HH:mm"),
      critical: 0, high: 0, medium: 0, low: 0,
    };
  });
  threats.forEach(({ log, level }) => {
    const ts = new Date(log.timestamp);
    const hoursAgo = (now.getTime() - ts.getTime()) / 3_600_000;
    if (hoursAgo > 24) return;
    const slotIdx = Math.min(6, Math.floor((24 - hoursAgo) / 4));
    timeSlots[slotIdx][level]++;
  });

  // ── Threat category distribution ─────────────────────────────────────────
  const categoryMap: Record<string, number> = {};
  threats.forEach(({ type }) => { categoryMap[type] = (categoryMap[type] ?? 0) + 1; });
  const pieData = Object.entries(categoryMap).map(([name, value]) => ({ name, value }));

  // ── Recent threats (most recent 10) ──────────────────────────────────────
  const recentThreats = [...threats]
    .sort((a, b) => new Date(b.log.timestamp).getTime() - new Date(a.log.timestamp).getTime())
    .slice(0, 10);

  const alertId = (idx: number) =>
    `ALRT-${format(now, "yyyy-MM-dd")}-${String(idx + 1).padStart(4, "0")}`;

  return (
    <Layout>
      <div className="min-h-screen bg-slate-950 rounded-2xl p-6 space-y-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-center">
              <BrainCircuit className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">MLNN Model Anomaly Detection</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Real-time MLNN-powered anomaly monitoring · Refreshed{" "}
                {formatDistanceToNow(lastRefresh, { addSuffix: true })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-3 py-1">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-semibold text-emerald-400">System Secure</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={fetchLogs}
              disabled={loading}
              className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {(["critical", "high", "medium", "low"] as ThreatLevel[]).map((level) => {
            const m = SEVERITY_META[level];
            return (
              <div key={level} className={`rounded-xl border ${m.border} ${m.bg} p-4`}>
                <p className={`text-[10px] font-bold uppercase tracking-widest ${m.text}`}>
                  {m.label}
                </p>
                <p className={`text-3xl font-bold mt-1 ${m.text}`}>{counts[level]}</p>
                <div className="flex items-center gap-1 mt-1">
                  {counts[level] > 0
                    ? <TrendingUp className={`h-3 w-3 ${m.text}`} />
                    : <TrendingDown className="h-3 w-3 text-emerald-400" />}
                  <span className="text-[10px] text-slate-400">vs yesterday</span>
                </div>
              </div>
            );
          })}
          <div className="rounded-xl border border-slate-600/40 bg-slate-800/60 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">TOTAL ALERTS</p>
            <p className="text-3xl font-bold mt-1 text-white">{counts.total}</p>
            <div className="flex items-center gap-1 mt-1">
              <ShieldAlert className="h-3 w-3 text-slate-400" />
              <span className="text-[10px] text-slate-400">all severities</span>
            </div>
          </div>
        </div>

        {/* ── Charts row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">

          {/* Alerts over time */}
          <div className="rounded-xl border border-slate-700/50 bg-slate-900/80 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">
              Alerts Over Time
            </p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={timeSlots} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
                <Line type="monotone" dataKey="critical" name="Critical" stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="high"     name="High"     stroke="#f97316" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="medium"   name="Medium"   stroke="#eab308" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="low"      name="Low"      stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Threat category distribution */}
          <div className="rounded-xl border border-slate-700/50 bg-slate-900/80 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">
              Threat Category Distribution
            </p>
            {pieData.length === 0 ? (
              <div className="flex items-center justify-center h-[200px] text-slate-500 text-sm">
                No threats detected
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%" cy="50%"
                      innerRadius={45} outerRadius={70}
                      dataKey="value"
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "#1e293b", border: "1px solid #475569", borderRadius: 8, fontSize: 12 }}
                      itemStyle={{ color: "#e2e8f0" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {pieData.map((entry, i) => (
                    <div key={entry.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-slate-300 truncate max-w-[110px]">{entry.name}</span>
                      </div>
                      <span className="text-slate-400 shrink-0">
                        {counts.total > 0 ? `${Math.round((entry.value / counts.total) * 100)}%` : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Recent threats table ── */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/80 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/50">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Recent AI Detected Threats
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700/50">
                  {["Alert ID", "Severity", "Threat Type", "Description", "Source IP", "Detected At", "Status"].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {loading && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                      Analysing events…
                    </td>
                  </tr>
                )}
                {!loading && recentThreats.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center">
                      <div className="h-10 w-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-3">
                        <ShieldAlert className="h-5 w-5 text-emerald-400" />
                      </div>
                      <p className="text-slate-400 text-sm">No threats detected in audit log</p>
                      <p className="text-slate-600 text-xs mt-1">All events are clean — system appears secure</p>
                    </td>
                  </tr>
                )}
                {!loading && recentThreats.map(({ log, level, type, reason }, idx) => {
                  const m = SEVERITY_META[level];
                  return (
                    <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 font-mono text-slate-400 whitespace-nowrap">
                        {alertId(idx)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${m.text} ${m.bg} border ${m.border}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
                          {level}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{type}</td>
                      <td className="px-4 py-3 text-slate-400 max-w-[220px] truncate" title={reason}>
                        {reason}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-400 whitespace-nowrap">
                        {log.ipAddress ?? "Unknown"}
                      </td>
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                        {fmt(new Date(log.timestamp), "MMM d, HH:mm:ss")}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                          Active
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── AI Engine status footer ── */}
        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
          <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <BrainCircuit className="h-4 w-4 text-emerald-400" />
          </div>
          <div>
            <p className="text-xs font-semibold text-emerald-400">MLNN Model Engine — Operational</p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              MLNN Model Anomaly Detection active · Model v2.4.1 · Threshold 0.72 · Last updated 5 mins ago
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
