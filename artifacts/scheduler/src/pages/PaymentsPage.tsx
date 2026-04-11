import { useState } from "react";
import { useSchedulerPayments, useSchedulerEarnings, useSchedulerStudents, useSchedulerClasses, useCreatePayment, useUpdatePayment, useDeletePayment, Payment, PaymentBody } from "../hooks/useSchedulerApi";

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-400",
  paid: "bg-emerald-500/20 text-emerald-400",
  overdue: "bg-red-500/20 text-red-400",
};

export default function PaymentsPage() {
  const [filterStatus, setFilterStatus] = useState("");
  const [filterStudent, setFilterStudent] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);

  const { data: payments, isLoading } = useSchedulerPayments({ status: filterStatus || undefined, studentId: filterStudent ? Number(filterStudent) : undefined });
  const { data: earnings } = useSchedulerEarnings();
  const { data: students } = useSchedulerStudents({});
  const { data: classes } = useSchedulerClasses();
  const createPayment = useCreatePayment();
  const updatePayment = useUpdatePayment();
  const deletePayment = useDeletePayment();

  const paymentList: Payment[] = payments || [];

  function handleEdit(p: Payment) { setEditing(p); setShowModal(true); }
  function handleAdd() { setEditing(null); setShowModal(true); }

  async function handleDelete(id: number) {
    if (!confirm("Delete this payment record?")) return;
    await deletePayment.mutateAsync(id);
  }

  async function handleStatusChange(id: number, status: Payment["status"]) {
    const now = new Date().toISOString();
    await updatePayment.mutateAsync({
      id,
      status,
      ...(status === "paid" ? { paidAt: now, paidAmount: paymentList.find(p => p.id === id)?.agreedAmount ?? 0 } : {}),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold text-ivory">Payments</h1>
          <p className="text-slate-400 text-sm mt-1">Track earnings and payment status</p>
        </div>
        <button onClick={handleAdd} className="btn-primary">+ Add Payment</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card-dark p-4">
          <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Total Earned</p>
          <p className="text-ivory text-xl font-bold">${fmt(earnings?.totalEarned ?? 0)}</p>
        </div>
        <div className="card-dark p-4">
          <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Pending</p>
          <p className="text-amber-400 text-xl font-bold">${fmt(earnings?.totalPending ?? 0)}</p>
        </div>
        <div className="card-dark p-4">
          <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Overdue</p>
          <p className="text-red-400 text-xl font-bold">${fmt(earnings?.totalOverdue ?? 0)}</p>
        </div>
        <div className="card-dark p-4">
          <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">This Month</p>
          <p className="text-gold text-xl font-bold">${fmt(earnings?.monthlyRevenue?.reduce((s, m) => s + m.amount, 0) ?? 0)}</p>
        </div>
      </div>

      {earnings?.byStudent && earnings.byStudent.length > 0 && (
        <div className="card-dark p-6">
          <h2 className="text-ivory font-semibold mb-4">By Student</h2>
          <div className="space-y-2">
            {earnings.byStudent.map((s: { studentId: number; studentName: string; earned: number; pending: number }) => (
              <div key={s.studentId} className="flex items-center gap-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-ivory text-sm font-medium">{s.studentName}</p>
                </div>
                <span className="text-emerald-400 text-sm font-medium">${fmt(s.earned)} earned</span>
                {s.pending > 0 && <span className="text-amber-400 text-sm">${fmt(s.pending)} pending</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input-field text-sm">
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
        </select>
        <select value={filterStudent} onChange={e => setFilterStudent(e.target.value)} className="input-field text-sm">
          <option value="">All Students</option>
          {students?.map((s: { id: number; name: string }) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {isLoading && <div className="text-slate-400 text-sm">Loading...</div>}

      {!isLoading && paymentList.length === 0 && (
        <div className="card-dark p-12 text-center">
          <div className="text-5xl mb-4">💰</div>
          <h3 className="text-ivory font-semibold mb-2">No payments recorded</h3>
          <button onClick={handleAdd} className="btn-primary mt-2">Add Payment</button>
        </div>
      )}

      <div className="space-y-3">
        {paymentList.map((p) => (
          <div key={p.id} className="card-dark p-4 flex items-center gap-4 flex-wrap hover:border-slate-600 transition-colors">
            <div className="flex-1 min-w-0">
              <p className="text-ivory font-medium truncate">{p.description}</p>
              <p className="text-slate-400 text-xs mt-0.5">{p.studentName} {p.dueDate ? `· Due ${new Date(p.dueDate).toLocaleDateString()}` : ""}</p>
            </div>
            <div className="text-right">
              <p className="text-ivory font-bold">${fmt(p.agreedAmount)}</p>
              {p.paidAmount > 0 && p.paidAmount < p.agreedAmount && (
                <p className="text-slate-400 text-xs">Paid: ${fmt(p.paidAmount)}</p>
              )}
            </div>
            <select
              value={p.status}
              onChange={e => handleStatusChange(p.id, e.target.value as Payment["status"])}
              className={`text-xs px-3 py-1.5 rounded-full border border-transparent cursor-pointer outline-none font-medium ${STATUS_BADGE[p.status] ?? ""}`}
              style={{ backgroundColor: "transparent" }}
            >
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
            {p.paidAt && <span className="text-slate-400 text-xs">Paid {new Date(p.paidAt).toLocaleDateString()}</span>}
            <div className="flex gap-1 flex-shrink-0">
              <button onClick={() => handleEdit(p)} className="text-slate-400 hover:text-ivory p-1.5 rounded hover:bg-slate-700/50"><EditIcon /></button>
              <button onClick={() => handleDelete(p.id)} className="text-slate-400 hover:text-red-400 p-1.5 rounded hover:bg-red-500/10"><TrashIcon /></button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <PaymentModal
          payment={editing}
          students={students ?? []}
          classes={classes ?? []}
          onClose={() => setShowModal(false)}
          onCreate={(body) => createPayment.mutateAsync(body).then(() => setShowModal(false))}
          onUpdate={(body) => updatePayment.mutateAsync(body).then(() => setShowModal(false))}
        />
      )}
    </div>
  );
}

interface PaymentModalProps {
  payment: Payment | null;
  students: { id: number; name: string }[];
  classes: { id: number; studentId: number; courseName: string }[];
  onClose: () => void;
  onCreate: (body: PaymentBody) => Promise<void>;
  onUpdate: (body: { id: number } & Partial<PaymentBody>) => Promise<void>;
}

function PaymentModal({ payment, students, classes, onClose, onCreate, onUpdate }: PaymentModalProps) {
  const isEdit = !!payment;
  const [form, setForm] = useState({
    studentId: String(payment?.studentId ?? ""),
    description: payment?.description ?? "",
    agreedAmount: String(payment?.agreedAmount ?? ""),
    paidAmount: String(payment?.paidAmount ?? "0"),
    status: (payment?.status ?? "pending") as Payment["status"],
    paidAt: payment?.paidAt ? payment.paidAt.slice(0, 10) : "",
    dueDate: payment?.dueDate ? payment.dueDate.slice(0, 10) : "",
  });

  const filteredClasses = form.studentId
    ? classes.filter((c: { id: number; studentId: number; courseName: string }) => c.studentId === Number(form.studentId))
    : classes;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body: PaymentBody = {
      studentId: Number(form.studentId),
      description: form.description || undefined,
      agreedAmount: parseFloat(form.agreedAmount),
      paidAmount: parseFloat(form.paidAmount) || 0,
      status: form.status,
      paidAt: form.paidAt || undefined,
      dueDate: form.dueDate || undefined,
    };
    if (isEdit && payment) await onUpdate({ id: payment.id, ...body });
    else await onCreate(body);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-navy-dark border border-slate-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-ivory font-semibold text-lg">{isEdit ? "Edit Payment" : "Add Payment"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-ivory">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Student *</label>
              <select required className="input-field w-full" value={form.studentId} onChange={e => setForm(f => ({ ...f, studentId: e.target.value }))}>
                <option value="">Select student</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input-field w-full" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Payment["status"] }))}>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="partial">Partial</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
            <div>
              <label className="label">Agreed Amount ($) *</label>
              <input required type="number" min="0" step="0.01" className="input-field w-full" value={form.agreedAmount} onChange={e => setForm(f => ({ ...f, agreedAmount: e.target.value }))} placeholder="0.00" />
            </div>
            <div>
              <label className="label">Amount Paid ($)</label>
              <input type="number" min="0" step="0.01" className="input-field w-full" value={form.paidAmount} onChange={e => setForm(f => ({ ...f, paidAmount: e.target.value }))} placeholder="0.00" />
            </div>
            <div>
              <label className="label">Due Date</label>
              <input type="date" className="input-field w-full" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
            </div>
            {form.status === "paid" && (
              <div>
                <label className="label">Paid Date</label>
                <input type="date" className="input-field w-full" value={form.paidAt} onChange={e => setForm(f => ({ ...f, paidAt: e.target.value }))} />
              </div>
            )}
          </div>
          <div>
            <label className="label">Description *</label>
            <input required className="input-field w-full" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Calculus tutoring — April sessions" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" className="btn-primary flex-1">{isEdit ? "Save Changes" : "Add Payment"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function fmt(n: number): string {
  return (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function EditIcon() { return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>; }
function TrashIcon() { return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>; }
