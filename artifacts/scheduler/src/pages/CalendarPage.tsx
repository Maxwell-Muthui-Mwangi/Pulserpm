import { useState, useRef, useCallback } from "react";
import { useSchedulerCalendar, useSchedulerStudents, useRescheduleAssignment, Assignment, Student } from "../hooks/useSchedulerApi";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const PRIORITY_DOT: Record<string, string> = {
  urgent: "#ef4444",
  high: "#f59e0b",
  medium: "#3b82f6",
  low: "#94a3b8",
};

export default function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);
  const draggingId = useRef<number | null>(null);
  const draggingOriginalDay = useRef<number | null>(null);

  const { data: calData, isLoading } = useSchedulerCalendar({ month, year });
  const { data: students } = useSchedulerStudents({});
  const reschedule = useRescheduleAssignment();

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
    setSelectedDay(null);
  }

  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
    setSelectedDay(null);
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();

  const byDay = new Map<number, Assignment[]>();
  calData?.forEach((a: Assignment) => {
    const d = new Date(a.dueDate);
    if (d.getMonth() + 1 === month && d.getFullYear() === year) {
      const day = d.getDate();
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day)!.push(a);
    }
  });

  const selectedAssignments = selectedDay ? (byDay.get(selectedDay) || []) : [];

  const cells: Array<{ day: number | null }> = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push({ day: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d });

  const today = new Date();
  const isToday = (day: number) => day === today.getDate() && month === today.getMonth() + 1 && year === today.getFullYear();

  const handleDragStart = useCallback((e: React.DragEvent, assignmentId: number, fromDay: number) => {
    draggingId.current = assignmentId;
    draggingOriginalDay.current = fromDay;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(assignmentId));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, day: number | null) => {
    if (!day) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverDay(day);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverDay(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetDay: number | null) => {
    e.preventDefault();
    setDragOverDay(null);
    if (!targetDay || !draggingId.current) return;
    if (targetDay === draggingOriginalDay.current) return;

    const originalAssignment = calData?.find((a: Assignment) => a.id === draggingId.current);
    if (!originalAssignment) return;

    const originalDate = new Date(originalAssignment.dueDate);
    const newDate = new Date(year, month - 1, targetDay, originalDate.getHours(), originalDate.getMinutes(), 0, 0);
    const isoStr = newDate.toISOString();

    reschedule.mutate({ id: draggingId.current, dueDate: isoStr });
    draggingId.current = null;
    draggingOriginalDay.current = null;
  }, [calData, year, month, reschedule]);

  const handleDragEnd = useCallback(() => {
    setDragOverDay(null);
    draggingId.current = null;
    draggingOriginalDay.current = null;
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-ivory">Calendar</h1>
          <p className="text-slate-400 text-sm mt-1">Drag assignments to reschedule them</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="btn-secondary w-9 h-9 flex items-center justify-center p-0">←</button>
          <span className="text-ivory font-semibold min-w-[10rem] text-center">{MONTHS[month - 1]} {year}</span>
          <button onClick={nextMonth} className="btn-secondary w-9 h-9 flex items-center justify-center p-0">→</button>
          <button onClick={() => { setMonth(now.getMonth() + 1); setYear(now.getFullYear()); }} className="btn-secondary text-sm">Today</button>
        </div>
      </div>

      {isLoading && <div className="text-slate-400 text-sm">Loading calendar...</div>}
      {reschedule.isPending && <div className="text-gold text-xs">Rescheduling...</div>}

      <div className="card-dark overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-700/50">
          {DAYS.map(d => (
            <div key={d} className="py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell, i) => {
            const items = cell.day ? (byDay.get(cell.day) || []) : [];
            const active = selectedDay === cell.day && cell.day !== null;
            const isDropTarget = dragOverDay === cell.day && cell.day !== null;
            return (
              <div
                key={i}
                onClick={() => cell.day && setSelectedDay(cell.day === selectedDay ? null : cell.day)}
                onDragOver={(e) => handleDragOver(e, cell.day)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, cell.day)}
                className={`min-h-[80px] p-2 border-b border-r border-slate-700/30 transition-colors
                  ${cell.day ? "cursor-pointer hover:bg-slate-700/20" : "bg-slate-800/20"}
                  ${active ? "bg-gold/10 border-gold/30" : ""}
                  ${isDropTarget ? "bg-blue-500/20 ring-2 ring-inset ring-blue-400/50" : ""}
                `}
              >
                {cell.day && (
                  <>
                    <div className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium mb-1 ${isToday(cell.day) ? "bg-gold text-navy" : "text-slate-300"}`}>
                      {cell.day}
                    </div>
                    <div className="space-y-0.5">
                      {items.slice(0, 3).map((a: Assignment) => (
                        <div
                          key={a.id}
                          draggable
                          onDragStart={(e) => { e.stopPropagation(); handleDragStart(e, a.id, cell.day!); }}
                          onDragEnd={handleDragEnd}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 cursor-grab active:cursor-grabbing hover:bg-slate-600/40 rounded px-0.5 transition-colors"
                          title={`Drag to reschedule: ${a.title}`}
                        >
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: a.studentColor || PRIORITY_DOT[a.priority] || "#94a3b8" }} />
                          <span className="text-xs text-slate-300 truncate leading-tight">{a.title}</span>
                        </div>
                      ))}
                      {items.length > 3 && <div className="text-xs text-slate-400">+{items.length - 3} more</div>}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {selectedDay && selectedAssignments.length > 0 && (
        <div className="card-dark p-6">
          <h2 className="text-ivory font-semibold mb-4">
            {MONTHS[month - 1]} {selectedDay} — {selectedAssignments.length} assignment{selectedAssignments.length !== 1 ? "s" : ""}
          </h2>
          <div className="space-y-3">
            {selectedAssignments.map((a: Assignment) => (
              <div key={a.id} className="flex items-start gap-3 p-3 bg-slate-700/30 rounded-lg">
                <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: a.studentColor || "#94a3b8" }} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-ivory font-medium text-sm">{a.title}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: PRIORITY_DOT[a.priority] + "33", color: PRIORITY_DOT[a.priority] }}>{a.priority}</span>
                  </div>
                  <p className="text-slate-400 text-xs mt-1">{a.studentName} · Due {new Date(a.dueDate).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</p>
                  {a.notes && <p className="text-slate-400 text-xs mt-1">{a.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedDay && selectedAssignments.length === 0 && (
        <div className="card-dark p-6 text-center text-slate-400 text-sm">
          No assignments due on {MONTHS[month - 1]} {selectedDay}
        </div>
      )}

      <div className="card-dark p-4">
        <h3 className="text-ivory text-sm font-semibold mb-3">Students</h3>
        <div className="flex flex-wrap gap-3">
          {students?.map((s: Student) => (
            <div key={s.id} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color || "#94a3b8" }} />
              <span className="text-slate-300 text-sm">{s.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
