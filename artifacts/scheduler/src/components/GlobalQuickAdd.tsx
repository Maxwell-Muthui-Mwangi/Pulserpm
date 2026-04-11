import { useState } from "react";
import { useSchedulerStudents, useSchedulerClasses, useCreateAssignment, Student, ClassRecord } from "../hooks/useSchedulerApi";
import { useQueryClient } from "@tanstack/react-query";

export default function GlobalQuickAdd() {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    studentId: "",
    classId: "",
    dueDate: new Date().toISOString().split("T")[0],
    priority: "medium" as const,
    status: "not_started" as const,
    notes: "",
  });

  const { data: students } = useSchedulerStudents({ isActive: true });
  const { data: classes } = useSchedulerClasses({ studentId: form.studentId ? Number(form.studentId) : undefined });
  const createAssignment = useCreateAssignment();
  const qc = useQueryClient();

  function reset() {
    setForm({ title: "", studentId: "", classId: "", dueDate: new Date().toISOString().split("T")[0], priority: "medium", status: "not_started", notes: "" });
    setSaving(false);
    setOpen(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.studentId || !form.dueDate) return;
    setSaving(true);
    try {
      await createAssignment.mutateAsync({
        title: form.title.trim(),
        studentId: Number(form.studentId),
        classId: form.classId ? Number(form.classId) : null,
        dueDate: form.dueDate,
        priority: form.priority,
        status: form.status,
        notes: form.notes.trim() || undefined,
      });
      qc.invalidateQueries({ queryKey: ["scheduler"] });
      reset();
    } catch {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Quick-add assignment"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gold text-navy shadow-lg flex items-center justify-center text-2xl font-bold hover:bg-gold/90 transition-colors focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-navy"
        aria-label="Quick-add assignment"
      >
        +
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={(e) => { if (e.target === e.currentTarget) reset(); }}>
          <div className="bg-navy-dark border border-slate-700/60 rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-700/50">
              <h2 className="text-ivory font-semibold">Quick-Add Assignment</h2>
              <button onClick={reset} className="text-slate-400 hover:text-ivory text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Title *</label>
                <input
                  className="input-field w-full"
                  placeholder="Assignment title"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Student *</label>
                <select
                  className="input-field w-full"
                  value={form.studentId}
                  onChange={(e) => setForm((f) => ({ ...f, studentId: e.target.value, classId: "" }))}
                  required
                >
                  <option value="">Select student</option>
                  {students?.map((s: Student) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              {form.studentId && classes && classes.length > 0 && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Class (optional)</label>
                  <select
                    className="input-field w-full"
                    value={form.classId}
                    onChange={(e) => setForm((f) => ({ ...f, classId: e.target.value }))}
                  >
                    <option value="">No specific class</option>
                    {classes.map((c: ClassRecord) => (
                      <option key={c.id} value={c.id}>{c.courseName}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Due Date *</label>
                  <input
                    type="date"
                    className="input-field w-full"
                    value={form.dueDate}
                    onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Priority</label>
                  <select
                    className="input-field w-full"
                    value={form.priority}
                    onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as typeof form.priority }))}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Notes (optional)</label>
                <textarea
                  className="input-dark w-full resize-none"
                  rows={2}
                  placeholder="Any notes..."
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={reset} className="btn-secondary text-sm px-4 py-2">Cancel</button>
                <button type="submit" disabled={saving || !form.title.trim() || !form.studentId || !form.dueDate} className="btn-primary text-sm px-4 py-2 disabled:opacity-50">
                  {saving ? "Adding..." : "Add Assignment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
