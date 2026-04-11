import { useState } from "react";
import { useSchedulerClasses, useSchedulerStudents, useCreateClass, useUpdateClass, useDeleteClass, ClassRecord, Student, ClassBody } from "../hooks/useSchedulerApi";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function ClassesPage() {
  const [filterStudent, setFilterStudent] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ClassRecord | null>(null);
  const { data: classes, isLoading } = useSchedulerClasses({ studentId: filterStudent ? Number(filterStudent) : undefined });
  const { data: students } = useSchedulerStudents({ status: "active" });
  const createClass = useCreateClass();
  const updateClass = useUpdateClass();
  const deleteClass = useDeleteClass();

  function handleEdit(c: ClassRecord) { setEditing(c); setShowModal(true); }
  function handleAdd() { setEditing(null); setShowModal(true); }

  async function handleDelete(id: number) {
    if (!confirm("Delete this class?")) return;
    await deleteClass.mutateAsync(id);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold text-ivory">Classes</h1>
          <p className="text-slate-400 text-sm mt-1">Manage class sessions and schedules</p>
        </div>
        <button onClick={handleAdd} className="btn-primary">+ Add Class</button>
      </div>

      <div className="flex gap-3">
        <select value={filterStudent} onChange={e => setFilterStudent(e.target.value)} className="input-field text-sm">
          <option value="">All Students</option>
          {students?.map((s: Student) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {isLoading && <div className="text-slate-400 text-sm">Loading...</div>}

      {!isLoading && classes?.length === 0 && (
        <div className="card-dark p-12 text-center">
          <div className="text-5xl mb-4">📚</div>
          <h3 className="text-ivory font-semibold mb-2">No classes yet</h3>
          <button onClick={handleAdd} className="btn-primary mt-2">Add Class</button>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {classes?.map((c: ClassRecord) => (
          <div key={c.id} className="card-dark p-5 hover:border-slate-600 transition-colors">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 text-sm font-bold">
                  {c.courseName?.charAt(0)}
                </div>
                <div>
                  <h3 className="text-ivory font-semibold leading-tight">{c.courseName}</h3>
                  <p className="text-slate-400 text-xs">{c.studentName || "—"}</p>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => handleEdit(c)} className="text-slate-400 hover:text-ivory p-1.5 rounded hover:bg-slate-700/50"><EditIcon /></button>
                <button onClick={() => handleDelete(c.id)} className="text-slate-400 hover:text-red-400 p-1.5 rounded hover:bg-red-500/10"><TrashIcon /></button>
              </div>
            </div>
            <div className="space-y-2 text-xs text-slate-400">
              {c.subject && <p>📖 {c.subject}</p>}
              {c.isRecurring && c.recurringDays && (
                <p>↺ {(Array.isArray(c.recurringDays) ? c.recurringDays : JSON.parse(c.recurringDays as unknown as string || "[]")).map((d: number) => DAYS[d]).join(", ")}
                  {c.startTime && c.endTime ? ` · ${c.startTime}–${c.endTime}` : ""}
                </p>
              )}
              {!c.isRecurring && c.date && <p>📅 {new Date(c.date).toLocaleDateString()}{c.startTime ? ` at ${c.startTime}` : ""}</p>}
              {c.location && <p>📍 {c.location}</p>}
              {c.hourlyRate && <p>💰 ${(c.hourlyRate / 100).toFixed(2)}/hr</p>}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-700/50">
              <span className={`text-xs px-2 py-0.5 rounded-full ${c.isRecurring ? "bg-purple-500/20 text-purple-400" : "bg-slate-700/50 text-slate-300"}`}>
                {c.isRecurring ? "Recurring" : "One-off"}
              </span>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <ClassModal
          cls={editing}
          students={students || []}
          onClose={() => setShowModal(false)}
          onCreate={(body) => createClass.mutateAsync(body).then(() => setShowModal(false))}
          onUpdate={(body) => updateClass.mutateAsync(body).then(() => setShowModal(false))}
        />
      )}
    </div>
  );
}

interface ClassModalProps {
  cls: ClassRecord | null;
  students: Student[];
  onClose: () => void;
  onCreate: (body: ClassBody) => Promise<void>;
  onUpdate: (body: { id: number } & Partial<ClassBody>) => Promise<void>;
}

function ClassModal({ cls, students, onClose, onCreate, onUpdate }: ClassModalProps) {
  const isEdit = !!cls;
  const [form, setForm] = useState({
    courseName: cls?.courseName || "",
    subject: cls?.subject || "",
    studentId: cls?.studentId || "",
    isRecurring: cls?.isRecurring || false,
    recurringDays: Array.isArray(cls?.recurringDays) ? cls.recurringDays : (cls?.recurringDays ? JSON.parse(cls.recurringDays) : [] as number[]),
    date: cls?.date ? cls.date.slice(0, 10) : "",
    startTime: cls?.startTime || "",
    endTime: cls?.endTime || "",
    semesterStart: cls?.semesterStart ? cls.semesterStart.slice(0, 10) : "",
    semesterEnd: cls?.semesterEnd ? cls.semesterEnd.slice(0, 10) : "",
    location: cls?.location || "",
    hourlyRate: cls ? (cls.hourlyRate / 100).toFixed(2) : "",
    notes: cls?.notes || "",
  });

  function toggleDay(i: number) {
    setForm(f => ({ ...f, recurringDays: f.recurringDays.includes(i) ? f.recurringDays.filter((d: number) => d !== i) : [...f.recurringDays, i] }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      ...form,
      studentId: Number(form.studentId),
      hourlyRate: form.hourlyRate ? Math.round(parseFloat(form.hourlyRate) * 100) : null,
      recurringDays: form.isRecurring ? form.recurringDays : null,
      date: !form.isRecurring && form.date ? form.date : null,
      semesterStart: form.isRecurring && form.semesterStart ? form.semesterStart : null,
      semesterEnd: form.isRecurring && form.semesterEnd ? form.semesterEnd : null,
    };
    if (isEdit) await onUpdate({ id: cls.id, ...body });
    else await onCreate(body);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-navy-dark border border-slate-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-ivory font-semibold text-lg">{isEdit ? "Edit Class" : "Add Class"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-ivory">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Class Name *</label>
              <input required className="input-field w-full" value={form.courseName} onChange={e => setForm(f => ({ ...f, courseName: e.target.value }))} />
            </div>
            <div>
              <label className="label">Student *</label>
              <select required className="input-field w-full" value={form.studentId} onChange={e => setForm(f => ({ ...f, studentId: e.target.value }))}>
                <option value="">Select student</option>
                {students.map((s: Student) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Subject</label>
              <input className="input-field w-full" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="classRecurring" checked={form.isRecurring} onChange={e => setForm(f => ({ ...f, isRecurring: e.target.checked }))} className="w-4 h-4" />
            <label htmlFor="classRecurring" className="text-slate-300 text-sm">Recurring class (semester-long)</label>
          </div>

          {form.isRecurring ? (
            <div className="space-y-3 p-4 bg-slate-700/20 rounded-lg">
              <div>
                <label className="label">Days of Week</label>
                <div className="flex gap-2 mt-1">
                  {DAYS.map((d, i) => (
                    <button type="button" key={d} onClick={() => toggleDay(i)} className={`w-9 h-9 rounded-lg text-xs font-medium ${form.recurringDays.includes(i) ? "bg-gold text-navy" : "bg-slate-700/50 text-slate-300 hover:bg-slate-700"}`}>{d}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Semester Start</label>
                  <input type="date" className="input-field w-full" value={form.semesterStart} onChange={e => setForm(f => ({ ...f, semesterStart: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Semester End</label>
                  <input type="date" className="input-field w-full" value={form.semesterEnd} onChange={e => setForm(f => ({ ...f, semesterEnd: e.target.value }))} />
                </div>
              </div>
            </div>
          ) : (
            <div>
              <label className="label">Date</label>
              <input type="date" className="input-field w-full" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Start Time</label>
              <input type="time" className="input-field w-full" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
            </div>
            <div>
              <label className="label">End Time</label>
              <input type="time" className="input-field w-full" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
            </div>
            <div>
              <label className="label">Location</label>
              <input className="input-field w-full" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Online, Home, Library..." />
            </div>
            <div>
              <label className="label">Hourly Rate ($)</label>
              <input type="number" min="0" step="0.01" className="input-field w-full" value={form.hourlyRate} onChange={e => setForm(f => ({ ...f, hourlyRate: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea rows={2} className="input-field w-full resize-none" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" className="btn-primary flex-1">{isEdit ? "Save Changes" : "Add Class"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditIcon() { return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>; }
function TrashIcon() { return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>; }
