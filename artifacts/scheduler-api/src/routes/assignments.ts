import { Router, type IRouter } from "express";
import { db } from "../lib/db.js";
import { schedulerAssignmentsTable, schedulerStudentsTable, schedulerClassesTable, type SchedulerAssignment } from "../schema/index.js";
import { eq, and, ilike, gte, lte, count } from "drizzle-orm";
import { schedulerAuthMiddleware } from "../middlewares/auth.js";
import { format, parseISO } from "date-fns";
import { sanitizeStr, sanitizeNotes, sanitizePositiveFloat, sanitizeDate } from "../lib/sanitize.js";

type AssignmentStatus = "not_started" | "in_progress" | "completed" | "submitted";
type AssignmentPriority = "low" | "medium" | "high" | "urgent";

const VALID_STATUSES: AssignmentStatus[] = ["not_started", "in_progress", "completed", "submitted"];
const VALID_PRIORITIES: AssignmentPriority[] = ["low", "medium", "high", "urgent"];

function isValidStatus(s: string): s is AssignmentStatus { return VALID_STATUSES.includes(s as AssignmentStatus); }
function isValidPriority(p: string): p is AssignmentPriority { return VALID_PRIORITIES.includes(p as AssignmentPriority); }

const router: IRouter = Router();
router.use(schedulerAuthMiddleware);

async function enrichAssignment(a: SchedulerAssignment) {
  const [student] = await db.select({ name: schedulerStudentsTable.name, color: schedulerStudentsTable.color }).from(schedulerStudentsTable).where(eq(schedulerStudentsTable.id, a.studentId));
  let className: string | null = null;
  if (a.classId) {
    const [cls] = await db.select({ courseName: schedulerClassesTable.courseName }).from(schedulerClassesTable).where(eq(schedulerClassesTable.id, a.classId));
    className = cls?.courseName ?? null;
  }
  return { ...a, studentName: student?.name ?? "Unknown", studentColor: student?.color ?? "#6366f1", className };
}

router.get("/assignments", async (req, res): Promise<void> => {
  const tutorId = req.tutorId!;
  const { studentId, classId, status, priority, dateFrom, dateTo, search, limit: limitStr, offset: offsetStr } = req.query as Record<string, string>;

  const pageLimit = Math.min(Math.max(parseInt(limitStr ?? "100", 10) || 100, 1), 200);
  const pageOffset = Math.max(parseInt(offsetStr ?? "0", 10) || 0, 0);

  const conditions = [eq(schedulerAssignmentsTable.tutorId, tutorId)];
  if (studentId) conditions.push(eq(schedulerAssignmentsTable.studentId, parseInt(studentId, 10)));
  if (classId) conditions.push(eq(schedulerAssignmentsTable.classId, parseInt(classId, 10)));
  if (status && isValidStatus(status)) conditions.push(eq(schedulerAssignmentsTable.status, status));
  if (priority && isValidPriority(priority)) conditions.push(eq(schedulerAssignmentsTable.priority, priority));
  if (dateFrom) {
    const from = new Date(dateFrom);
    from.setUTCHours(0, 0, 0, 0);
    conditions.push(gte(schedulerAssignmentsTable.dueDate, from));
  }
  if (dateTo) {
    const to = new Date(dateTo);
    to.setUTCHours(23, 59, 59, 999);
    conditions.push(lte(schedulerAssignmentsTable.dueDate, to));
  }
  if (search) conditions.push(ilike(schedulerAssignmentsTable.title, `%${search}%`));

  const where = and(...conditions);
  const [totalRow] = await db.select({ total: count() }).from(schedulerAssignmentsTable).where(where);
  const total = totalRow?.total ?? 0;

  const assignments = await db.select().from(schedulerAssignmentsTable).where(where).orderBy(schedulerAssignmentsTable.dueDate).limit(pageLimit).offset(pageOffset);
  const enriched = await Promise.all(assignments.map(enrichAssignment));
  res.json({ data: enriched, total, limit: pageLimit, offset: pageOffset });
});

