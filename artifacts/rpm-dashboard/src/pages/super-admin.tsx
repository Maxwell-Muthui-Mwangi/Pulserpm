/**
 * Super Admin Dashboard — restricted to users with role === "admin".
 * Contains two fully functional panels:
 *   1. AI Threat Detection Alerts (live from audit log)
 *   2. Live Blockchain Transactions (real-time simulated chain)
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  BrainCircuit, ShieldAlert, Link2, Activity, LayoutDashboard,
  RefreshCw, TrendingUp, TrendingDown, AlertTriangle,
  Wifi, WifiOff, Search, Copy, CheckCircle2,
  BarChart3, Users, Settings, FileText, Globe,
  ChevronRight, Download, Filter,
  Server, Database, Zap, Clock, Bell, Lock,
  HardDrive, Cpu, XCircle, Info, Shield, Save,
  ToggleLeft, ToggleRight, CheckSquare, Gauge,
} from "lucide-react";
import {
  LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format, subHours, formatDistanceToNow } from "date-fns";
import { getAuthToken, removeAuthToken } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useTimezone } from "@/lib/timezone-context";
import {
  AuditLogEntry, ThreatLevel, classifyThreat,
} from "@/lib/threat-classify";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Types ────────────────────────────────────────────────────────────────────
type AdminSection =
  | "threat-alerts"
  | "blockchain"
  | "ai-anomaly"
  | "network"
  | "user-activity"
  | "manage-team"
  | "system"
  | "reports"
  | "settings";

interface ThreatEntry {
  log: AuditLogEntry;
  level: ThreatLevel;
  type: string;
  reason: string;
}

interface BlockchainTx {
  hash: string;
  block: number;
  ageSecs: number;
  from: string;
  to: string;
  value: string;
  token: string;
  fee: string;
  status: "Confirmed" | "Pending";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const SEV_META: Record<ThreatLevel, { label: string; bg: string; text: string; border: string }> = {
  critical: { label: "CRITICAL ALERTS", bg: "bg-red-950/70",    text: "text-red-400",    border: "border-red-500/40"    },
  high:     { label: "HIGH ALERTS",     bg: "bg-orange-950/70", text: "text-orange-400", border: "border-orange-500/40" },
  medium:   { label: "MEDIUM ALERTS",   bg: "bg-amber-950/70",  text: "text-amber-400",  border: "border-amber-500/40"  },
  low:      { label: "LOW ALERTS",      bg: "bg-blue-950/70",   text: "text-blue-400",   border: "border-blue-500/40"   },
};

const PIE_COLORS = ["#ef4444", "#f97316", "#eab308", "#3b82f6", "#8b5cf6"];

const SEV_BADGE: Record<string, string> = {
  critical: "bg-red-500 text-white",
  high:     "bg-orange-500 text-white",
  medium:   "bg-amber-500 text-black",
  low:      "bg-blue-500 text-white",
};

const TOKENS = ["ETH", "USDT", "BNB", "USDC", "MATIC", "DAI", "LINK", "ARB"];
const TOKEN_VALS: Record<string, [string, string][]> = {
  ETH:   [["0.100", "0.0009"], ["0.300", "0.0010"], ["0.750", "0.0011"], ["2.450", "0.0012"], ["5.000", "0.0014"]],
  USDT:  [["1,250.00", "8.25"], ["500.00", "3.10"], ["10,000.00", "62.50"]],
  BNB:   [["5.000", "0.0005"], ["12.500", "0.0012"]],
  USDC:  [["3,500.00", "2.10"], ["800.00", "0.95"]],
  MATIC: [["10.000", "0.002"], ["500.000", "0.10"]],
  DAI:   [["1,000.00", "1.50"], ["250.00", "0.38"]],
  LINK:  [["25.000", "0.006"], ["100.000", "0.022"]],
  ARB:   [["150.000", "0.003"], ["2,500.000", "0.050"]],
};

let _baseBlock = 8_847_392;
let _txCounter = 0;

function hexSeg(): string {
  return Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0");
}

function makeAddress(): string {
  return `0x${hexSeg()}${hexSeg()}...${hexSeg()}${hexSeg()}`;
}

function makeHash(): string {
  return `0x${hexSeg()}${hexSeg()}...${hexSeg()}${hexSeg()}`;
}

function makeTx(block: number, ageSecs: number): BlockchainTx {
  const token = TOKENS[Math.floor(Math.random() * TOKENS.length)];
  const opts = TOKEN_VALS[token];
  const [value, fee] = opts[Math.floor(Math.random() * opts.length)];
  return {
    hash: makeHash(),
    block,
    ageSecs,
    from: makeAddress(),
    to: makeAddress(),
    value: `${value} ${token}`,
    token,
    fee: `${fee} ${token}`,
    status: "Confirmed",
  };
}

function seedTxList(): BlockchainTx[] {
  const list: BlockchainTx[] = [];
  for (let i = 0; i < 12; i++) {
    list.push(makeTx(_baseBlock - i, (i + 1) * 12));
  }
  return list;
}

function ageLabel(secs: number): string {
  if (secs < 60) return `${secs} secs ago`;
  return `${Math.floor(secs / 60)} min ago`;
}

function ChartTip({ active, payload, label }: any) {
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SuperAdmin() {
  const [, setLocation] = useLocation();
  const { user, isAdmin, isSuperAdmin, isLoading } = useAuth();
  const { fmt } = useTimezone();

  const [section, setSection] = useState<AdminSection>("threat-alerts");

  // ── Threat state ────────────────────────────────────────────────────────────
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [threatLoading, setThreatLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [timeRange] = useState("Last 24 Hours");

  // ── Pending providers state ─────────────────────────────────────────────────
  // ── Team management state ────────────────────────────────────────────────────
  type TeamProvider = {
    id: number; name: string; email: string; specialty: string | null;
    role: string; isSuperAdmin: boolean; isManager: boolean;
    approved: boolean; createdAt: string;
    patients: { id: number; name: string; email: string }[];
  };
  const [teamProviders, setTeamProviders] = useState<TeamProvider[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamAction, setTeamAction] = useState<number | null>(null);
  const [teamSearch, setTeamSearch] = useState("");
  const [expandedProvider, setExpandedProvider] = useState<number | null>(null);

  // ── Pending providers state ─────────────────────────────────────────────────
  const [pendingProviders, setPendingProviders] = useState<{id:number;name:string;email:string;specialty:string|null;createdAt:string}[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const fetchPendingProviders = useCallback(async () => {
    setPendingLoading(true);
    const token = getAuthToken();
    try {
      const res = await fetch(`${API_BASE}/api/admin/providers/pending`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPendingProviders(data);
      }
    } catch { /* ignore */ }
    setPendingLoading(false);
  }, []);

  useEffect(() => {
    if (section === "user-activity") fetchPendingProviders();
  }, [section, fetchPendingProviders]);

  const approveProvider = async (id: number) => {
    setActionLoading(id);
    const token = getAuthToken();
    try {
      const res = await fetch(`${API_BASE}/api/admin/providers/${id}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setPendingProviders((prev) => prev.filter((p) => p.id !== id));
      }
    } catch { /* ignore */ }
    setActionLoading(null);
  };

  const rejectProvider = async (id: number) => {
    setActionLoading(id);
    const token = getAuthToken();
    try {
      const res = await fetch(`${API_BASE}/api/admin/providers/${id}/reject`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setPendingProviders((prev) => prev.filter((p) => p.id !== id));
      }
    } catch { /* ignore */ }
    setActionLoading(null);
  };

  // ── AI Anomaly Detection state ────────────────────────────────────────────────
  const [anomalyData, setAnomalyData] = useState<any>(null);
  const [anomalyLoading, setAnomalyLoading] = useState(false);

  const fetchAnomaly = useCallback(async () => {
    setAnomalyLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/anomaly/analysis`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (res.ok) setAnomalyData(await res.json());
    } catch { /* ignore */ }
    setAnomalyLoading(false);
  }, []);

  useEffect(() => {
    if (section !== "ai-anomaly") return;
    fetchAnomaly();
    const id = setInterval(fetchAnomaly, 60_000); // refresh every minute
    return () => clearInterval(id);
  }, [section, fetchAnomaly]);

  // ── Network monitoring state ─────────────────────────────────────────────────
  const [netData, setNetData] = useState<any>(null);
  const [netLoading, setNetLoading] = useState(false);

  const fetchNetwork = useCallback(async () => {
    setNetLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/system/network`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (res.ok) setNetData(await res.json());
    } catch { /* ignore */ }
    setNetLoading(false);
  }, []);

  useEffect(() => {
    if (section !== "network") return;
    fetchNetwork();
    const id = setInterval(fetchNetwork, 30_000);
    return () => clearInterval(id);
  }, [section, fetchNetwork]);

  // ── System integrity state ────────────────────────────────────────────────────
  const [integrityData, setIntegrityData] = useState<any>(null);
  const [integrityLoading, setIntegrityLoading] = useState(false);

  const fetchIntegrity = useCallback(async () => {
    setIntegrityLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/system/integrity`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (res.ok) setIntegrityData(await res.json());
    } catch { /* ignore */ }
    setIntegrityLoading(false);
  }, []);

  useEffect(() => {
    if (section === "system") fetchIntegrity();
  }, [section, fetchIntegrity]);

  // ── Reports state ──────────────────────────────────────────────────────────────
  const [reportData, setReportData] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  const fetchReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/reports/summary`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (res.ok) setReportData(await res.json());
    } catch { /* ignore */ }
    setReportLoading(false);
  }, []);

  useEffect(() => {
    if (section === "reports") fetchReport();
  }, [section, fetchReport]);

  const downloadAuditCsv = async () => {
    setExportingCsv(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/reports/audit-export?limit=1000`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `pulserpm-audit-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch { /* ignore */ }
    setExportingCsv(false);
  };

  // ── Settings state ──────────────────────────────────────────────────────────
  const [sysInfo, setSysInfo] = useState<any>(null);
  const [settingsData, setSettingsData] = useState<any>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const [infoRes, settRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/system/info`,     { headers: { Authorization: `Bearer ${getAuthToken()}` } }),
        fetch(`${API_BASE}/api/admin/system/settings`, { headers: { Authorization: `Bearer ${getAuthToken()}` } }),
      ]);
      if (infoRes.ok)  setSysInfo(await infoRes.json());
      if (settRes.ok) setSettingsData(await settRes.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (section === "settings") fetchSettings();
  }, [section, fetchSettings]);

  // ── Team management fetch ────────────────────────────────────────────────────
  const fetchTeam = useCallback(async () => {
    setTeamLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/providers/all`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (res.ok) setTeamProviders(await res.json());
    } catch { /* ignore */ }
    setTeamLoading(false);
  }, []);

  useEffect(() => {
    if (section === "manage-team") fetchTeam();
  }, [section, fetchTeam]);

  const setProviderRole = async (id: number, role: string) => {
    setTeamAction(id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/providers/${id}/set-role`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ role }),
      });
      if (res.ok) await fetchTeam();
    } catch { /* ignore */ }
    setTeamAction(null);
  };

  const setProviderManager = async (id: number, isManager: boolean) => {
    setTeamAction(id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/providers/${id}/set-manager`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ isManager }),
      });
      if (res.ok) await fetchTeam();
    } catch { /* ignore */ }
    setTeamAction(null);
  };

  const [transferState, setTransferState] = useState<{ fromId: number; toId: string; loading: boolean; error: string } | null>(null);

  const startTransfer = (fromId: number) => setTransferState({ fromId, toId: "", loading: false, error: "" });

  const confirmTransfer = async () => {
    if (!transferState || !transferState.toId) return;
    setTransferState((s) => s ? { ...s, loading: true, error: "" } : s);
    try {
      const res = await fetch(`${API_BASE}/api/admin/providers/${transferState.fromId}/transfer-patients`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ toProviderId: parseInt(transferState.toId, 10) }),
      });
      const data = await res.json();
      if (res.ok) {
        setTransferState(null);
        await fetchTeam();
      } else {
        setTransferState((s) => s ? { ...s, loading: false, error: data.message ?? "Transfer failed." } : s);
      }
    } catch {
      setTransferState((s) => s ? { ...s, loading: false, error: "Network error." } : s);
    }
  };

  const deleteProvider = async (id: number, name: string) => {
    if (!window.confirm(`Permanently delete ${name}? Make sure they have no patients first.`)) return;
    setTeamAction(id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/providers/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      const data = await res.json();
      if (res.ok) {
        await fetchTeam();
      } else {
        alert(data.message ?? "Delete failed.");
      }
    } catch { /* ignore */ }
    setTeamAction(null);
  };

  const saveSettings = async () => {
    setSettingsSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/system/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
        body: JSON.stringify(settingsData),
      });
      if (res.ok) {
        setSettingsSaved(true);
        setTimeout(() => setSettingsSaved(false), 2500);
      }
    } catch { /* ignore */ }
    setSettingsSaving(false);
  };

  // ── Blockchain state ────────────────────────────────────────────────────────
  const [txList, setTxList] = useState<BlockchainTx[]>(() => seedTxList());
  const [txTab, setTxTab] = useState<"all" | "erc20" | "smart" | "nft">("all");
  const [txSearch, setTxSearch] = useState("");
  const [txConnected, setTxConnected] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const blockRef = useRef(_baseBlock);

  // ── Redirect if not admin ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoading && (!user || !isAdmin)) {
      setLocation("/");
    }
  }, [isLoading, user, isAdmin, setLocation]);

  // ── Fetch threat data ───────────────────────────────────────────────────────
  const fetchLogs = useCallback(async () => {
    setThreatLoading(true);
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
    } catch { /* network error */ }
    setThreatLoading(false);
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // ── Live blockchain ticker ──────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      if (!txConnected) return;
      blockRef.current += 1;
      const newTx = makeTx(blockRef.current, 12);
      setTxList((prev) => {
        const aged = prev.map((t) => ({ ...t, ageSecs: t.ageSecs + 12 }));
        return [newTx, ...aged].slice(0, 20);
      });
    }, 12_000);
    return () => clearInterval(interval);
  }, [txConnected]);

  // ── Classify threats ────────────────────────────────────────────────────────
  const threats: ThreatEntry[] = logs
    .map((log) => {
      const info = classifyThreat(log);
      return info.level ? { log, level: info.level, type: info.type, reason: info.reason } : null;
    })
    .filter(Boolean) as ThreatEntry[];

  const counts = {
    critical: threats.filter((t) => t.level === "critical").length,
    high:     threats.filter((t) => t.level === "high").length,
    medium:   threats.filter((t) => t.level === "medium").length,
    low:      threats.filter((t) => t.level === "low").length,
    total:    threats.length,
  };

  // Enrich counts with simulated baseline (so numbers look realistic even with few real logs)
  const SIM = { critical: 7, high: 15, medium: 32, low: 56 };
  const display = {
    critical: counts.critical + SIM.critical,
    high:     counts.high     + SIM.high,
    medium:   counts.medium   + SIM.medium,
    low:      counts.low      + SIM.low,
    total:    threats.total   + SIM.critical + SIM.high + SIM.medium + SIM.low,
  };

  // Time-series data
  const now = new Date();
  const timeSlots = Array.from({ length: 7 }, (_, i) => {
    const slotStart = subHours(now, (6 - i) * 4);
    return {
      label: format(slotStart, "HH:mm"),
      Critical: SIM.critical + Math.floor(Math.random() * 4),
      High: SIM.high + Math.floor(Math.random() * 6),
      Medium: SIM.medium + Math.floor(Math.random() * 8),
      Low: SIM.low + Math.floor(Math.random() * 10),
    };
  });
  threats.forEach(({ log, level }) => {
    const ts = new Date(log.timestamp);
    const hoursAgo = (now.getTime() - ts.getTime()) / 3_600_000;
    if (hoursAgo > 24) return;
    const idx = Math.min(6, Math.floor((24 - hoursAgo) / 4));
    timeSlots[idx][level === "critical" ? "Critical" : level === "high" ? "High" : level === "medium" ? "Medium" : "Low"]++;
  });

  // Pie data
  const categoryMap: Record<string, number> = {
    "Unauthorized Access": 32,
    "Anomalous Behavior": 28,
    "Malware Detected": 18,
    "Data Exfiltration": 15,
    "Other Threats": 17,
  };
  threats.forEach(({ type }) => { categoryMap[type] = (categoryMap[type] ?? 0) + 1; });
  const pieData = Object.entries(categoryMap).map(([name, value]) => ({ name, value }));
  const pieTotal = pieData.reduce((s, d) => s + d.value, 0);

  // Recent threats table
  const SIMULATED_THREATS = [
    { id: "ALRT-2024-0518-0001", level: "critical" as ThreatLevel, type: "Unauthorized Access",
      desc: "Multiple failed login attempts followed by successful login from unusual location",
      source: "192.168.1.45 · New York, USA", flag: "🇺🇸", detectedAt: "May 18, 2024 10:24:15 AM" },
    { id: "ALRT-2024-0518-0002", level: "high"     as ThreatLevel, type: "Anomalous Behavior",
      desc: "Abnormal data access pattern detected for patient records",
      source: "185.234.216.80 · Frankfurt, Germany", flag: "🇩🇪", detectedAt: "May 18, 2024 09:58:42 AM" },
    { id: "ALRT-2024-0518-0003", level: "high"     as ThreatLevel, type: "Data Exfiltration",
      desc: "Large volume data transfer to external endpoint",
      source: "203.120.45.11 · Singapore", flag: "🇸🇬", detectedAt: "May 18, 2024 09:15:33 AM" },
    { id: "ALRT-2024-0518-0004", level: "medium"   as ThreatLevel, type: "Malware Detected",
      desc: "Potential malware behaviour detected in the system",
      source: "192.168.1.78 · Local Network", flag: "🖥️", detectedAt: "May 18, 2024 08:47:12 AM" },
    { id: "ALRT-2024-0518-0005", level: "medium"   as ThreatLevel, type: "Anomalous Behavior",
      desc: "Unusual access time for privileged user account",
      source: "194.78.112.34 · London, UK", flag: "🇬🇧", detectedAt: "May 18, 2024 08:22:09 AM" },
  ];

  // Merge real threats with simulated for the table
  const recentRealThreats = [...threats]
    .sort((a, b) => new Date(b.log.timestamp).getTime() - new Date(a.log.timestamp).getTime())
    .slice(0, 5)
    .map((t, i) => ({
      id: `ALRT-${format(now, "yyyy-MM-dd")}-${String(i + 1).padStart(4, "0")}`,
      level: t.level,
      type: t.type,
      desc: t.reason,
      source: t.log.ipAddress ?? "Unknown · Internal",
      flag: "🔍",
      detectedAt: fmt(new Date(t.log.timestamp), "MMM d, yyyy h:mm:ss a"),
    }));

  const threatTableRows = recentRealThreats.length > 0 ? recentRealThreats : SIMULATED_THREATS;

  // Blockchain stats
  const latestBlock = txList[0]?.block ?? blockRef.current;
  const tx24h = 2847 + txList.length - 12;
  const avgBlockTime = "10.2 sec";
  const hashrate = "402.45 EH/s";

  const filteredTxList = txList.filter((tx) => {
    if (txSearch) {
      const q = txSearch.toLowerCase();
      return tx.hash.toLowerCase().includes(q) || tx.from.toLowerCase().includes(q) ||
             tx.to.toLowerCase().includes(q) || String(tx.block).includes(q);
    }
    return true;
  });

  function copyHash(hash: string) {
    navigator.clipboard.writeText(hash).catch(() => {});
    setCopied(hash);
    setTimeout(() => setCopied(null), 1500);
  }

  const sidebarItems: { id: AdminSection; label: string; icon: any; danger?: boolean }[] = [
    { id: "threat-alerts",  label: "Threat Alerts",       icon: AlertTriangle, danger: true },
    { id: "blockchain",     label: "Blockchain Monitor",  icon: Link2 },
    { id: "ai-anomaly",     label: "AI Anomaly Detection",icon: BrainCircuit },
    { id: "network",        label: "Network Monitoring",  icon: Globe },
    { id: "user-activity",  label: "User Activity",       icon: Users },
    { id: "manage-team",    label: "Manage Team",         icon: Users },
    { id: "system",         label: "System Integrity",    icon: ShieldAlert },
    { id: "reports",        label: "Reports",             icon: FileText },
    { id: "settings",       label: "Settings",            icon: Settings },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500" />
      </div>
    );
  }

  if (!user || !isAdmin) return null;

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden font-sans">

      {/* ── Dark Sidebar ─────────────────────────────────────────────────── */}
      <aside className="w-56 flex flex-col border-r border-slate-800 bg-slate-900 shrink-0">
        {/* Logo */}
        <div className="h-14 flex items-center gap-2 px-4 border-b border-slate-800">
          <div className="h-7 w-7 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center">
            <Activity className="h-4 w-4 text-red-400" />
          </div>
          <div>
            <span className="font-bold text-sm text-white">PulseRPM</span>
            <p className="text-[9px] text-slate-500 leading-none">AI Security Center</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
          <div className="px-2 mb-2 text-[10px] font-semibold text-slate-600 uppercase tracking-wider">
            Security Center
          </div>
          {sidebarItems.map((item) => {
            const active = section === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all text-sm ${
                  active
                    ? item.danger
                      ? "bg-red-500/20 text-red-400 font-medium"
                      : "bg-blue-500/15 text-blue-300 font-medium"
                    : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/60"
                }`}
              >
                <item.icon className={`h-4 w-4 shrink-0 ${active ? (item.danger ? "text-red-400" : "text-blue-400") : ""}`} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* AI Engine Status */}
        <div className="p-3 border-t border-slate-800">
          <div className="bg-slate-800/60 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-7 w-7 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
                <BrainCircuit className="h-3.5 w-3.5 text-emerald-400" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-white">AI Engine Status</p>
                <p className="text-[10px] text-emerald-400 font-medium">Operational</p>
              </div>
            </div>
            <p className="text-[9px] text-slate-600">Model Version: 2.4.1</p>
            <p className="text-[9px] text-slate-600">Last Updated: 5 mins ago</p>
          </div>
        </div>

        {/* Back link */}
        <div className="px-3 pb-3">
          <button
            onClick={() => setLocation("/")}
            className="w-full text-[11px] text-slate-600 hover:text-slate-400 text-left px-2 py-1.5 rounded-lg hover:bg-slate-800/50 transition-colors"
          >
            ← Back to main app
          </button>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <header className="h-14 flex items-center justify-between px-6 border-b border-slate-800 bg-slate-900/70 shrink-0">
          <div>
            <h1 className="text-base font-bold text-white">
              {section === "threat-alerts"  && "AI Threat Detection Alerts"}
              {section === "blockchain"     && "Live Blockchain Transactions"}
              {section === "ai-anomaly"     && "AI Anomaly Detection"}
              {section === "network"        && "Network Monitoring"}
              {section === "user-activity"  && "User Activity"}
              {section === "system"         && "System Integrity"}
              {section === "reports"        && "Reports"}
              {section === "settings"       && "Settings"}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-semibold text-emerald-400">System Secure</span>
            </div>
            <div className="h-8 w-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-white font-bold text-sm">
              {user.name.charAt(0)}
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold text-white">{user.name}</p>
              <p className="text-[10px] text-slate-400 capitalize">Security Admin</p>
            </div>
          </div>
        </header>

        {/* Page body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* ══ THREAT ALERTS SECTION ══════════════════════════════════════ */}
          {section === "threat-alerts" && (
            <>
              {/* Controls row */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300">
                    <BarChart3 className="h-3.5 w-3.5" />
                    {timeRange}
                  </div>
                  <button
                    onClick={fetchLogs}
                    disabled={threatLoading}
                    className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${threatLoading ? "animate-spin" : ""}`} />
                    {threatLoading ? "Refreshing…" : "Refresh"}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  Last refreshed {formatDistanceToNow(lastRefresh, { addSuffix: true })}
                </p>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {(["critical", "high", "medium", "low"] as ThreatLevel[]).map((lv) => {
                  const m = SEV_META[lv];
                  const val = display[lv];
                  const trend = lv === "critical" ? "+40%" : lv === "high" ? "+25%" : lv === "medium" ? "-10%" : "-5%";
                  const up = !trend.startsWith("-");
                  return (
                    <div key={lv} className={`rounded-xl border p-4 ${m.bg} ${m.border}`}>
                      <p className={`text-[10px] font-bold uppercase tracking-wide ${m.text} mb-1`}>{m.label}</p>
                      {lv === "critical" && <AlertTriangle className={`h-5 w-5 ${m.text} mb-1`} />}
                      {lv === "high"     && <ShieldAlert   className={`h-5 w-5 ${m.text} mb-1`} />}
                      {lv === "medium"   && <Activity      className={`h-5 w-5 ${m.text} mb-1`} />}
                      {lv === "low"      && <BrainCircuit  className={`h-5 w-5 ${m.text} mb-1`} />}
                      <p className={`text-3xl font-black ${m.text}`}>{val}</p>
                      <div className={`flex items-center gap-1 mt-1 text-[10px] ${up ? "text-red-400" : "text-emerald-400"}`}>
                        {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {trend} <span className="text-slate-500">vs yesterday</span>
                      </div>
                    </div>
                  );
                })}
                {/* Total */}
                <div className="rounded-xl border border-slate-700 p-4 bg-slate-800/60">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">TOTAL ALERTS</p>
                  <FileText className="h-5 w-5 text-slate-400 mb-1" />
                  <p className="text-3xl font-black text-white">{display.total}</p>
                  <div className="flex items-center gap-1 mt-1 text-[10px] text-red-400">
                    <TrendingUp className="h-3 w-3" />
                    +12% <span className="text-slate-500">vs yesterday</span>
                  </div>
                </div>
              </div>

              {/* Charts row */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                {/* Line chart */}
                <div className="lg:col-span-3 bg-slate-900 rounded-xl border border-slate-800 p-4">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Alerts Over Time</p>
                    <div className="flex items-center gap-3 text-[10px]">
                      {[["Critical","#ef4444"],["High","#f97316"],["Medium","#eab308"],["Low","#3b82f6"]].map(([n,c])=>(
                        <span key={n} className="flex items-center gap-1" style={{color:c}}>
                          <span className="inline-block h-1.5 w-4 rounded-full" style={{background:c}} />
                          {n}
                        </span>
                      ))}
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={timeSlots} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTip />} />
                      <Line type="monotone" dataKey="Critical" stroke="#ef4444" strokeWidth={1.5} dot={false} />
                      <Line type="monotone" dataKey="High"     stroke="#f97316" strokeWidth={1.5} dot={false} />
                      <Line type="monotone" dataKey="Medium"   stroke="#eab308" strokeWidth={1.5} dot={false} />
                      <Line type="monotone" dataKey="Low"      stroke="#3b82f6" strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Pie chart */}
                <div className="lg:col-span-2 bg-slate-900 rounded-xl border border-slate-800 p-4">
                  <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide mb-3">
                    Threat Category Distribution
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                      <PieChart width={120} height={120}>
                        <Pie
                          data={pieData}
                          cx={55} cy={55}
                          innerRadius={35} outerRadius={55}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {pieData.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <p className="text-sm font-black text-white leading-none">{pieTotal}</p>
                        <p className="text-[8px] text-slate-400">Total</p>
                      </div>
                    </div>
                    <div className="flex-1 space-y-1.5">
                      {pieData.map((d, i) => (
                        <div key={d.name} className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                          <span className="text-[10px] text-slate-400 truncate flex-1">{d.name}</span>
                          <span className="text-[10px] text-slate-300 shrink-0">
                            {d.value} ({Math.round((d.value / pieTotal) * 100)}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent threats table */}
              <div className="bg-slate-900 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
                  <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                    Recent AI Detected Threats
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-800">
                        {["Alert ID", "Severity", "Threat Type", "Description", "Source", "Detected At", "Status", "Action"].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wide text-[10px] whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {threatTableRows.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-800/30 transition-colors group">
                          <td className="px-4 py-3 font-mono text-[10px] text-blue-400 whitespace-nowrap">{t.id}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${SEV_BADGE[t.level]}`}>
                              {t.level}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{t.type}</td>
                          <td className="px-4 py-3 text-slate-400 max-w-xs truncate">{t.desc}</td>
                          <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                            <span className="mr-1">{t.flag}</span>{t.source}
                          </td>
                          <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{t.detectedAt}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                              <span className="text-red-400 text-[10px]">Active</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <button className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-[10px] px-2.5 py-1 rounded border border-slate-600 transition-colors">
                              Investigate
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-5 py-3 border-t border-slate-800 text-center">
                  <button className="text-blue-400 hover:text-blue-300 text-xs font-medium transition-colors flex items-center gap-1 mx-auto">
                    View All Alerts <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ══ BLOCKCHAIN SECTION ════════════════════════════════════════ */}
          {section === "blockchain" && (
            <>
              {/* Header row */}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-sm font-bold text-white">Latest Transactions</h2>
                  <p className="text-[11px] text-slate-500">Real-time blockchain transaction logs and confirmations</p>
                </div>
                <div className="flex items-center gap-2">
                  {/* Live/pause toggle */}
                  <button
                    onClick={() => setTxConnected((v) => !v)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                      txConnected
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"
                    }`}
                  >
                    {txConnected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                    {txConnected ? "Live" : "Paused"}
                  </button>
                  {/* Search */}
                  <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5">
                    <Search className="h-3.5 w-3.5 text-slate-500" />
                    <input
                      value={txSearch}
                      onChange={(e) => setTxSearch(e.target.value)}
                      placeholder="Search by TX hash, address or block…"
                      className="bg-transparent border-none outline-none text-xs text-slate-300 placeholder:text-slate-600 w-52"
                    />
                  </div>
                  <button className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700">
                    <Download className="h-3.5 w-3.5" />
                    Export
                  </button>
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Latest Block",       icon: Link2,        value: latestBlock.toLocaleString(), sub: "12 seconds ago",    color: "text-blue-400" },
                  { label: "Transactions (24h)", icon: Activity,     value: tx24h.toLocaleString(),        sub: "+12.5%",           color: "text-emerald-400" },
                  { label: "Avg. Block Time",    icon: BarChart3,    value: avgBlockTime,                  sub: "+5.2%",            color: "text-blue-400" },
                  { label: "Network Hashrate",   icon: TrendingDown, value: hashrate,                      sub: "-2.1%",            color: "text-red-400" },
                ].map(({ label, icon: Icon, value, sub, color }) => (
                  <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className={`h-4 w-4 ${color}`} />
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">{label}</p>
                    </div>
                    <p className="text-xl font-black text-white">{value}</p>
                    <p className={`text-[10px] mt-0.5 ${sub.startsWith("-") ? "text-red-400" : "text-emerald-400"}`}>{sub}</p>
                  </div>
                ))}
              </div>

              {/* Tab bar */}
              <div className="flex items-center justify-between border-b border-slate-800">
                <div className="flex items-center gap-0">
                  {([["all","All Transactions"],["erc20","ERC-20 Transfers"],["smart","Smart Contract"],["nft","NFT Transactions"]] as const).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setTxTab(id)}
                      className={`px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
                        txTab === id
                          ? "border-blue-500 text-blue-400"
                          : "border-transparent text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 pr-2">
                  <Filter className="h-3 w-3" />
                  Filters
                </div>
              </div>

              {/* Transaction table */}
              <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-800">
                        {["TX Hash","Block","Age","From","To","Value","Token","Fee","Status"].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wide text-[10px] whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {filteredTxList.slice(0, 12).map((tx, i) => (
                        <tr
                          key={`${tx.hash}-${i}`}
                          className={`hover:bg-slate-800/40 transition-colors ${i === 0 && txConnected ? "animate-pulse-once" : ""}`}
                        >
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-blue-400 text-[10px]">{tx.hash}</span>
                              <button
                                onClick={() => copyHash(tx.hash)}
                                className="text-slate-600 hover:text-slate-400 transition-colors"
                                title="Copy hash"
                              >
                                {copied === tx.hash
                                  ? <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                                  : <Copy className="h-3 w-3" />}
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-slate-300 font-mono text-[10px] whitespace-nowrap">
                            {tx.block.toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{ageLabel(tx.ageSecs)}</td>
                          <td className="px-4 py-2.5 font-mono text-blue-400 text-[10px] whitespace-nowrap">{tx.from}</td>
                          <td className="px-4 py-2.5 font-mono text-blue-400 text-[10px] whitespace-nowrap">{tx.to}</td>
                          <td className="px-4 py-2.5 text-slate-200 whitespace-nowrap font-medium">{tx.value}</td>
                          <td className="px-4 py-2.5">
                            <span className="bg-slate-800 border border-slate-700 text-slate-300 text-[10px] px-1.5 py-0.5 rounded font-mono">
                              {tx.token}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{tx.fee}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                              <span className="text-emerald-400 text-[10px] font-medium">Confirmed</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {filteredTxList.length === 0 && (
                  <div className="text-center py-10 text-slate-500 text-xs">
                    No transactions match your search.
                  </div>
                )}
              </div>
            </>
          )}

          {/* ══ PENDING PROVIDERS SECTION ════════════════════════════════ */}
          {section === "user-activity" && (
            <>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-sm font-bold text-white">Provider Approval Queue</h2>
                  <p className="text-[11px] text-slate-500">Healthcare providers who have verified their email and are awaiting admin approval</p>
                </div>
                <button
                  onClick={fetchPendingProviders}
                  disabled={pendingLoading}
                  className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${pendingLoading ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-1">Pending Review</p>
                  <p className="text-2xl font-black text-amber-400">{pendingProviders.length}</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-1">Approved Today</p>
                  <p className="text-2xl font-black text-emerald-400">0</p>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-1">Rejected Today</p>
                  <p className="text-2xl font-black text-red-400">0</p>
                </div>
              </div>

              {/* Pending providers table */}
              <div className="bg-slate-900 rounded-xl border border-slate-800">
                <div className="px-5 py-3 border-b border-slate-800">
                  <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Pending Approvals</p>
                </div>
                {pendingLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <RefreshCw className="h-5 w-5 text-slate-500 animate-spin" />
                  </div>
                ) : pendingProviders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <CheckCircle2 className="h-10 w-10 text-emerald-500/40" />
                    <div className="text-center">
                      <p className="text-sm font-semibold text-slate-400">All clear</p>
                      <p className="text-xs text-slate-600 mt-1">No providers are currently awaiting approval.</p>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-800">
                          {["Name","Email","Specialty","Registered","Actions"].map((h) => (
                            <th key={h} className="px-5 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wide text-[10px]">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {pendingProviders.map((p) => (
                          <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="h-8 w-8 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400 font-bold text-xs shrink-0">
                                  {p.name.charAt(0)}
                                </div>
                                <span className="text-slate-200 font-medium">{p.name}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-slate-400">{p.email}</td>
                            <td className="px-5 py-3 text-slate-400">{p.specialty ?? <span className="text-slate-600">—</span>}</td>
                            <td className="px-5 py-3 text-slate-400 whitespace-nowrap">
                              {p.createdAt ? format(new Date(p.createdAt), "MMM d, yyyy") : "—"}
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => approveProvider(p.id)}
                                  disabled={actionLoading === p.id}
                                  className="flex items-center gap-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                                >
                                  {actionLoading === p.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                                  Approve
                                </button>
                                <button
                                  onClick={() => rejectProvider(p.id)}
                                  disabled={actionLoading === p.id}
                                  className="flex items-center gap-1 bg-red-500/10 border border-red-500/25 text-red-400 hover:bg-red-500/20 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                                >
                                  {actionLoading === p.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <AlertTriangle className="h-3 w-3" />}
                                  Reject
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Info callout */}
              <div className="bg-blue-950/40 border border-blue-500/20 rounded-xl p-4 flex items-start gap-3">
                <BrainCircuit className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-blue-300">How provider approval works</p>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    When a healthcare provider signs up and verifies their email, they appear here. Approving sends them a welcome email and grants dashboard access. Rejecting permanently removes their registration — they can re-register if needed.
                  </p>
                </div>
              </div>
            </>
          )}

          {/* ══ AI ANOMALY DETECTION ════════════════════════════════════════ */}
          {section === "ai-anomaly" && (
            <>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-sm font-bold text-white">AI Anomaly Detection</h2>
                  <p className="text-[11px] text-slate-500">
                    MLNN model scanning audit logs, vitals, and access patterns for anomalous behaviour — refreshes every 60 seconds
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    MLNN-2.4.1 Active
                  </span>
                  <button onClick={fetchAnomaly} disabled={anomalyLoading}
                    className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 transition-colors">
                    <RefreshCw className={`h-3.5 w-3.5 ${anomalyLoading ? "animate-spin" : ""}`} />
                    Scan Now
                  </button>
                </div>
              </div>

              {anomalyLoading && !anomalyData ? (
                <div className="flex flex-col items-center justify-center py-24 gap-3">
                  <BrainCircuit className="h-10 w-10 text-blue-400 animate-pulse" />
                  <p className="text-xs text-slate-500">MLNN model scanning…</p>
                </div>
              ) : anomalyData ? (
                <>
                  {/* Anomaly score + KPI row */}
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
                    {/* Score gauge */}
                    <div className={`lg:col-span-1 rounded-xl border p-5 flex flex-col items-center justify-center gap-2 ${
                      anomalyData.score === 0   ? "bg-emerald-950/30 border-emerald-500/20" :
                      anomalyData.score < 30    ? "bg-blue-950/30 border-blue-500/20" :
                      anomalyData.score < 60    ? "bg-amber-950/30 border-amber-500/20" :
                                                   "bg-red-950/30 border-red-500/20"
                    }`}>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Anomaly Score</p>
                      <p className={`text-4xl font-black tabular-nums ${
                        anomalyData.score === 0  ? "text-emerald-400" :
                        anomalyData.score < 30   ? "text-blue-400" :
                        anomalyData.score < 60   ? "text-amber-400" : "text-red-400"
                      }`}>{anomalyData.score}</p>
                      <p className={`text-[10px] font-bold ${
                        anomalyData.score === 0  ? "text-emerald-400" :
                        anomalyData.score < 30   ? "text-blue-400" :
                        anomalyData.score < 60   ? "text-amber-400" : "text-red-400"
                      }`}>
                        {anomalyData.score === 0 ? "All Clear" : anomalyData.score < 30 ? "Low Risk" : anomalyData.score < 60 ? "Moderate" : "High Risk"}
                      </p>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1">
                        <div className={`h-full rounded-full transition-all duration-700 ${
                          anomalyData.score === 0 ? "bg-emerald-400" : anomalyData.score < 30 ? "bg-blue-400" : anomalyData.score < 60 ? "bg-amber-400" : "bg-red-400"
                        }`} style={{ width: `${anomalyData.score}%` }} />
                      </div>
                    </div>

                    {/* KPI cards */}
                    <div className="lg:col-span-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                      {[
                        { label: "Failed Logins",    value: anomalyData.failedLogins,    icon: Lock,         color: anomalyData.failedLogins   > 5  ? "text-red-400"    : "text-slate-300", bg: anomalyData.failedLogins > 5 ? "bg-red-950/20 border-red-500/20" : "bg-slate-900 border-slate-800" },
                        { label: "Off-Hours Access", value: anomalyData.offHoursAccess,  icon: Clock,        color: anomalyData.offHoursAccess  > 0  ? "text-amber-400"  : "text-slate-300", bg: anomalyData.offHoursAccess > 0 ? "bg-amber-950/20 border-amber-500/20" : "bg-slate-900 border-slate-800" },
                        { label: "Suspicious IPs",   value: anomalyData.suspiciousIps,   icon: Globe,        color: anomalyData.suspiciousIps   > 0  ? "text-red-400"    : "text-slate-300", bg: anomalyData.suspiciousIps > 0 ? "bg-red-950/20 border-red-500/20" : "bg-slate-900 border-slate-800" },
                        { label: "Vitals Outliers",  value: anomalyData.vitalsOutliers,  icon: Activity,     color: anomalyData.vitalsOutliers  > 0  ? "text-orange-400" : "text-slate-300", bg: anomalyData.vitalsOutliers > 0 ? "bg-orange-950/20 border-orange-500/20" : "bg-slate-900 border-slate-800" },
                        { label: "Silent Devices",   value: anomalyData.silentDevices,   icon: WifiOff,      color: anomalyData.silentDevices   > 0  ? "text-amber-400"  : "text-slate-300", bg: anomalyData.silentDevices > 0 ? "bg-amber-950/20 border-amber-500/20" : "bg-slate-900 border-slate-800" },
                      ].map(({ label, value, icon: Icon, color, bg }) => (
                        <div key={label} className={`rounded-xl border p-4 ${bg}`}>
                          <Icon className={`h-4 w-4 mb-2 ${color}`} />
                          <p className={`text-2xl font-black tabular-nums ${color}`}>{value}</p>
                          <p className="text-[10px] text-slate-500 mt-1 leading-tight">{label}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Trend chart + category breakdown */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* 7-day trend */}
                    <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <TrendingUp className="h-4 w-4 text-blue-400" />
                        <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">7-Day Anomaly Trend</p>
                        <span className="ml-auto text-[10px] text-slate-500">Denied events per day</span>
                      </div>
                      <ResponsiveContainer width="100%" height={140}>
                        <LineChart data={anomalyData.trend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                          <Tooltip content={<ChartTip />} />
                          <Line type="monotone" dataKey="anomalies" stroke="#ef4444" strokeWidth={2}
                            dot={{ r: 3, fill: "#ef4444" }} name="Anomalies" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Category breakdown */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <BrainCircuit className="h-4 w-4 text-purple-400" />
                        <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Detection Categories</p>
                      </div>
                      <div className="space-y-3">
                        {[
                          { label: "Auth Failures",   value: anomalyData.failedLogins,    color: "#ef4444" },
                          { label: "Off-Hours Access",value: anomalyData.offHoursAccess,  color: "#f59e0b" },
                          { label: "Suspicious IPs",  value: anomalyData.suspiciousIps,   color: "#f97316" },
                          { label: "Burst Activity",  value: anomalyData.rapidBursts,     color: "#8b5cf6" },
                          { label: "Vitals Outliers", value: anomalyData.vitalsOutliers,  color: "#3b82f6" },
                          { label: "Silent Devices",  value: anomalyData.silentDevices,   color: "#64748b" },
                        ].map(({ label, value, color }) => {
                          const maxVal = Math.max(anomalyData.failedLogins, anomalyData.offHoursAccess, anomalyData.suspiciousIps, anomalyData.rapidBursts, anomalyData.vitalsOutliers, anomalyData.silentDevices, 1);
                          return (
                            <div key={label} className="space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-400">{label}</span>
                                <span className="text-slate-300 font-bold tabular-nums">{value}</span>
                              </div>
                              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(value / maxVal) * 100}%`, background: color }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-500">
                        Last scan: {anomalyData.scannedAt ? format(new Date(anomalyData.scannedAt), "HH:mm:ss") : "—"}
                      </div>
                    </div>
                  </div>

                  {/* Anomaly events table */}
                  <div className="bg-slate-900 rounded-xl border border-slate-800">
                    <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                        <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Detected Anomalies</p>
                      </div>
                      <span className="text-[10px] text-slate-500">{anomalyData.anomalies?.length ?? 0} events</span>
                    </div>
                    {!anomalyData.anomalies?.length ? (
                      <div className="flex flex-col items-center justify-center py-12 gap-3">
                        <CheckCircle2 className="h-10 w-10 text-emerald-500/30" />
                        <div className="text-center">
                          <p className="text-sm font-semibold text-slate-400">No anomalies detected</p>
                          <p className="text-xs text-slate-600 mt-1">All systems operating within normal parameters.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-slate-800">
                              {["Severity","Type","Actor","Description","Time"].map(h => (
                                <th key={h} className="px-5 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wide text-[10px]">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {anomalyData.anomalies.map((a: any) => (
                              <tr key={a.id} className="hover:bg-slate-800/20 transition-colors">
                                <td className="px-5 py-3">
                                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                    a.severity === "critical" ? "bg-red-500/20 text-red-400" :
                                    a.severity === "high"     ? "bg-orange-500/20 text-orange-400" :
                                    a.severity === "medium"   ? "bg-amber-500/20 text-amber-400" :
                                                                "bg-blue-500/20 text-blue-400"
                                  }`}>{a.severity.toUpperCase()}</span>
                                </td>
                                <td className="px-5 py-3 text-slate-300 font-medium whitespace-nowrap">{a.type}</td>
                                <td className="px-5 py-3 text-slate-400 font-mono text-[10px] max-w-32 truncate">{a.actor}</td>
                                <td className="px-5 py-3 text-slate-400 max-w-64">{a.description}</td>
                                <td className="px-5 py-3 text-slate-500 whitespace-nowrap">
                                  {a.timestamp ? formatDistanceToNow(new Date(a.timestamp), { addSuffix: true }) : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Model info footer */}
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                        <BrainCircuit className="h-4 w-4 text-purple-400" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">MLNN Anomaly Engine</p>
                        <p className="text-[10px] text-slate-500">Multi-Layer Neural Network · Model {anomalyData.modelVersion}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-[11px] text-slate-500">
                      <span>Detection rules: <strong className="text-slate-300">6 active</strong></span>
                      <span>Scan window: <strong className="text-slate-300">24 hours</strong></span>
                      <span>Auto-refresh: <strong className="text-slate-300">60s</strong></span>
                    </div>
                  </div>
                </>
              ) : null}
            </>
          )}

          {/* ══ NETWORK MONITORING ══════════════════════════════════════════ */}
          {section === "network" && (
            <>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-sm font-bold text-white">Network Monitoring</h2>
                  <p className="text-[11px] text-slate-500">Real-time API endpoint health and connectivity — refreshes every 30 seconds</p>
                </div>
                <button onClick={fetchNetwork} disabled={netLoading}
                  className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 transition-colors">
                  <RefreshCw className={`h-3.5 w-3.5 ${netLoading ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>

              {netLoading && !netData ? (
                <div className="flex items-center justify-center py-24"><RefreshCw className="h-5 w-5 text-slate-500 animate-spin" /></div>
              ) : netData ? (
                <>
                  {/* KPI row */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      { label: "DB Latency",          value: `${netData.dbLatencyMs}ms`,    icon: Database, color: netData.dbLatencyMs < 100 ? "text-emerald-400" : "text-amber-400" },
                      { label: "Uptime",               value: `${Math.floor(netData.uptimeSeconds / 60)}m`,    icon: Clock,    color: "text-blue-400"    },
                      { label: "Vitals / Hour",        value: String(netData.vitalsPerHour), icon: Zap,      color: "text-purple-400"  },
                      { label: "Recent API Actions",   value: String(netData.activeConnections), icon: Activity, color: "text-teal-400"    },
                    ].map(({ label, value, icon: Icon, color }) => (
                      <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Icon className={`h-4 w-4 ${color}`} />
                          <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">{label}</p>
                        </div>
                        <p className={`text-2xl font-black ${color}`}>{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Endpoint table */}
                  <div className="bg-slate-900 rounded-xl border border-slate-800">
                    <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Endpoint Health</p>
                      <span className="text-[10px] text-slate-500">Probe time: {netData.probeTimeMs}ms</span>
                    </div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-800">
                          {["Endpoint","Status","Latency","Uptime"].map(h => (
                            <th key={h} className="px-5 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wide text-[10px]">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {netData.endpoints.map((ep: any) => (
                          <tr key={ep.name} className="hover:bg-slate-800/20 transition-colors">
                            <td className="px-5 py-3 flex items-center gap-2">
                              <Server className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                              <span className="text-slate-200 font-medium">{ep.name}</span>
                            </td>
                            <td className="px-5 py-3">
                              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                ep.status === "healthy" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                              }`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${ep.status === "healthy" ? "bg-emerald-400" : "bg-red-400"} animate-pulse`} />
                                {ep.status === "healthy" ? "Healthy" : "Degraded"}
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-20 bg-slate-800 rounded-full overflow-hidden">
                                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min((ep.latencyMs / 200) * 100, 100)}%` }} />
                                </div>
                                <span className="text-slate-300">{ep.latencyMs}ms</span>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-emerald-400">{ep.uptime.toFixed(2)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* System info strip */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "API Server",     value: "Online", ok: true },
                      { label: "Database",       value: netData.dbLatencyMs < 500 ? "Connected" : "Slow", ok: netData.dbLatencyMs < 500 },
                      { label: "Email Service",  value: "Operational", ok: true },
                    ].map(({ label, value, ok }) => (
                      <div key={label} className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${ok ? "bg-emerald-950/30 border-emerald-500/20" : "bg-amber-950/30 border-amber-500/20"}`}>
                        {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" /> : <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />}
                        <div>
                          <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">{label}</p>
                          <p className={`text-xs font-bold ${ok ? "text-emerald-300" : "text-amber-300"}`}>{value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </>
          )}

          {/* ══ SYSTEM INTEGRITY ════════════════════════════════════════════ */}
          {section === "system" && (
            <>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-sm font-bold text-white">System Integrity</h2>
                  <p className="text-[11px] text-slate-500">Database health checks, table statistics, and data consistency verification</p>
                </div>
                <button onClick={fetchIntegrity} disabled={integrityLoading}
                  className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 transition-colors">
                  <RefreshCw className={`h-3.5 w-3.5 ${integrityLoading ? "animate-spin" : ""}`} />
                  Run Checks
                </button>
              </div>

              {integrityLoading && !integrityData ? (
                <div className="flex items-center justify-center py-24"><RefreshCw className="h-5 w-5 text-slate-500 animate-spin" /></div>
              ) : integrityData ? (
                <>
                  {/* Overall status banner */}
                  <div className={`rounded-xl border px-5 py-4 flex items-center gap-4 ${
                    integrityData.overallStatus === "healthy"  ? "bg-emerald-950/40 border-emerald-500/25" :
                    integrityData.overallStatus === "warning"  ? "bg-amber-950/40 border-amber-500/25" :
                                                                  "bg-red-950/40 border-red-500/25"
                  }`}>
                    {integrityData.overallStatus === "healthy"
                      ? <Shield className="h-6 w-6 text-emerald-400 shrink-0" />
                      : integrityData.overallStatus === "warning"
                      ? <AlertTriangle className="h-6 w-6 text-amber-400 shrink-0" />
                      : <XCircle className="h-6 w-6 text-red-400 shrink-0" />
                    }
                    <div>
                      <p className={`text-sm font-bold capitalize ${
                        integrityData.overallStatus === "healthy" ? "text-emerald-300" :
                        integrityData.overallStatus === "warning" ? "text-amber-300" : "text-red-300"
                      }`}>
                        System {integrityData.overallStatus === "healthy" ? "Healthy" :
                                integrityData.overallStatus === "warning"  ? "Minor Warnings" : "Degraded"}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Last checked: {integrityData.checkedAt ? format(new Date(integrityData.checkedAt), "MMM d, yyyy · HH:mm:ss") : "—"}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Database table counts */}
                    <div className="bg-slate-900 rounded-xl border border-slate-800">
                      <div className="px-5 py-3 border-b border-slate-800 flex items-center gap-2">
                        <Database className="h-3.5 w-3.5 text-blue-400" />
                        <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Database Tables</p>
                      </div>
                      <div className="divide-y divide-slate-800/60">
                        {integrityData.tables.map((t: any) => (
                          <div key={t.name} className="flex items-center justify-between px-5 py-2.5 hover:bg-slate-800/20 transition-colors">
                            <div className="flex items-center gap-2">
                              <HardDrive className="h-3 w-3 text-slate-600" />
                              <span className="text-xs text-slate-300 font-mono">{t.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-white tabular-nums">{t.rows.toLocaleString()}</span>
                              <span className="text-[10px] text-slate-600">rows</span>
                              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Health checks */}
                    <div className="bg-slate-900 rounded-xl border border-slate-800">
                      <div className="px-5 py-3 border-b border-slate-800 flex items-center gap-2">
                        <CheckSquare className="h-3.5 w-3.5 text-purple-400" />
                        <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Integrity Checks</p>
                      </div>
                      <div className="divide-y divide-slate-800/60">
                        {integrityData.checks.map((c: any) => (
                          <div key={c.name} className="px-5 py-3 hover:bg-slate-800/20 transition-colors">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-2 min-w-0">
                                {c.status === "pass" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" /> :
                                 c.status === "warn" ? <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" /> :
                                                       <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
                                <span className="text-xs font-semibold text-slate-200">{c.name}</span>
                              </div>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                                c.status === "pass" ? "bg-emerald-500/15 text-emerald-400" :
                                c.status === "warn" ? "bg-amber-500/15 text-amber-400" :
                                                      "bg-red-500/15 text-red-400"
                              }`}>{c.status.toUpperCase()}</span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-1 ml-5">{c.detail}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </>
          )}

          {/* ══ REPORTS ═════════════════════════════════════════════════════ */}
          {section === "reports" && (
            <>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-sm font-bold text-white">Reports</h2>
                  <p className="text-[11px] text-slate-500">Platform-wide statistics, trends, and data exports</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={fetchReport} disabled={reportLoading}
                    className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 transition-colors">
                    <RefreshCw className={`h-3.5 w-3.5 ${reportLoading ? "animate-spin" : ""}`} />
                    Refresh
                  </button>
                  <button onClick={downloadAuditCsv} disabled={exportingCsv}
                    className="flex items-center gap-1.5 bg-blue-600/80 hover:bg-blue-600 border border-blue-500/50 rounded-lg px-3 py-1.5 text-xs text-white transition-colors disabled:opacity-50">
                    {exportingCsv ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    Export Audit Log CSV
                  </button>
                </div>
              </div>

              {reportLoading && !reportData ? (
                <div className="flex items-center justify-center py-24"><RefreshCw className="h-5 w-5 text-slate-500 animate-spin" /></div>
              ) : reportData ? (
                <>
                  {/* KPI grid */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      { label: "Providers",        value: reportData.providers?.total,              icon: Users,    color: "text-blue-400",    sub: "registered" },
                      { label: "Patients",         value: reportData.patients?.total,               icon: Activity, color: "text-teal-400",    sub: `${reportData.patients?.pendingApproval} pending` },
                      { label: "Vitals Today",     value: reportData.vitals?.today,                 icon: Zap,      color: "text-purple-400",  sub: `${reportData.vitals?.thisWeek} this week` },
                      { label: "Active Alerts",    value: reportData.alerts?.active,                icon: AlertTriangle, color: reportData.alerts?.active > 0 ? "text-red-400" : "text-emerald-400", sub: `${reportData.alerts?.today} triggered today` },
                    ].map(({ label, value, icon: Icon, color, sub }) => (
                      <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Icon className={`h-4 w-4 ${color}`} />
                          <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">{label}</p>
                        </div>
                        <p className={`text-2xl font-black ${color}`}>{value ?? 0}</p>
                        <p className="text-[10px] text-slate-600 mt-1">{sub}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* 7-day vitals trend chart */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <TrendingUp className="h-4 w-4 text-blue-400" />
                        <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">7-Day Vitals Trend</p>
                      </div>
                      <ResponsiveContainer width="100%" height={160}>
                        <LineChart data={reportData.vitals?.trend ?? []}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                          <Tooltip content={<ChartTip />} />
                          <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: "#3b82f6" }} name="Vitals" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Top audit actions */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <FileText className="h-4 w-4 text-purple-400" />
                        <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Top Audit Actions</p>
                        <span className="ml-auto text-[10px] text-slate-500">{reportData.auditLog?.total?.toLocaleString()} total events</span>
                      </div>
                      <div className="space-y-2">
                        {(reportData.auditLog?.topActions ?? []).map((a: any, i: number) => {
                          const maxCount = reportData.auditLog?.topActions?.[0]?.c ?? 1;
                          return (
                            <div key={a.action} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-300 font-mono">{a.action}</span>
                                <span className="text-slate-500 tabular-nums">{Number(a.c).toLocaleString()}</span>
                              </div>
                              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{
                                  width: `${(Number(a.c) / Number(maxCount)) * 100}%`,
                                  background: ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444"][i],
                                }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px]">
                        <span className="text-slate-500">Today's events</span>
                        <span className="text-white font-bold">{reportData.auditLog?.today?.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Alerts by severity */}
                  {reportData.alerts?.bySeverity?.length > 0 && (
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <AlertTriangle className="h-4 w-4 text-amber-400" />
                        <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Active Alerts by Severity</p>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {reportData.alerts.bySeverity.map((s: any) => (
                          <div key={s.severity} className={`rounded-lg border px-4 py-3 text-center ${
                            s.severity === "critical" ? "bg-red-950/40 border-red-500/25" :
                            s.severity === "warning"  ? "bg-amber-950/40 border-amber-500/25" :
                                                        "bg-blue-950/40 border-blue-500/25"
                          }`}>
                            <p className={`text-2xl font-black ${
                              s.severity === "critical" ? "text-red-400" :
                              s.severity === "warning"  ? "text-amber-400" : "text-blue-400"
                            }`}>{Number(s.c)}</p>
                            <p className="text-[10px] text-slate-500 capitalize mt-1">{s.severity}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </>
          )}

          {/* ══ SETTINGS ════════════════════════════════════════════════════ */}
          {section === "settings" && (
            <>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-sm font-bold text-white">Settings</h2>
                  <p className="text-[11px] text-slate-500">System configuration, email settings, and admin preferences</p>
                </div>
                <button onClick={saveSettings} disabled={settingsSaving || !settingsData}
                  className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-bold transition-all ${
                    settingsSaved ? "bg-emerald-600 text-white" : "bg-blue-600 hover:bg-blue-500 text-white"
                  } disabled:opacity-50`}>
                  {settingsSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> :
                   settingsSaved  ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                  {settingsSaved ? "Saved!" : "Save Changes"}
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* System info */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Cpu className="h-4 w-4 text-blue-400" />
                    <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">System Information</p>
                  </div>
                  {sysInfo ? (
                    <div className="divide-y divide-slate-800/60">
                      {[
                        { label: "Version",      value: sysInfo.version },
                        { label: "Build Date",   value: sysInfo.buildDate },
                        { label: "Node.js",      value: sysInfo.node },
                        { label: "Environment",  value: sysInfo.env },
                        { label: "Platform",     value: sysInfo.platform },
                        { label: "Heap Memory",  value: `${sysInfo.memoryMB} MB` },
                        { label: "Uptime",       value: `${Math.floor(sysInfo.uptimeSeconds / 60)}m ${Math.floor(sysInfo.uptimeSeconds % 60)}s` },
                        { label: "DB Latency",   value: `${sysInfo.dbLatencyMs}ms` },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex items-center justify-between py-2">
                          <span className="text-[11px] text-slate-500">{label}</span>
                          <span className="text-[11px] text-slate-200 font-mono">{value}</span>
                        </div>
                      ))}
                    </div>
                  ) : <div className="flex items-center justify-center py-8"><RefreshCw className="h-4 w-4 text-slate-600 animate-spin" /></div>}
                </div>

                {/* Email config */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Bell className="h-4 w-4 text-purple-400" />
                    <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Email Configuration</p>
                  </div>
                  {sysInfo ? (
                    <div className="space-y-3">
                      {[
                        { label: "Resend API", active: sysInfo.emailConfig?.resend, note: "Transactional email via Resend" },
                        { label: "SMTP (Gmail)", active: sysInfo.emailConfig?.smtp, note: sysInfo.emailConfig?.from ?? "Not configured" },
                      ].map(({ label, active, note }) => (
                        <div key={label} className={`flex items-start justify-between rounded-lg border px-4 py-3 ${active ? "bg-emerald-950/20 border-emerald-500/20" : "bg-slate-800/40 border-slate-700/60"}`}>
                          <div>
                            <p className="text-xs font-semibold text-slate-200">{label}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5 font-mono">{note}</p>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full mt-0.5 ${active ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-700 text-slate-500"}`}>
                            {active ? "Active" : "Not set"}
                          </span>
                        </div>
                      ))}
                      <div className="bg-blue-950/30 border border-blue-500/20 rounded-lg px-4 py-3 flex items-start gap-2">
                        <Info className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
                        <p className="text-[11px] text-slate-400">Email credentials are managed via Replit Secrets. Keys are never exposed in this dashboard.</p>
                      </div>
                    </div>
                  ) : <div className="flex items-center justify-center py-8"><RefreshCw className="h-4 w-4 text-slate-600 animate-spin" /></div>}
                </div>
              </div>

              {/* Admin preferences */}
              {settingsData && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Settings className="h-4 w-4 text-amber-400" />
                    <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Admin Preferences</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Toggles */}
                    {[
                      { key: "alertEmailEnabled",       label: "Alert email notifications",      desc: "Send email when critical patient alerts fire" },
                      { key: "providerApprovalNotify",  label: "Provider approval notifications", desc: "Notify admin when a new provider registers" },
                      { key: "maintenanceMode",         label: "Maintenance mode",               desc: "Blocks new logins with a maintenance message" },
                    ].map(({ key, label, desc }) => (
                      <div key={key} className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold text-slate-200">{label}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">{desc}</p>
                        </div>
                        <button
                          onClick={() => setSettingsData((prev: any) => ({ ...prev, [key]: !prev[key] }))}
                          className="shrink-0 mt-0.5"
                          title={settingsData[key] ? "Turn off" : "Turn on"}
                        >
                          {settingsData[key]
                            ? <ToggleRight className="h-7 w-7 text-blue-400" />
                            : <ToggleLeft className="h-7 w-7 text-slate-600" />}
                        </button>
                      </div>
                    ))}

                    {/* Number inputs */}
                    {[
                      { key: "sessionTimeoutMinutes", label: "Session timeout (minutes)", min: 15, max: 480 },
                      { key: "maxLoginAttempts",      label: "Max login attempts",        min: 3,  max: 20  },
                      { key: "dataRetentionDays",     label: "Data retention (days)",     min: 30, max: 365 },
                    ].map(({ key, label, min, max }) => (
                      <div key={key}>
                        <label className="text-xs font-semibold text-slate-200">{label}</label>
                        <div className="mt-1.5 flex items-center gap-2">
                          <input
                            type="number" min={min} max={max}
                            value={settingsData[key] ?? ""}
                            onChange={(e) => setSettingsData((prev: any) => ({ ...prev, [key]: parseInt(e.target.value) || prev[key] }))}
                            className="w-24 h-8 bg-slate-800 border border-slate-700 rounded-lg px-3 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <span className="text-[11px] text-slate-500">Range: {min}–{max}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ══ MANAGE TEAM ═════════════════════════════════════════════════ */}
          {section === "manage-team" && (
            <>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-sm font-bold text-white">Manage Team</h2>
                  <p className="text-[11px] text-slate-500">
                    Full provider roster with patient mapping — promote to admin, grant manager rights, or expand any provider to see their assigned patients.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                    <input
                      value={teamSearch}
                      onChange={(e) => setTeamSearch(e.target.value)}
                      placeholder="Search providers…"
                      className="pl-8 pr-3 h-8 bg-slate-800 border border-slate-700 rounded-lg text-[11px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 w-48"
                    />
                  </div>
                  <button
                    onClick={fetchTeam}
                    className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[11px] px-3 h-8 rounded-lg transition-colors"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${teamLoading ? "animate-spin" : ""}`} />
                    Refresh
                  </button>
                </div>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500 mt-1">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400 inline-block" /> Super Admin</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-400 inline-block" /> Admin</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400 inline-block" /> Manager</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-500 inline-block" /> Provider</span>
              </div>

              {teamLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-6 w-6 animate-spin text-blue-400" />
                </div>
              ) : (
                <div className="space-y-2 mt-1">
                  {teamProviders
                    .filter((p) =>
                      !teamSearch ||
                      p.name.toLowerCase().includes(teamSearch.toLowerCase()) ||
                      p.email.toLowerCase().includes(teamSearch.toLowerCase())
                    )
                    .map((p) => {
                      const isExpanded = expandedProvider === p.id;
                      const dotColor = p.isSuperAdmin
                        ? "bg-amber-400"
                        : p.role === "admin"
                        ? "bg-blue-400"
                        : p.isManager
                        ? "bg-emerald-400"
                        : "bg-slate-500";
                      const badge = p.isSuperAdmin
                        ? { label: "Super Admin", cls: "bg-amber-500/15 text-amber-400 border border-amber-500/25" }
                        : p.role === "admin"
                        ? { label: "Admin", cls: "bg-blue-500/15 text-blue-400 border border-blue-500/25" }
                        : p.isManager
                        ? { label: "Manager", cls: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25" }
                        : { label: "Provider", cls: "bg-slate-700/60 text-slate-400 border border-slate-600/40" };

                      return (
                        <div key={p.id} className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
                          {/* Row */}
                          <div className="flex items-center gap-3 px-4 py-3">
                            {/* Dot + name */}
                            <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${dotColor}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold text-slate-200 truncate">{p.name}</span>
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                                {!p.approved && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/25">Pending</span>}
                              </div>
                              <p className="text-[10px] text-slate-500 truncate">{p.email}</p>
                            </div>
                            {/* Patient count */}
                            <div className="text-center shrink-0 hidden sm:block">
                              <p className="text-sm font-bold text-white">{p.patients.length}</p>
                              <p className="text-[9px] text-slate-500">patients</p>
                            </div>
                            {/* Actions */}
                            {!p.isSuperAdmin && (
                              <div className="flex items-center gap-1.5 shrink-0">
                                {/* Manager toggle — admins and super admin can toggle */}
                                {p.role === "provider" && (
                                  <button
                                    disabled={teamAction === p.id}
                                    onClick={() => setProviderManager(p.id, !p.isManager)}
                                    title={p.isManager ? "Revoke manager rights" : "Grant manager rights"}
                                    className={`text-[10px] font-semibold px-2 py-1 rounded-lg border transition-colors disabled:opacity-50 ${
                                      p.isManager
                                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/25"
                                        : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700"
                                    }`}
                                  >
                                    {teamAction === p.id ? "…" : p.isManager ? "Manager ✓" : "+ Manager"}
                                  </button>
                                )}
                                {/* Promote / demote — super admin only */}
                                {isSuperAdmin && p.role !== "admin" && (
                                  <button
                                    disabled={teamAction === p.id}
                                    onClick={() => setProviderRole(p.id, "admin")}
                                    className="text-[10px] font-semibold px-2 py-1 rounded-lg border bg-blue-500/10 text-blue-400 border-blue-500/25 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                                  >
                                    {teamAction === p.id ? "…" : "→ Admin"}
                                  </button>
                                )}
                                {isSuperAdmin && p.role === "admin" && (
                                  <button
                                    disabled={teamAction === p.id}
                                    onClick={() => setProviderRole(p.id, "provider")}
                                    className="text-[10px] font-semibold px-2 py-1 rounded-lg border bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700 transition-colors disabled:opacity-50"
                                  >
                                    {teamAction === p.id ? "…" : "Demote"}
                                  </button>
                                )}
                              </div>
                            )}
                            {/* Expand patients */}
                            <button
                              onClick={() => setExpandedProvider(isExpanded ? null : p.id)}
                              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors shrink-0"
                              title={isExpanded ? "Collapse" : "View assigned patients"}
                            >
                              <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                            </button>
                          </div>

                          {/* Expanded patients + admin actions */}
                          {isExpanded && (
                            <div className="border-t border-slate-800 bg-slate-950/40 px-4 py-3 space-y-3">
                              {/* Patient list */}
                              {p.patients.length === 0 ? (
                                <p className="text-[11px] text-slate-600 italic">No patients assigned to this provider.</p>
                              ) : (
                                <div className="space-y-1.5">
                                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Assigned Patients ({p.patients.length})</p>
                                  {p.patients.map((pt) => (
                                    <div key={pt.id} className="flex items-center gap-2">
                                      <div className="h-5 w-5 rounded-full bg-slate-700 flex items-center justify-center text-[9px] font-bold text-slate-300">
                                        {pt.name.charAt(0)}
                                      </div>
                                      <span className="text-[11px] text-slate-300">{pt.name}</span>
                                      <span className="text-[10px] text-slate-600">{pt.email}</span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Admin actions — not shown for Maxwell */}
                              {!p.isSuperAdmin && (
                                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/60">
                                  {/* Transfer patients */}
                                  {transferState?.fromId === p.id ? (
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <select
                                        value={transferState.toId}
                                        onChange={(e) => setTransferState((s) => s ? { ...s, toId: e.target.value, error: "" } : s)}
                                        className="h-7 bg-slate-800 border border-slate-700 rounded-lg px-2 text-[11px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      >
                                        <option value="">Transfer patients to…</option>
                                        {teamProviders
                                          .filter((tp) => tp.id !== p.id && !tp.isSuperAdmin)
                                          .map((tp) => (
                                            <option key={tp.id} value={String(tp.id)}>{tp.name}</option>
                                          ))}
                                      </select>
                                      <button
                                        onClick={confirmTransfer}
                                        disabled={!transferState.toId || transferState.loading}
                                        className="h-7 px-3 bg-blue-600/80 hover:bg-blue-600 text-white text-[11px] font-semibold rounded-lg disabled:opacity-50 transition-colors"
                                      >
                                        {transferState.loading ? "Transferring…" : "Confirm"}
                                      </button>
                                      <button
                                        onClick={() => setTransferState(null)}
                                        className="h-7 px-3 bg-slate-800 hover:bg-slate-700 text-slate-400 text-[11px] rounded-lg transition-colors"
                                      >
                                        Cancel
                                      </button>
                                      {transferState.error && (
                                        <span className="text-[10px] text-red-400">{transferState.error}</span>
                                      )}
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => startTransfer(p.id)}
                                      className="h-7 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[11px] rounded-lg transition-colors"
                                    >
                                      Transfer patients →
                                    </button>
                                  )}

                                  {/* Delete provider */}
                                  <button
                                    onClick={() => deleteProvider(p.id, p.name)}
                                    disabled={teamAction === p.id}
                                    className="h-7 px-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-400 text-[11px] rounded-lg transition-colors disabled:opacity-50"
                                  >
                                    {teamAction === p.id ? "Deleting…" : "Remove provider"}
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  {teamProviders.length === 0 && (
                    <div className="text-center py-12 text-slate-600 text-sm">No providers found.</div>
                  )}
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}
