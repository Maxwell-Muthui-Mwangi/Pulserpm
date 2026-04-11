import { useSchedulerDashboard, useSchedulerHeatmap } from "../hooks/useSchedulerApi";
import { useNavigate } from "react-router-dom";

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "text-red-400",
  high: "text-amber-400",
  medium: "text-blue-400",
  low: "text-slate-400",
};
const STATUS_BADGE: Record<string, string> = {
  not_started: "bg-slate-700 text-slate-300",
  in_progress: "bg-blue-500/20 text-blue-400",
  completed: "bg-emerald-500/20 text-emerald-400",
  submitted: "bg-purple-500/20 text-purple-400",
};

type Assignment = {
  id: number;
  title: string;
  studentName: string;
  studentColor: string;
  dueDate: string;
  priority: string;
  status: string;
};

type DashboardData = {
  stats: {
    totalStudents: number;
    activeAssignments: number;
    completionRate: number;
    weeklyEarnings: number;
    overdueCount: number;
    urgentCount: number;
  };
  todaysAssignments: Assignment[];
  upcomingAssignments: Assignment[];
  urgentAssignments: Assignment[];
  overdueAssignments: Assignment[];
};

export default function DashboardPage() {
  const { data: dash, isLoading } = useSchedulerDashboard() as { data: DashboardData | undefined; isLoading: boolean };
  const { data: heatmap } = useSchedulerHeatmap();
  const navigate = useNavigate();

  if (isLoading) return <LoadingState />;

  const stats = [
    { label: "Active Students", value: dash?.stats?.totalStudents ?? 0, icon: "👥", color: "text-blue-400" },
    { label: "Open Assignments", value: dash?.stats?.activeAssignments ?? 0, icon: "📋", color: "text-amber-400" },
    { label: "Upcoming (7d)", value: dash?.upcomingAssignments?.length ?? 0, icon: "⏰", color: "text-red-400" },
    { label: "Weekly Earnings", value: `$${(dash?.stats?.weeklyEarnings ?? 0).toFixed(0)}`, icon: "💰", color: "text-emerald-400" },
    { label: "Overdue", value: dash?.stats?.overdueCount ?? 0, icon: "⚠️", color: "text-orange-400" },
    { label: "Completion", value: `${dash?.stats?.completionRate ?? 0}%`, icon: "📈", color: "text-gold" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-ivory">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">Overview of your tutoring schedule</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="card-dark p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">{s.label}</p>
                <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
              </div>
              <span className="text-2xl">{s.icon}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card-dark p-6">
          <h2 className="text-ivory font-semibold mb-4 flex items-center gap-2">
            <span>⏰</span> Due Soon
          </h2>
          {(!dash?.upcomingAssignments || dash.upcomingAssignments.length === 0) && (
            <p className="text-slate-400 text-sm">No upcoming assignments</p>
          )}
          <div className="space-y-3">
            {dash?.upcomingAssignments?.map((a) => (
              <div key={a.id} onClick={() => navigate("/assignments")} className="flex items-center gap-3 p-3 rounded-lg bg-slate-700/30 hover:bg-slate-700/50 cursor-pointer transition-colors">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: a.studentColor || "#f5c842" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-ivory text-sm font-medium truncate">{a.title}</p>
                  <p className="text-slate-400 text-xs">{a.studentName} · {formatDate(a.dueDate)}</p>
                </div>
                <span className={`text-xs font-bold uppercase ${PRIORITY_COLOR[a.priority] ?? "text-slate-400"}`}>{a.priority}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card-dark p-6">
          <h2 className="text-ivory font-semibold mb-4 flex items-center gap-2">
            <span>🔴</span> Overdue
          </h2>
          {(!dash?.overdueAssignments || dash.overdueAssignments.length === 0) && (
            <p className="text-slate-400 text-sm">No overdue assignments</p>
          )}
          <div className="space-y-3">
            {dash?.overdueAssignments?.slice(0, 6).map((a) => (
              <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-700/30">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: a.studentColor || "#94a3b8" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-ivory text-sm truncate">{a.title}</p>
                  <p className="text-slate-400 text-xs">{a.studentName} · {formatDate(a.dueDate)}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[a.status] ?? "bg-slate-700 text-slate-300"}`}>
                  {a.status.replace(/_/g, " ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {heatmap && heatmap.length > 0 && (
        <div className="card-dark p-6">
          <h2 className="text-ivory font-semibold mb-4 flex items-center gap-2">
            <span>📅</span> Assignment Activity Heatmap ({new Date().getFullYear()})
          </h2>
          <Heatmap data={heatmap} />
        </div>
      )}
    </div>
  );
}

function Heatmap({ data }: { data: Array<{ date: string; count: number }> }) {
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const byDate = Object.fromEntries(data.map(d => [d.date, d.count]));

  const year = new Date().getFullYear();
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  const days: Date[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }

  const weeks: (Date | null)[][] = [];
  let currentWeek: (Date | null)[] = [];
  const firstDay = start.getDay();
  for (let i = 0; i < firstDay; i++) currentWeek.push(null);

  for (const day of days) {
    if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = []; }
    currentWeek.push(day);
  }
  if (currentWeek.length > 0) weeks.push(currentWeek);

  function getColor(count: number): string {
    if (count === 0) return "#1e293b";
    const intensity = Math.min(Math.ceil((count / maxCount) * 4), 4);
    const colors = ["#1d4ed8", "#2563eb", "#3b82f6", "#60a5fa"];
    return colors[intensity - 1];
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((day, di) => {
              if (!day) return <div key={di} className="w-3 h-3 rounded-sm" />;
              const dateStr = day.toISOString().split("T")[0];
              const count = byDate[dateStr] ?? 0;
              return (
                <div
                  key={di}
                  className="w-3 h-3 rounded-sm cursor-default"
                  style={{ backgroundColor: getColor(count) }}
                  title={`${dateStr}: ${count} assignment${count !== 1 ? "s" : ""}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-3 text-xs text-slate-400 items-center">
        <span>Less</span>
        {["#1e293b", "#1d4ed8", "#2563eb", "#3b82f6", "#60a5fa"].map((c, i) => (
          <div key={i} className="w-3 h-3 rounded-sm" style={{ backgroundColor: c }} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="h-8 bg-slate-700/40 rounded-lg w-48 animate-pulse" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card-dark p-5 h-24 animate-pulse bg-slate-700/20" />
        ))}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