router.post("/assignments", async (req, res): Promise<void> => {
  const tutorId = req.tutorId!;
  const studentId = sanitizePositiveFloat(req.body.studentId) ?? 0;
  const classId = req.body.classId ? (sanitizePositiveFloat(req.body.classId) ?? null) : null;
  const title = sanitizeStr(req.body.title);
  const dueDate = sanitizeDate(req.body.dueDate);
  const estimatedHours = req.body.estimatedHours !== undefined ? sanitizePositiveFloat(req.body.estimatedHours, 1000) : null;
  const priority = req.body.priority;
  const notes = sanitizeNotes(req.body.notes);
  const agreedAmount = req.body.agreedAmount !== undefined ? sanitizePositiveFloat(req.body.agreedAmount) : null;

  if (!studentId || !title || !dueDate) {
    res.status(400).json({ error: "Bad Request", message: "studentId, title, and dueDate are required" });
    return;
  }

  const [student] = await db.select({ id: schedulerStudentsTable.id }).from(schedulerStudentsTable).where(and(eq(schedulerStudentsTable.id, studentId), eq(schedulerStudentsTable.tutorId, tutorId)));
  if (!student) { res.status(403).json({ error: "Forbidden", message: "Student not found or not owned by this tutor" }); return; }

  if (classId) {
    const [ownedClass] = await db.select({ id: schedulerClassesTable.id }).from(schedulerClassesTable).where(and(eq(schedulerClassesTable.id, classId), eq(schedulerClassesTable.tutorId, tutorId)));
    if (!ownedClass) { res.status(403).json({ error: "Forbidden", message: "Class not found or not owned by this tutor" }); return; }
  }

  const [assignment] = await db.insert(schedulerAssignmentsTable).values({
    tutorId, studentId, classId: classId ?? null, title, dueDate,
    estimatedHours: estimatedHours ?? null,
    priority: priority && isValidPriority(priority) ? priority : "medium",
    status: "not_started", notes: notes ?? null, isRecurring: false, agreedAmount: agreedAmount ?? null,
  }).returning();

  const enriched = await enrichAssignment(assignment);
  res.status(201).json(enriched);
});

router.get("/assignments/:assignmentId", async (req, res): Promise<void> => {
  const tutorId = req.tutorId!;
  const assignmentId = parseInt(req.params.assignmentId, 10);

  const [assignment] = await db.select().from(schedulerAssignmentsTable).where(and(eq(schedulerAssignmentsTable.id, assignmentId), eq(schedulerAssignmentsTable.tutorId, tutorId)));
  if (!assignment) { res.status(404).json({ error: "Not Found", message: "Assignment not found" }); return; }
  res.json(await enrichAssignment(assignment));
});

router.put("/assignments/:assignmentId", async (req, res): Promise<void> => {
  const tutorId = req.tutorId!;
  const assignmentId = parseInt(req.params.assignmentId, 10);

  const [existing] = await db.select().from(schedulerAssignmentsTable).where(and(eq(schedulerAssignmentsTable.id, assignmentId), eq(schedulerAssignmentsTable.tutorId, tutorId)));
  if (!existing) { res.status(404).json({ error: "Not Found", message: "Assignment not found" }); return; }

  const updates: Partial<typeof schedulerAssignmentsTable.$inferInsert> = {};

  if (req.body.studentId !== undefined) {
    const newStudentId = sanitizePositiveFloat(req.body.studentId);
    if (newStudentId) {
      const [owned] = await db.select({ id: schedulerStudentsTable.id }).from(schedulerStudentsTable).where(and(eq(schedulerStudentsTable.id, newStudentId), eq(schedulerStudentsTable.tutorId, tutorId)));
      if (!owned) { res.status(403).json({ error: "Forbidden", message: "Target student not owned by this tutor" }); return; }
      updates.studentId = newStudentId;
    }
  }
  if (req.body.classId !== undefined) {
    if (!req.body.classId) {
      updates.classId = null;
    } else {
      const newClassId = sanitizePositiveFloat(req.body.classId);
      if (newClassId) {
        const [ownedClass] = await db.select({ id: schedulerClassesTable.id }).from(schedulerClassesTable).where(and(eq(schedulerClassesTable.id, newClassId), eq(schedulerClassesTable.tutorId, tutorId)));
        if (!ownedClass) { res.status(403).json({ error: "Forbidden", message: "Target class not owned by this tutor" }); return; }
        updates.classId = newClassId;
      }
    }
  }
  if (req.body.title !== undefined) { const v = sanitizeStr(req.body.title); if (v) updates.title = v; }
  if (req.body.dueDate !== undefined) { const v = sanitizeDate(req.body.dueDate); if (v) updates.dueDate = v; }
  if (req.body.estimatedHours !== undefined) updates.estimatedHours = req.body.estimatedHours ? sanitizePositiveFloat(req.body.estimatedHours, 1000) ?? null : null;
  if (req.body.priority !== undefined && isValidPriority(req.body.priority)) updates.priority = req.body.priority;
  if (req.body.status !== undefined && isValidStatus(req.body.status)) updates.status = req.body.status;
  if (req.body.notes !== undefined) updates.notes = sanitizeNotes(req.body.notes) ?? null;
  if (req.body.agreedAmount !== undefined) updates.agreedAmount = req.body.agreedAmount ? sanitizePositiveFloat(req.body.agreedAmount) ?? null : null;

  const [updated] = await db.update(schedulerAssignmentsTable).set(updates).where(eq(schedulerAssignmentsTable.id, assignmentId)).returning();
  res.json(await enrichAssignment(updated));
});

