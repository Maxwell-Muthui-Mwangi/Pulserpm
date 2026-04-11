import { useState, useRef } from "react";
import { useSchedulerWeekly, useUpdateAssignment, useRescheduleAssignment, Assignment } from "../hooks/useSchedulerApi";
import { format, startOfWeek, addWeeks, subWeeks, addDays } from "date-fns";

const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PRIORITY_COLOR: Record<string, string> = {
  urgent: "#ef4444",
  high: "#f59e0b",
  medium: "#3b82f6",
  low: "#94a3b8",
};
const STATUS_BADGE: Record<string, string> = {
  not_started: "bg-slate-700/60 text-slate-300",
  in_progress: "bg-blue-500/20 text-blue-400",
  completed: "bg-emerald-500/20 text-emerald-400",
  submitted: "bg-purple-500/20 text-purple-400",
  overdue: "bg-red-500/20 text-red-400",
};
const NEXT_STATUS: Record<string, Assignment["status"]> = {
  not_started: "in_progress",
  in_progress: "completed",
  completed: "submitted",
  submitted: "completed",
  overdue: "in_progress",
};

export default function WeeklyPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const { data: assignments, isLoading } = useSchedulerWeekly({ weekStart: weekStartStr });
  const updateAssignment = useUpdateAssignment();
  const reschedule = useRescheduleAssignment();

  const [dragging, setDragging] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const dragData = useRef<{ assignmentId: number } | null>(null);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  function isToday(d: Date) {
    return d.toDateString() === today.toDateString();
  }

  const byDay = new Map<number, Assignment[]>();
  (assignments ?? []).forEach((a: Assignment) => {
    const d = new Date(a.dueDate);
    const dayIndex = d.getDay();
    if (!byDay.has(dayIndex)) byDay.set(dayIndex, []);
    byDay.get(dayIndex)!.push(a);
  });

  function getAssignmentsForDay(dayIndex: number): Assignment[] {
    return byDay.get(dayIndex) ?? [];
  }

  const totalDue = assignments?.length ?? 0;
  const completedCount = (assignments ?? []).filter((a: Assignment) => a.status === "completed" || a.status === "submitted").length;

  function handleDragStart(e: React.DragEvent, assignmentId: number) {
    setDragging(assignmentId);
    dragData.current = { assignmentId };
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragEnd() {
    setDragging(null);
    setDragOver(null);
    dragData.current = null;
  }

  function handleDragOver(e: React.DragEvent, dayIndex: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(dayIndex);
  }

  function handleDragLeave() {
    setDragOver(null);
  }

  async function handleDrop(e: React.DragEvent, targetDay: Date) {
    e.preventDefault();
    setDragOver(null);
    if (!dragData.current) return;
    const { assignmentId } = dragData.current;
    const newDate = format(targetDay, "yyyy-MM-dd") + "T23:59:00.000Z";
    await reschedule.mutateAsync({ id: assignmentId, dueDate: newDate });
    setDragging(null);
    dragData.current = null;
  }

  async function handleStatusCycle(a: Assignment) {
    const next = NEXT_STATUS[a.status] ?? "in_progress";
    await updateAssignment.mutateAsync({ id: a.id, status: next });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-ivory">Weekly View</h1>
          <p className="text-slate-400 text-sm mt-1">
            {format(weekStart, "MMM d")} – {format(addDays(weekStart, 6), "MMM d, yyyy")}
            <span className="ml-3 text-xs text-slate-500">Drag assignments between days to reschedule</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setWeekStart(w => subWeeks(w, 1))} className="btn-secondary w-9 h-9 flex items-center justify-center p-0">←</button>
          <button onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }))} className="btn-secondary text-sm">This Week</button>
          <button onClick={() => setWeekStart(w => addWeeks(w, 1))} className="btn-secondary w-9 h-9 flex items-center justify-center p-0">→</button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card-dark p-4">
          <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Due This Week</p>
          <p className="text-ivory text-2xl font-bold">{totalDue}</p>
        </div>
        <div className="card-dark p-4">
          <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Completed</p>
          <p className="text-emerald-400 text-2xl font-bold">{completedCount}</p>
        </div>
        <div className="card-dark p-4">
          <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Remaining</p>
          <p className="text-amber-400 text-2xl font-bold">{totalDue - completedCount}</p>
        </div>
        <div className="card-dark p-4">
          <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Completion</p>
          <p className="text-blue-400 text-2xl font-bold">
            {totalDue > 0 ? Math.round((completedCount / totalDue) * 100) : 0}%
          </p>
        </div>
      </div>

      {isLoading && <div className="text-slate-400 text-sm">Loading...</div>}

      <div className="grid sm:grid-cols-2 lg:grid-cols-7 gap-3">
        {days.map((day, i) => {
          const dayAssignments = getAssignmentsForDay(i);
          const active = isToday(day);
          const isDragTarget = dragOver === i;
          return (
            <div
              key={i}
              className={`card-dark p-4 transition-colors ${active ? "border-gold/40 bg-gold/5" : ""} ${isDragTarget ? "border-blue-400/60 bg-blue-500/5" : ""}`}
              onDragOver={(e) => handleDragOver(e, i)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, day)}
            >
              <div className="mb-3">
                <p className={`text-xs font-medium uppercase tracking-wider ${active ? "text-gold" : "text-slate-400"}`}>{DAYS_SHORT[i]}</p>
                <p className={`text-xl font-bold ${active ? "text-gold" : "text-ivory"}`}>{format(day, "d")}</p>
                <p className="text-slate-500 text-xs">{format(day, "MMM")}</p>
              </div>
              <div className="space-y-2 min-h-[40px]">
                {dayAssignments.length === 0 && (
                  <p className="text-slate-600 text-xs">{isDragTarget ? "Drop here" : "No assignments"}</p>
                )}
                {dayAssignments.map((a) => (
                  <div
                    key={a.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, a.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => handleStatusCycle(a)}
                    className={`p-2 rounded-lg bg-slate-700/40 border-l-2 cursor-grab active:cursor-grabbing hover:bg-slate-700/70 transition-all select-none ${dragging === a.id ? "opacity-40" : ""}`}
                    style={{ borderLeftColor: a.studentColor || PRIORITY_COLOR[a.priority] || "#94a3b8" }}
                    title="Drag to reschedule · Click to cycle status"
                  >
                    <p className="text-ivory text-xs font-medium leading-tight truncate">{a.title}</p>
                    <p className="text-slate-400 text-xs truncate">{a.studentName}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-slate-500 text-xs">{format(new Date(a.dueDate), "h:mm a")}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_BADGE[a.status] ?? ""}`}>
                        {a.status === "not_started" ? "todo" : a.status === "in_progress" ? "active" : a.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {assignments && assignments.length > 0 && (
        <div className="card-dark p-6">
          <h2 className="text-ivory font-semibold mb-4">All This Week ({assignments.length})</h2>
          <div className="space-y-2">
            {assignments.map((a: Assignment) => (
              <div key={a.id} className="flex items-center gap-3 p-3 bg-slate-700/30 rounded-lg">
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: a.studentColor || "#94a3b8" }} />
                <div className="flex-1 min-w-0">
                  <span className="text-ivory text-sm">{a.title}</span>
                  <span className="text-slate-400 text-xs ml-2">{a.studentName}</span>
                </div>
                <span className="text-slate-400 text-xs flex-shrink-0">{format(new Date(a.dueDate), "EEE h:mm a")}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_BADGE[a.status] ?? ""}`}>
                  {a.status.replace(/_/g, " ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
