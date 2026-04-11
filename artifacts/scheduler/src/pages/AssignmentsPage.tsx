import { useState } from "react";
import { useSchedulerAssignments, useSchedulerStudents, useSchedulerClasses, useCreateAssignment, useUpdateAssignment, useDeleteAssignment, Assignment, Student, ClassRecord, AssignmentBody } from "../hooks/useSchedulerApi";

const PRIORITY_BADGE: Record<string, string> = {
  urgent: "bg-red-500/20 text-red-400 border border-red-500/30",
  high: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
  medium: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
  low: "bg-slate-700/50 text-slate-400 border border-slate-600/30",
};
const STATUS_BADGE: Record<string, string> = {
  not_started: "bg-slate-700/60 text-slate-300",
  in_progress: "bg-blue-500/20 text-blue-400",
  completed: "bg-emerald-500/20 text-emerald-400",
  submitted: "bg-purple-500/20 text-purple-400",
};

export default function AssignmentsPage() {
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterStudent, setFilterStudent] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [page, setPage] = useState(0);
  const limit = 20;

  const { data: result, isLoading } = useSchedulerAssignments({
    status: filterStatus || undefined,
    priority: filterPriority || undefined,
    studentId: filterStudent ? Number(filterStudent) : undefined,
    limit,
    offset: page * limit,
  });
  const { data: students } = useSchedulerStudents({ isActive: true });
  const { data: classes } = useSchedulerClasses();
  const createAssignment = useCreateAssignment();
  const updateAssignment = useUpdateAssignment();
  const deleteAssignment = useDeleteAssignment();

  const assignments = result?.data || [];
  const total = result?.total ?? 0;

  function handleEdit(a: Assignment) { setEditing(a); setShowModal(true); }
  function handleAdd() { setEditing(null); setShowModal(true); }

  async function handleStatusChange(id: number, status: Assignment["status"]) {
    await updateAssignment.mutateAsync({ id, status });
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this assignment?")) return;
    await deleteAssignment.mutateAsync(id);
  }

  async function handleExport() {
    const q = new URLSearchParams();
    if (filterStatus) q.set("status", filterStatus);
    if (filterStudent) q.set("studentId", filterStudent);
    const res = await fetch(`/scheduler/api/export/assignments?${q}`, {
      credentials: "include",
    });
    const text = await res.text();
    const blob = new Blob([text], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "assignments.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold text-ivory">Assignments</h1>
          <p className="text-slate-400 text-sm mt-1">{total} assignment{total !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} className="btn-secondary text-sm">⬇ Export CSV</button>
          <button onClick={handleAdd} className="btn-primary">+ Add Assignment</button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(0); }} className="input-field text-sm">
          <option value="">All Statuses</option>
          <option value="not_started">Not Started</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="submitted">Submitted</option>
        </select>
        <select value={filterPriority} onChange={e => { setFilterPriority(e.target.value); setPage(0); }} className="input-field text-sm">
          <option value="">All Priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select value={filterStudent} onChange={e => { setFilterStudent(e.target.value); setPage(0); }} className="input-field text-sm">
          <option value="">All Students</option>
          {students?.map((s: Student) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {isLoading && <div className="text-slate-400 text-sm">Loading...</div>}

      {!isLoading && assignments.length === 0 && (
        <div className="card-dark p-12 text-center">
          <div className="text-5xl mb-4">📋</div>
          <h3 className="text-ivory font-semibold mb-2">No assignments found</h3>
          <button onClick={handleAdd} className="btn-primary mt-2">Add Assignment</button>
        </div>
      )}

      <div className="space-y-3">
        {assignments.map((a: Assignment) => (
          <div key={a.id} className="card-dark p-4 hover:border-slate-600 transition-colors">
            <div className="flex items-start gap-3">
              <div className="w-1 h-full min-h-[2rem] rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: a.studentColor || "#94a3b8" }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <h3 className="text-ivory font-medium">{a.title}</h3>
                    <p className="text-slate-400 text-xs mt-0.5">{a.studentName} {a.className ? `· ${a.className}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_BADGE[a.priority] || ""}`}>{a.priority}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <span className="text-xs text-slate-400">📅 {formatDate(a.dueDate)}</span>
                  <select value={a.status} onChange={e => handleStatusChange(a.id, e.target.value as Assignment["status"])} className={`text-xs px-2 py-0.5 rounded-full border-0 outline-none cursor-pointer ${STATUS_BADGE[a.status] || ""}`} style={{ background: "transparent" }}>
                    <option value="not_started">Not Started</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="submitted">Submitted</option>
                  </select>
                  {a.estimatedHours && <span className="text-xs text-slate-400">⏱ {a.estimatedHours}h</span>}
                </div>
                {a.notes && <p className="text-slate-400 text-xs mt-2 line-clamp-2">{a.notes}</p>}
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => handleEdit(a)} className="text-slate-400 hover:text-ivory p-1.5 rounded hover:bg-slate-700/50">
                  <EditIcon />
                </button>
                <button onClick={() => handleDelete(a.id)} className="text-slate-400 hover:text-red-400 p-1.5 rounded hover:bg-red-500/10">
                  <TrashIcon />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {total > limit && (
        <div className="flex items-center gap-3 justify-center">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="btn-secondary text-sm disabled:opacity-40">← Prev</button>
          <span className="text-slate-400 text-sm">Page {page + 1} of {Math.ceil(total / limit)}</span>
          <button disabled={(page + 1) * limit >= total} onClick={() => setPage(p => p + 1)} className="btn-secondary text-sm disabled:opacity-40">Next →</button>
        </div>
      )}

      {showModal && (
        <AssignmentModal
          assignment={editing}
          students={students || []}
          classes={classes || []}
          onClose={() => setShowModal(false)}
          onCreate={(body) => createAssignment.mutateAsync(body).then(() => setShowModal(false))}
          onUpdate={(body) => updateAssignment.mutateAsync(body).then(() => setShowModal(false))}
        />
      )}
    </div>
  );
}

interface AssignmentModalProps {
  assignment: Assignment | null;
  students: Student[];
  classes: ClassRecord[];
  onClose: () => void;
  onCreate: (body: AssignmentBody) => Promise<void>;
  onUpdate: (body: { id: number } & Partial<AssignmentBody>) => Promise<void>;
}

function AssignmentModal({ assignment, students, classes, onClose, onCreate, onUpdate }: AssignmentModalProps) {
  const isEdit = !!assignment;
  const [form, setForm] = useState({
    title: assignment?.title || "",
    notes: assignment?.notes || "",
    studentId: assignment?.studentId ? String(assignment.studentId) : "",
    classId: assignment?.classId ? String(assignment.classId) : "",
    dueDate: assignment?.dueDate ? assignment.dueDate.slice(0, 16) : "",
    priority: assignment?.priority || "medium",
    status: assignment?.status || "not_started",
    estimatedHours: assignment?.estimatedHours ? String(assignment.estimatedHours) : "",
  });

  const filteredClasses = form.studentId ? classes.filter((c: ClassRecord) => c.studentId === Number(form.studentId)) : classes;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      title: form.title,
      notes: form.notes || undefined,
      studentId: Number(form.studentId),
      classId: form.classId ? Number(form.classId) : null,
      dueDate: form.dueDate,
      priority: form.priority,
      status: form.status,
      estimatedHours: form.estimatedHours ? Number(form.estimatedHours) : null,
    };
    if (isEdit) await onUpdate({ id: assignment!.id, ...body });
    else await onCreate(body);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-navy-dark border border-slate-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-ivory font-semibold text-lg">{isEdit ? "Edit Assignment" : "Add Assignment"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-ivory">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="label">Title *</label>
            <input required className="input-field w-full" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Student *</label>
              <select required className="input-field w-full" value={form.studentId} onChange={e => setForm(f => ({ ...f, studentId: e.target.value, classId: "" }))}>
                <option value="">Select student</option>
                {students.map((s: Student) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Class</label>
              <select className="input-field w-full" value={form.classId} onChange={e => setForm(f => ({ ...f, classId: e.target.value }))}>
                <option value="">No class</option>
                {filteredClasses.map((c: ClassRecord) => <option key={c.id} value={c.id}>{c.courseName}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Due Date & Time *</label>
              <input required type="datetime-local" className="input-field w-full" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
            </div>
            <div>
              <label className="label">Est. Hours</label>
              <input type="number" min="0" step="0.5" className="input-field w-full" value={form.estimatedHours} onChange={e => setForm(f => ({ ...f, estimatedHours: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Priority</label>
              <select className="input-field w-full" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as "low" | "medium" | "high" | "urgent" }))}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input-field w-full" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Assignment["status"] }))}>
                <option value="not_started">Not Started</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="submitted">Submitted</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea rows={3} className="input-field w-full resize-none" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" className="btn-primary flex-1">{isEdit ? "Save Changes" : "Add Assignment"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function EditIcon() { return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>; }
function TrashIcon() { return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>; }