router.delete("/assignments/:assignmentId", async (req, res): Promise<void> => {
  const tutorId = req.tutorId!;
  const assignmentId = parseInt(req.params.assignmentId, 10);

  const [existing] = await db.select().from(schedulerAssignmentsTable).where(and(eq(schedulerAssignmentsTable.id, assignmentId), eq(schedulerAssignmentsTable.tutorId, tutorId)));
  if (!existing) { res.status(404).json({ error: "Not Found", message: "Assignment not found" }); return; }

  await db.delete(schedulerAssignmentsTable).where(eq(schedulerAssignmentsTable.id, assignmentId));
  res.sendStatus(204);
});

router.patch("/assignments/:assignmentId/status", async (req, res): Promise<void> => {
  const tutorId = req.tutorId!;
  const assignmentId = parseInt(req.params.assignmentId, 10);
  const { status } = req.body as { status?: string };

  if (!status || !isValidStatus(status)) {
    res.status(400).json({ error: "Bad Request", message: "Valid status is required: not_started, in_progress, completed, submitted" });
    return;
  }

  const [existing] = await db.select().from(schedulerAssignmentsTable).where(and(eq(schedulerAssignmentsTable.id, assignmentId), eq(schedulerAssignmentsTable.tutorId, tutorId)));
  if (!existing) { res.status(404).json({ error: "Not Found", message: "Assignment not found" }); return; }

  const [updated] = await db.update(schedulerAssignmentsTable).set({ status }).where(eq(schedulerAssignmentsTable.id, assignmentId)).returning();
  res.json(await enrichAssignment(updated));
});

router.patch("/assignments/:assignmentId/reschedule", async (req, res): Promise<void> => {
  const tutorId = req.tutorId!;
  const assignmentId = parseInt(req.params.assignmentId, 10);
  const { dueDate } = req.body as { dueDate?: string };

  if (!dueDate) { res.status(400).json({ error: "Bad Request", message: "dueDate is required" }); return; }

  const parsedDate = new Date(dueDate);
  if (isNaN(parsedDate.getTime())) { res.status(400).json({ error: "Bad Request", message: "dueDate must be a valid ISO date string" }); return; }

  const [existing] = await db.select().from(schedulerAssignmentsTable).where(and(eq(schedulerAssignmentsTable.id, assignmentId), eq(schedulerAssignmentsTable.tutorId, tutorId)));
  if (!existing) { res.status(404).json({ error: "Not Found", message: "Assignment not found" }); return; }

  const [updated] = await db.update(schedulerAssignmentsTable).set({ dueDate: parsedDate, notified48h: false, notifiedDayOf: false, notified2h: false }).where(eq(schedulerAssignmentsTable.id, assignmentId)).returning();
  res.json(await enrichAssignment(updated));
});

router.get("/calendar", async (req, res): Promise<void> => {
  const tutorId = req.tutorId!;
  const { year, month } = req.query as Record<string, string>;

  if (!year || !month) { res.status(400).json({ error: "Bad Request", message: "year and month are required" }); return; }

  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  if (isNaN(y) || isNaN(m) || m < 1 || m > 12) { res.status(400).json({ error: "Bad Request", message: "year and month must be valid numbers" }); return; }

  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0, 23, 59, 59);

  const assignments = await db.select().from(schedulerAssignmentsTable).where(and(eq(schedulerAssignmentsTable.tutorId, tutorId), gte(schedulerAssignmentsTable.dueDate, start), lte(schedulerAssignmentsTable.dueDate, end))).orderBy(schedulerAssignmentsTable.dueDate);
  res.json(await Promise.all(assignments.map(enrichAssignment)));
});

