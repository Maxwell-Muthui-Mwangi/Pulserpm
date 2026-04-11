import { Router, type IRouter } from "express";
import { db } from "../lib/db.js";
import {
  schedulerStudentsTable,
  schedulerAssignmentsTable,
  schedulerClassesTable,
  schedulerPaymentsTable,
} from "../schema/index.js";
import { eq, and, ilike, or } from "drizzle-orm";
import { schedulerAuthMiddleware } from "../middlewares/auth.js";
import { sanitizeStr, sanitizeEmail, sanitizePhone, sanitizeNotes, sanitizeHexColor } from "../lib/sanitize.js";

const router: IRouter = Router();
router.use(schedulerAuthMiddleware);

router.get("/students", async (req, res): Promise<void> => {
  const { search, status, paymentStatus } = req.query as Record<string, string>;
  const tutorId = req.tutorId!;

  const conditions = [eq(schedulerStudentsTable.tutorId, tutorId)];
  if (status && status !== "all") conditions.push(eq(schedulerStudentsTable.status, status as "active" | "archived"));
  if (paymentStatus && paymentStatus !== "all") conditions.push(eq(schedulerStudentsTable.paymentStatus, paymentStatus as "paid" | "pending" | "overdue"));
  if (search) conditions.push(or(ilike(schedulerStudentsTable.name, `%${search}%`), ilike(schedulerStudentsTable.email, `%${search}%`))!);

  const students = await db.select().from(schedulerStudentsTable).where(and(...conditions)).orderBy(schedulerStudentsTable.name);

  const enriched = await Promise.all(students.map(async (student) => {
    const assignments = await db.select({ status: schedulerAssignmentsTable.status }).from(schedulerAssignmentsTable).where(eq(schedulerAssignmentsTable.studentId, student.id));
    const total = assignments.length;
    const completed = assignments.filter((a) => a.status === "completed" || a.status === "submitted").length;
    const payments = await db.select({ agreedAmount: schedulerPaymentsTable.agreedAmount, paidAmount: schedulerPaymentsTable.paidAmount }).from(schedulerPaymentsTable).where(eq(schedulerPaymentsTable.studentId, student.id));
    return {
      ...student,
      totalAssignments: total,
      completedAssignments: completed,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      totalOwed: payments.reduce((sum, p) => sum + (p.agreedAmount || 0), 0),
      totalPaid: payments.reduce((sum, p) => sum + (p.paidAmount || 0), 0),
    };
  }));

  res.json(enriched);
});

router.post("/students", async (req, res): Promise<void> => {
  const tutorId = req.tutorId!;
  const name = sanitizeStr(req.body.name);
  const email = sanitizeEmail(req.body.email);
  const phone = sanitizePhone(req.body.phone);
  const notes = sanitizeNotes(req.body.notes);
  const color = sanitizeHexColor(req.body.color) ?? "#6366f1";

  if (!name) {
    res.status(400).json({ error: "Bad Request", message: "name is required" });
    return;
  }

  const [student] = await db.insert(schedulerStudentsTable).values({ tutorId, name, email: email ?? null, phone: phone ?? null, notes: notes ?? null, color }).returning();
  res.status(201).json({ ...student, totalAssignments: 0, completedAssignments: 0, completionRate: 0, totalOwed: 0, totalPaid: 0 });
});

