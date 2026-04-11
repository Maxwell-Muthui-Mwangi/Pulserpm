import { useState } from "react";
import { useSchedulerAssignments, useSchedulerClasses, Assignment, ClassRecord } from "../hooks/useSchedulerApi";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "#ef4444",
  high: "#f59e0b",
  medium: "#3b82f6",
  low: "#94a3b8",
};

function padISO(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function DailyPage() {
  const today = new Date();
  const [currentDate, setCurrentDate] = useState(today);

  const dateFrom = padISO(currentDate);
  const dateTo = padISO(currentDate);

  const { data: assignmentsRes, isLoading: loadingA } = useSchedulerAssignments({
    dateFrom,
    dateTo,
    limit: 200,
  });
  const { data: classes, isLoading: loadingC } = useSchedulerClasses();

  const assignments: Assignment[] = assignmentsRes?.data ?? [];

  const todayClasses = (classes ?? []).filter((c: ClassRecord) => {
    if (c.date) {
      return isSameDay(new Date(c.date), currentDate);
    }
    if (c.isRecurring && c.recurringDays) {
      return c.recurringDays.includes(currentDate.getDay()) && c.status === "active";
    }
    return false;
  });

  const isToday = isSameDay(currentDate, today);

  function prevDay() {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  }

  function nextDay() {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  }

  const isLoading = loadingA || loadingC;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-ivory">Daily View</h1>
          <p className="text-slate-400 text-sm mt-1">All assignments and classes for one day</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={prevDay} className="btn-secondary w-9 h-9 flex items-center justify-center p-0">←</button>
          <div className="text-center min-w-[12rem]">
            <div className="text-ivory font-semibold">{DAYS_FULL[currentDate.getDay()]}</div>
            <div className="text-slate-400 text-sm">{MONTHS[currentDate.getMonth()]} {currentDate.getDate()}, {currentDate.getFullYear()}</div>
          </div>
          <button onClick={nextDay} className="btn-secondary w-9 h-9 flex items-center justify-center p-0">→</button>
          {!isToday && (
            <button onClick={() => setCurrentDate(today)} className="btn-secondary text-sm">Today</button>
          )}
        </div>
      </div>

      {isLoading && <div className="text-slate-400 text-sm">Loading...</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="card-dark p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-ivory font-semibold">Assignments Due</h2>
            <span className="text-xs text-slate-400 bg-slate-700/50 px-2 py-1 rounded-full">{assignments.length}</span>
          </div>
          {assignments.length === 0 && !isLoading && (
            <p className="text-slate-400 text-sm text-center py-6">No assignments due today</p>
          )}
          <div className="space-y-3">
            {assignments.map((a: Assignment) => (
              <div key={a.id} className="flex items-start gap-3 p-3 bg-slate-700/30 rounded-lg">
                <div className="w-2 h-2 rounded-full flex-shrink-0 mt-2" style={{ backgroundColor: a.studentColor || PRIORITY_COLOR[a.priority] || "#94a3b8" }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-ivory font-medium text-sm truncate">{a.title}</span>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                      style={{ backgroundColor: (PRIORITY_COLOR[a.priority] ?? "#94a3b8") + "33", color: PRIORITY_COLOR[a.priority] ?? "#94a3b8" }}
                    >
                      {a.priority}
                    </span>
                  </div>
                  <p className="text-slate-400 text-xs mt-1">{a.studentName}</p>
                  {a.className && <p className="text-slate-500 text-xs">{a.className}</p>}
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      a.status === "completed" ? "bg-emerald-500/20 text-emerald-400" :
                      a.status === "in_progress" ? "bg-blue-500/20 text-blue-400" :
                      a.status === "submitted" ? "bg-purple-500/20 text-purple-400" :
                      "bg-slate-700/60 text-slate-300"
                    }`}>{a.status.replace("_", " ")}</span>
                    {a.estimatedHours && (
                      <span className="text-xs text-slate-500">{a.estimatedHours}h est.</span>
                    )}
                  </div>
                  {a.notes && <p className="text-slate-400 text-xs mt-1 truncate">{a.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card-dark p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-ivory font-semibold">Classes</h2>
            <span className="text-xs text-slate-400 bg-slate-700/50 px-2 py-1 rounded-full">{todayClasses.length}</span>
          </div>
          {todayClasses.length === 0 && !isLoading && (
            <p className="text-slate-400 text-sm text-center py-6">No classes scheduled today</p>
          )}
          <div className="space-y-3">
            {todayClasses.map((c: ClassRecord) => (
              <div key={c.id} className="p-3 bg-slate-700/30 rounded-lg">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-ivory font-medium text-sm truncate">{c.courseName}</p>
                    <p className="text-slate-400 text-xs mt-0.5">{c.studentName}</p>
                    {c.subject && <p className="text-slate-500 text-xs">{c.subject}</p>}
                  </div>
                  {c.isRecurring && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gold/20 text-gold flex-shrink-0">Recurring</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  {c.startTime && c.endTime && (
                    <span className="text-xs text-slate-400">
                      {c.startTime} – {c.endTime}
                    </span>
                  )}
                  {c.location && (
                    <span className="text-xs text-slate-500">📍 {c.location}</span>
                  )}
                  {c.hourlyRate > 0 && (
                    <span className="text-xs text-emerald-400">${c.hourlyRate}/hr</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
