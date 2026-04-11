import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSchedulerStudents, useCreateStudent, useUpdateStudent, useDeleteStudent, Student, StudentBody } from "../hooks/useSchedulerApi";


const COLORS = ["#f5c842", "#ef4444", "#3b82f6", "#10b981", "#8b5cf6", "#f97316", "#ec4899", "#06b6d4", "#84cc16", "#e11d48"];

export default function StudentsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const { data: students, isLoading } = useSchedulerStudents({ search });
  const createStudent = useCreateStudent();
  const updateStudent = useUpdateStudent();
  const deleteStudent = useDeleteStudent();

  function handleEdit(s: Student) { setEditing(s); setShowModal(true); }
  function handleAdd() { setEditing(null); setShowModal(true); }
  function handleViewProfile(s: Student) { navigate(String(s.id)); }

  async function handleDelete(id: number) {
    if (!confirm("Remove this student? This cannot be undone.")) return;
    await deleteStudent.mutateAsync(id);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold text-ivory">Students</h1>
          <p className="text-slate-400 text-sm mt-1">Manage your student roster</p>
        </div>
        <button onClick={handleAdd} className="btn-primary">+ Add Student</button>
      </div>

      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search students..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field flex-1 max-w-xs"
        />
      </div>

      {isLoading && <div className="text-slate-400">Loading...</div>}

      {!isLoading && students?.length === 0 && (
        <div className="card-dark p-12 text-center">
          <div className="text-5xl mb-4">👥</div>
          <h3 className="text-ivory font-semibold text-lg mb-2">No students yet</h3>
          <p className="text-slate-400 text-sm mb-4">Add your first student to get started</p>
          <button onClick={handleAdd} className="btn-primary">Add Student</button>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {students?.map((s: Student) => (
          <div key={s.id} className="card-dark p-5 hover:border-slate-600 transition-colors">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-navy font-bold text-sm" style={{ backgroundColor: s.color || "#f5c842" }}>
                  {s.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-ivory font-semibold">{s.name}</h3>
                  <p className="text-slate-400 text-xs">{s.email || "No email"}</p>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => handleViewProfile(s)} className="text-slate-400 hover:text-gold p-1.5 rounded hover:bg-gold/10 transition-colors" title="View profile">
                  <ProfileIcon />
                </button>
                <button onClick={() => handleEdit(s)} className="text-slate-400 hover:text-ivory p-1.5 rounded hover:bg-slate-700/50 transition-colors">
                  <EditIcon />
                </button>
                <button onClick={() => handleDelete(s.id)} className="text-slate-400 hover:text-red-400 p-1.5 rounded hover:bg-red-500/10 transition-colors">
                  <TrashIcon />
                </button>
              </div>
            </div>
            <div className="space-y-1 text-xs text-slate-400">
              {s.phone && <p>📞 {s.phone}</p>}
              {s.notes && <p className="truncate">📝 {s.notes}</p>}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-700/50 flex items-center gap-2">
              <span className={`px-2 py-0.5 text-xs rounded-full ${s.status === "active" ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-700/50 text-slate-400"}`}>
                {s.status === "active" ? "Active" : "Archived"}
              </span>
              <span className={`px-2 py-0.5 text-xs rounded-full ${s.paymentStatus === "paid" ? "bg-emerald-500/20 text-emerald-400" : s.paymentStatus === "overdue" ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"}`}>
                {s.paymentStatus || "pending"}
              </span>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <StudentModal
          student={editing}
          onClose={() => setShowModal(false)}
          onCreate={(body) => createStudent.mutateAsync(body).then(() => setShowModal(false))}
          onUpdate={(body) => updateStudent.mutateAsync(body).then(() => setShowModal(false))}
        />
      )}
    </div>
  );
}

interface StudentModalProps {
  student: Student | null;
  onClose: () => void;
  onCreate: (body: StudentBody) => Promise<void>;
  onUpdate: (body: { id: number } & Partial<StudentBody>) => Promise<void>;
}

function StudentModal({ student, onClose, onCreate, onUpdate }: StudentModalProps) {
  const isEdit = !!student;
  const [form, setForm] = useState({
    name: student?.name || "",
    email: student?.email || "",
    phone: student?.phone || "",
    color: student?.color || COLORS[0],
    status: (student?.status as "active" | "archived") || "active",
    paymentStatus: (student?.paymentStatus as "paid" | "pending" | "overdue") || "pending",
    notes: student?.notes || "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = { ...form };
    if (isEdit) await onUpdate({ id: student.id, ...body });
    else await onCreate(body);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-navy-dark border border-slate-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-ivory font-semibold text-lg">{isEdit ? "Edit Student" : "Add Student"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-ivory">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Name *</label>
              <input required className="input-field w-full" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Student full name" />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input-field w-full" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="student@email.com" />
            </div>
            <div>
              <label className="label">Phone</label>
              <input type="tel" className="input-field w-full" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 (555) 000-0000" />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input-field w-full" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as "active" | "archived" }))}>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div>
              <label className="label">Payment Status</label>
              <select className="input-field w-full" value={form.paymentStatus} onChange={e => setForm(f => ({ ...f, paymentStatus: e.target.value as "paid" | "pending" | "overdue" }))}>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Color</label>
            <div className="flex gap-2 flex-wrap mt-1">
              {COLORS.map(c => (
                <button type="button" key={c} onClick={() => setForm(f => ({ ...f, color: c }))} className={`w-7 h-7 rounded-full border-2 transition-all ${form.color === c ? "border-white scale-110" : "border-transparent"}`} style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea rows={3} className="input-field w-full resize-none" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any special notes about this student..." />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" className="btn-primary flex-1">{isEdit ? "Save Changes" : "Add Student"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProfileIcon() { return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>; }
function EditIcon() { return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>; }
function TrashIcon() { return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>; }