router.get("/students/:studentId", async (req, res): Promise<void> => {
  const tutorId = req.tutorId!;
  const studentId = parseInt(req.params.studentId, 10);

  const [student] = await db.select().from(schedulerStudentsTable).where(and(eq(schedulerStudentsTable.id, studentId), eq(schedulerStudentsTable.tutorId, tutorId)));
  if (!student) { res.status(404).json({ error: "Not Found", message: "Student not found" }); return; }

  const [assignments, classes, payments] = await Promise.all([
    db.select().from(schedulerAssignmentsTable).where(eq(schedulerAssignmentsTable.studentId, studentId)).orderBy(schedulerAssignmentsTable.dueDate),
    db.select().from(schedulerClassesTable).where(eq(schedulerClassesTable.studentId, studentId)),
    db.select().from(schedulerPaymentsTable).where(eq(schedulerPaymentsTable.studentId, studentId)).orderBy(schedulerPaymentsTable.createdAt),
  ]);

  const total = assignments.length;
  const completed = assignments.filter((a) => a.status === "completed" || a.status === "submitted").length;

  res.json({
    student: {
      ...student,
      totalAssignments: total,
      completedAssignments: completed,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      totalOwed: payments.reduce((sum, p) => sum + (p.agreedAmount || 0), 0),
      totalPaid: payments.reduce((sum, p) => sum + (p.paidAmount || 0), 0),
    },
    assignments: assignments.map((a) => ({ ...a, studentName: student.name, studentColor: student.color, className: null as string | null })),
    classes: classes.map((c) => ({ ...c, studentName: student.name })),
    payments: payments.map((p) => ({ ...p, studentName: student.name })),
  });
});

router.put("/students/:studentId", async (req, res): Promise<void> => {
  const tutorId = req.tutorId!;
  const studentId = parseInt(req.params.studentId, 10);

  const [existing] = await db.select().from(schedulerStudentsTable).where(and(eq(schedulerStudentsTable.id, studentId), eq(schedulerStudentsTable.tutorId, tutorId)));
  if (!existing) { res.status(404).json({ error: "Not Found", message: "Student not found" }); return; }

  const updates: Partial<typeof schedulerStudentsTable.$inferInsert> = {};
  if (req.body.name !== undefined) { const v = sanitizeStr(req.body.name); if (v) updates.name = v; }
  if (req.body.email !== undefined) updates.email = sanitizeEmail(req.body.email) ?? null;
  if (req.body.phone !== undefined) updates.phone = sanitizePhone(req.body.phone) ?? null;
  if (req.body.notes !== undefined) updates.notes = sanitizeNotes(req.body.notes) ?? null;
  if (req.body.status !== undefined && ["active", "archived"].includes(req.body.status)) updates.status = req.body.status;
  if (req.body.color !== undefined) { const v = sanitizeHexColor(req.body.color); if (v) updates.color = v; }
  if (req.body.paymentStatus !== undefined && ["paid", "pending", "overdue"].includes(req.body.paymentStatus)) updates.paymentStatus = req.body.paymentStatus;

  const [updated] = await db.update(schedulerStudentsTable).set(updates).where(eq(schedulerStudentsTable.id, studentId)).returning();
  const assignments = await db.select({ status: schedulerAssignmentsTable.status }).from(schedulerAssignmentsTable).where(eq(schedulerAssignmentsTable.studentId, studentId));
  const payments = await db.select({ agreedAmount: schedulerPaymentsTable.agreedAmount, paidAmount: schedulerPaymentsTable.paidAmount }).from(schedulerPaymentsTable).where(eq(schedulerPaymentsTable.studentId, studentId));
  const total = assignments.length;
  const completed = assignments.filter((a) => a.status === "completed" || a.status === "submitted").length;
  res.json({ ...updated, totalAssignments: total, completedAssignments: completed, completionRate: total > 0 ? Math.round((completed / total) * 100) : 0, totalOwed: payments.reduce((sum, p) => sum + (p.agreedAmount || 0), 0), totalPaid: payments.reduce((sum, p) => sum + (p.paidAmount || 0), 0) });
});

router.delete("/students/:studentId", async (req, res): Promise<void> => {
  const tutorId = req.tutorId!;
  const studentId = parseInt(req.params.studentId, 10);

  const [existing] = await db.select().from(schedulerStudentsTable).where(and(eq(schedulerStudentsTable.id, studentId), eq(schedulerStudentsTable.tutorId, tutorId)));
  if (!existing) { res.status(404).json({ error: "Not Found", message: "Student not found" }); return; }

  await db.update(schedulerStudentsTable).set({ status: "archived" }).where(eq(schedulerStudentsTable.id, studentId));
  res.sendStatus(204);
});

export default router;
