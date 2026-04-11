import { useParams, useNavigate } from "react-router-dom";
import { useSchedulerStudent, Assignment, Payment, ClassRecord } from "../hooks/useSchedulerApi";
import { format } from "date-fns";

const STATUS_BADGE: Record<string, string> = {
  not_started: "bg-slate-700/60 text-slate-300",
  in_progress: "bg-blue-500/20 text-blue-400",
  completed: "bg-emerald-500/20 text-emerald-400",
  submitted: "bg-purple-500/20 text-purple-400",
  overdue: "bg-red-500/20 text-red-400",
  pending: "bg-amber-500/20 text-amber-400",
};

const PAYMENT_BADGE: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-400",
  paid: "bg-emerald-500/20 text-emerald-400",
  partial: "bg-blue-500/20 text-blue-400",
  overdue: "bg-red-500/20 text-red-400",
};

function fmt(n: number): string {
  return (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function StudentProfilePage() {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const { data: profile, isLoading, isError } = useSchedulerStudent(Number(studentId));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 rounded-full border-2 border-slate-600 border-t-gold animate-spin" />
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="card-dark p-12 text-center">
        <p className="text-slate-400">Student not found.</p>
        <button onClick={() => navigate(-1)} className="btn-secondary mt-4">Go Back</button>
      </div>
    );
  }

  const { student, assignments, classes, payments } = profile;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-ivory transition-colors">
          ← Back
        </button>
        <h1 className="text-2xl font-display font-bold text-ivory">{student.name}</h1>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card-dark p-4">
          <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Completion Rate</p>
          <p className="text-gold text-2xl font-bold">{student.completionRate}%</p>
          <p className="text-slate-500 text-xs mt-1">{student.completedAssignments} / {student.totalAssignments} assignments</p>
        </div>
        <div className="card-dark p-4">
          <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Total Owed</p>
          <p className="text-ivory text-2xl font-bold">${fmt(student.totalOwed)}</p>
        </div>
        <div className="card-dark p-4">
          <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Total Paid</p>
          <p className="text-emerald-400 text-2xl font-bold">${fmt(student.totalPaid)}</p>
        </div>
        <div className="card-dark p-4">
          <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Balance</p>
          <p className={`text-2xl font-bold ${student.totalOwed - student.totalPaid > 0 ? "text-amber-400" : "text-emerald-400"}`}>
            ${fmt(student.totalOwed - student.totalPaid)}
          </p>
        </div>
      </div>

      <div className="card-dark p-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-navy font-bold text-xl" style={{ backgroundColor: student.color || "#f5c842" }}>
            {student.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-ivory font-semibold text-lg">{student.name}</h2>
            {student.email && <p className="text-slate-400 text-sm">{student.email}</p>}
            {student.phone && <p className="text-slate-400 text-sm">{student.phone}</p>}
          </div>
          <div className="ml-auto flex gap-2">
            <span className={`px-2 py-0.5 text-xs rounded-full ${student.status === "active" ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-700/50 text-slate-400"}`}>
              {student.status}
            </span>
            <span className={`px-2 py-0.5 text-xs rounded-full ${PAYMENT_BADGE[student.paymentStatus] || PAYMENT_BADGE.pending}`}>
              {student.paymentStatus}
            </span>
          </div>
        </div>
        {student.notes && (
          <p className="text-slate-400 text-sm mt-4 border-t border-slate-700/50 pt-4">{student.notes}</p>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card-dark p-5">
          <h2 className="text-ivory font-semibold mb-4">Assignments ({assignments.length})</h2>
          {assignments.length === 0 ? (
            <p className="text-slate-500 text-sm">No assignments yet.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {assignments.map((a: Assignment) => (
                <div key={a.id} className="flex items-center gap-3 p-2 rounded-lg bg-slate-700/30">
                  <div className="flex-1 min-w-0">
                    <p className="text-ivory text-sm truncate">{a.title}</p>
                    <p className="text-slate-400 text-xs">{a.dueDate ? format(new Date(a.dueDate), "MMM d, yyyy") : "—"}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_BADGE[a.status] ?? ""}`}>
                    {a.status.replace(/_/g, " ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card-dark p-5">
          <h2 className="text-ivory font-semibold mb-4">Classes ({classes.length})</h2>
          {classes.length === 0 ? (
            <p className="text-slate-500 text-sm">No classes yet.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {classes.map((c: ClassRecord) => (
                <div key={c.id} className="flex items-center gap-3 p-2 rounded-lg bg-slate-700/30">
                  <div className="flex-1 min-w-0">
                    <p className="text-ivory text-sm truncate">{c.courseName}</p>
                    {c.subject && <p className="text-slate-400 text-xs">{c.subject}</p>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${c.isRecurring ? "bg-purple-500/20 text-purple-400" : "bg-slate-700/50 text-slate-300"}`}>
                    {c.isRecurring ? "Recurring" : "One-off"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card-dark p-5">
        <h2 className="text-ivory font-semibold mb-4">Payment History ({payments.length})</h2>
        {payments.length === 0 ? (
          <p className="text-slate-500 text-sm">No payments recorded.</p>
        ) : (
          <div className="space-y-2">
            {payments.map((p: Payment) => (
              <div key={p.id} className="flex items-center gap-4 p-3 rounded-lg bg-slate-700/30">
                <div className="flex-1 min-w-0">
                  <p className="text-ivory text-sm truncate">{p.description}</p>
                  {p.dueDate && <p className="text-slate-400 text-xs">Due {format(new Date(p.dueDate), "MMM d, yyyy")}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-ivory text-sm font-medium">${fmt(p.agreedAmount)}</p>
                  {p.paidAmount > 0 && <p className="text-slate-400 text-xs">${fmt(p.paidAmount)} paid</p>}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${PAYMENT_BADGE[p.status] ?? ""}`}>
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