router.get("/weekly", async (req, res): Promise<void> => {
  const tutorId = req.tutorId!;
  const { weekStart } = req.query as Record<string, string>;

  if (!weekStart) { res.status(400).json({ error: "Bad Request", message: "weekStart is required (YYYY-MM-DD)" }); return; }

  const start = parseISO(weekStart);
  if (isNaN(start.getTime())) { res.status(400).json({ error: "Bad Request", message: "weekStart must be a valid date (YYYY-MM-DD)" }); return; }

  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59);

  const assignments = await db.select().from(schedulerAssignmentsTable).where(and(eq(schedulerAssignmentsTable.tutorId, tutorId), gte(schedulerAssignmentsTable.dueDate, start), lte(schedulerAssignmentsTable.dueDate, end))).orderBy(schedulerAssignmentsTable.dueDate);
  res.json(await Promise.all(assignments.map(enrichAssignment)));
});

router.get("/search", async (req, res): Promise<void> => {
  const tutorId = req.tutorId!;
  const { q } = req.query as Record<string, string>;

  if (!q || q.length < 2) { res.status(400).json({ error: "Bad Request", message: "q must be at least 2 characters" }); return; }

  const [students, assignments] = await Promise.all([
    db.select().from(schedulerStudentsTable).where(and(eq(schedulerStudentsTable.tutorId, tutorId), ilike(schedulerStudentsTable.name, `%${q}%`))),
    db.select().from(schedulerAssignmentsTable).where(and(eq(schedulerAssignmentsTable.tutorId, tutorId), ilike(schedulerAssignmentsTable.title, `%${q}%`))),
  ]);

  const enrichedStudents = await Promise.all(students.map(async (s) => {
    const asgns = await db.select({ status: schedulerAssignmentsTable.status }).from(schedulerAssignmentsTable).where(eq(schedulerAssignmentsTable.studentId, s.id));
    const total = asgns.length;
    const completed = asgns.filter((a) => a.status === "completed" || a.status === "submitted").length;
    return { ...s, totalAssignments: total, completedAssignments: completed, completionRate: total > 0 ? Math.round((completed / total) * 100) : 0 };
  }));

  res.json({ students: enrichedStudents, assignments: await Promise.all(assignments.map(enrichAssignment)) });
});

router.get("/export/assignments", async (req, res): Promise<void> => {
  const tutorId = req.tutorId!;
  const { studentId, status, dateFrom, dateTo } = req.query as Record<string, string>;

  const conditions = [eq(schedulerAssignmentsTable.tutorId, tutorId)];
  if (studentId) conditions.push(eq(schedulerAssignmentsTable.studentId, parseInt(studentId, 10)));
  if (status && isValidStatus(status)) conditions.push(eq(schedulerAssignmentsTable.status, status));
  if (dateFrom) {
    const from = new Date(dateFrom);
    from.setUTCHours(0, 0, 0, 0);
    conditions.push(gte(schedulerAssignmentsTable.dueDate, from));
  }
  if (dateTo) {
    const to = new Date(dateTo);
    to.setUTCHours(23, 59, 59, 999);
    conditions.push(lte(schedulerAssignmentsTable.dueDate, to));
  }

  const assignments = await db.select().from(schedulerAssignmentsTable).where(and(...conditions)).orderBy(schedulerAssignmentsTable.dueDate);
  const enriched = await Promise.all(assignments.map(enrichAssignment));

  const headers = ["ID", "Student", "Title", "Subject", "Due Date", "Priority", "Status", "Estimated Hours", "Agreed Amount", "Recurring", "Created At"];
  const rows = enriched.map((a) => [
    a.id, `"${a.studentName.replace(/"/g, '""')}"`, `"${a.title.replace(/"/g, '""')}"`,
    `"${(a.subject ?? "").replace(/"/g, '""')}"`, format(new Date(a.dueDate), "yyyy-MM-dd HH:mm"),
    a.priority, a.status, a.estimatedHours ?? "", a.agreedAmount ?? "",
    a.isRecurring ? "Yes" : "No", format(new Date(a.createdAt), "yyyy-MM-dd"),
  ].join(","));

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="assignments.csv"');
  res.send([headers.join(","), ...rows].join("\n"));
});

export default router;
