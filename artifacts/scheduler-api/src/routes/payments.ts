import { Router, type IRouter } from "express";
import { db } from "../lib/db.js";
import { schedulerPaymentsTable, schedulerStudentsTable, schedulerAssignmentsTable, schedulerClassesTable, type SchedulerPayment } from "../schema/index.js";
import { eq, and } from "drizzle-orm";
import { schedulerAuthMiddleware } from "../middlewares/auth.js";
import { startOfMonth, endOfMonth } from "date-fns";

type PaymentStatus = "pending" | "paid" | "partial" | "overdue";
const VALID_STATUSES: PaymentStatus[] = ["pending", "paid", "partial", "overdue"];
function isValidStatus(s: string): s is PaymentStatus { return VALID_STATUSES.includes(s as PaymentStatus); }

const router: IRouter = Router();
router.use(schedulerAuthMiddleware);

async function enrichPayment(p: SchedulerPayment) {
  const [student] = await db.select({ name: schedulerStudentsTable.name }).from(schedulerStudentsTable).where(eq(schedulerStudentsTable.id, p.studentId));
  return { ...p, paidAt: p.paymentDate, studentName: student?.name ?? "Unknown" };
}

router.get("/payments", async (req, res): Promise<void> => {
  const tutorId = req.tutorId!;
  const { studentId, status } = req.query as Record<string, string>;

  const conditions = [eq(schedulerPaymentsTable.tutorId, tutorId)];
  if (studentId) conditions.push(eq(schedulerPaymentsTable.studentId, parseInt(studentId, 10)));
  if (status && isValidStatus(status)) conditions.push(eq(schedulerPaymentsTable.status, status));

  const payments = await db.select().from(schedulerPaymentsTable).where(and(...conditions)).orderBy(schedulerPaymentsTable.createdAt);
  res.json(await Promise.all(payments.map(enrichPayment)));
});

router.post("/payments", async (req, res): Promise<void> => {
  const tutorId = req.tutorId!;
  const { studentId, assignmentId, classId, description, agreedAmount, paidAmount, status, paidAt, paymentDate, dueDate } = req.body as {
    studentId: number; assignmentId?: number; classId?: number; description: string;
    agreedAmount: number; paidAmount?: number; status?: string; paidAt?: string; paymentDate?: string; dueDate?: string;
  };

  if (!studentId || !description || agreedAmount === undefined) {
    res.status(400).json({ error: "Bad Request", message: "studentId, description, and agreedAmount are required" });
    return;
  }

  const [student] = await db.select({ id: schedulerStudentsTable.id }).from(schedulerStudentsTable).where(and(eq(schedulerStudentsTable.id, studentId), eq(schedulerStudentsTable.tutorId, tutorId)));
  if (!student) { res.status(403).json({ error: "Forbidden", message: "Student not found or not owned by this tutor" }); return; }

  if (assignmentId) {
    const [ownedAssignment] = await db.select({ id: schedulerAssignmentsTable.id }).from(schedulerAssignmentsTable).where(and(eq(schedulerAssignmentsTable.id, assignmentId), eq(schedulerAssignmentsTable.tutorId, tutorId)));
    if (!ownedAssignment) { res.status(403).json({ error: "Forbidden", message: "Assignment not found or not owned by this tutor" }); return; }
  }
  if (classId) {
    const [ownedClass] = await db.select({ id: schedulerClassesTable.id }).from(schedulerClassesTable).where(and(eq(schedulerClassesTable.id, classId), eq(schedulerClassesTable.tutorId, tutorId)));
    if (!ownedClass) { res.status(403).json({ error: "Forbidden", message: "Class not found or not owned by this tutor" }); return; }
  }

  const resolvedPaymentDate = paidAt ?? paymentDate ?? null;
  const [payment] = await db.insert(schedulerPaymentsTable).values({
    tutorId, studentId, assignmentId: assignmentId ?? null, classId: classId ?? null, description, agreedAmount,
    paidAmount: paidAmount ?? 0, status: status && isValidStatus(status) ? status : "pending",
    paymentDate: resolvedPaymentDate, dueDate: dueDate ?? null,
  }).returning();

  res.status(201).json(await enrichPayment(payment));
});

router.put("/payments/:paymentId", async (req, res): Promise<void> => {
  const tutorId = req.tutorId!;
  const paymentId = parseInt(req.params.paymentId, 10);

  const [existing] = await db.select().from(schedulerPaymentsTable).where(and(eq(schedulerPaymentsTable.id, paymentId), eq(schedulerPaymentsTable.tutorId, tutorId)));
  if (!existing) { res.status(404).json({ error: "Not Found", message: "Payment not found" }); return; }

  const { description, agreedAmount, paidAmount, status, paidAt, paymentDate, dueDate, assignmentId: newAssignmentId, classId: newClassId } = req.body as Partial<{ description: string; agreedAmount: number; paidAmount: number; status: string; paidAt: string; paymentDate: string; dueDate: string; assignmentId: number | null; classId: number | null; }>;

  if (newAssignmentId) {
    const [ownedAssignment] = await db.select({ id: schedulerAssignmentsTable.id }).from(schedulerAssignmentsTable).where(and(eq(schedulerAssignmentsTable.id, newAssignmentId), eq(schedulerAssignmentsTable.tutorId, tutorId)));
    if (!ownedAssignment) { res.status(403).json({ error: "Forbidden", message: "Assignment not found or not owned by this tutor" }); return; }
  }
  if (newClassId) {
    const [ownedClass] = await db.select({ id: schedulerClassesTable.id }).from(schedulerClassesTable).where(and(eq(schedulerClassesTable.id, newClassId), eq(schedulerClassesTable.tutorId, tutorId)));
    if (!ownedClass) { res.status(403).json({ error: "Forbidden", message: "Class not found or not owned by this tutor" }); return; }
  }

  const updates: Partial<typeof schedulerPaymentsTable.$inferInsert> = {};
  if (description !== undefined) updates.description = description;
  if (agreedAmount !== undefined) updates.agreedAmount = agreedAmount;
  if (paidAmount !== undefined) updates.paidAmount = paidAmount;
  if (status !== undefined && isValidStatus(status)) updates.status = status;
  const resolvedDate = paidAt ?? paymentDate;
  if (resolvedDate !== undefined) updates.paymentDate = resolvedDate || null;
  if (dueDate !== undefined) updates.dueDate = dueDate || null;
  if (newAssignmentId !== undefined) updates.assignmentId = newAssignmentId;
  if (newClassId !== undefined) updates.classId = newClassId;

  const [updated] = await db.update(schedulerPaymentsTable).set(updates).where(eq(schedulerPaymentsTable.id, paymentId)).returning();
  res.json(await enrichPayment(updated));
});

router.delete("/payments/:paymentId", async (req, res): Promise<void> => {
  const tutorId = req.tutorId!;
  const paymentId = parseInt(req.params.paymentId, 10);

  const [existing] = await db.select().from(schedulerPaymentsTable).where(and(eq(schedulerPaymentsTable.id, paymentId), eq(schedulerPaymentsTable.tutorId, tutorId)));
  if (!existing) { res.status(404).json({ error: "Not Found", message: "Payment not found" }); return; }

  await db.delete(schedulerPaymentsTable).where(eq(schedulerPaymentsTable.id, paymentId));
  res.sendStatus(204);
});

router.get("/earnings", async (req, res): Promise<void> => {
  const tutorId = req.tutorId!;
  const { month, year } = req.query as Record<string, string>;

  const now = new Date();
  const targetYear = year ? parseInt(year, 10) : now.getFullYear();
  const targetMonth = month ? parseInt(month, 10) : now.getMonth() + 1;
  const start = startOfMonth(new Date(targetYear, targetMonth - 1));
  const end = endOfMonth(new Date(targetYear, targetMonth - 1));

  const allPayments = await db.select().from(schedulerPaymentsTable).where(eq(schedulerPaymentsTable.tutorId, tutorId));
  const monthlyPayments = allPayments.filter((p) => { const d = new Date(p.createdAt); return d >= start && d <= end; });

  const students = await db.select({ id: schedulerStudentsTable.id, name: schedulerStudentsTable.name }).from(schedulerStudentsTable).where(eq(schedulerStudentsTable.tutorId, tutorId));
  const studentMap = Object.fromEntries(students.map((s) => [s.id, s.name]));

  const byStudentMap: Record<number, { studentId: number; studentName: string; earned: number; pending: number }> = {};
  for (const p of allPayments) {
    if (!byStudentMap[p.studentId]) byStudentMap[p.studentId] = { studentId: p.studentId, studentName: studentMap[p.studentId] ?? "Unknown", earned: 0, pending: 0 };
    if (p.status === "paid" || p.status === "partial") byStudentMap[p.studentId].earned += p.paidAmount ?? 0;
    else byStudentMap[p.studentId].pending += (p.agreedAmount ?? 0) - (p.paidAmount ?? 0);
  }

  const recentTransactions = allPayments
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 20)
    .map((p) => ({ ...p, paidAt: p.paymentDate, studentName: studentMap[p.studentId] ?? "Unknown" }));

  res.json({
    totalEarned: allPayments.filter((p) => p.status === "paid" || p.status === "partial").reduce((sum, p) => sum + (p.paidAmount ?? 0), 0),
    totalPending: allPayments.filter((p) => p.status === "pending").reduce((sum, p) => sum + ((p.agreedAmount ?? 0) - (p.paidAmount ?? 0)), 0),
    totalOverdue: allPayments.filter((p) => p.status === "overdue").reduce((sum, p) => sum + ((p.agreedAmount ?? 0) - (p.paidAmount ?? 0)), 0),
    monthlyRevenue: [{ month: `${targetYear}-${String(targetMonth).padStart(2, "0")}`, amount: monthlyPayments.filter((p) => p.status === "paid" || p.status === "partial").reduce((sum, p) => sum + (p.paidAmount ?? 0), 0) }],
    byStudent: Object.values(byStudentMap),
    recentTransactions,
  });
});

export default router;
