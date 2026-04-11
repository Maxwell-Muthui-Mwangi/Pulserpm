import { Router, type IRouter } from "express";
import { db } from "../lib/db.js";
import { schedulerClassesTable, schedulerStudentsTable, schedulerAssignmentsTable } from "../schema/index.js";
import { eq, and } from "drizzle-orm";
import { schedulerAuthMiddleware } from "../middlewares/auth.js";
import { eachDayOfInterval, parseISO } from "date-fns";

const router: IRouter = Router();
router.use(schedulerAuthMiddleware);

function parseRecurringDays(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

async function generateRecurringAssignments(tutorId: number, studentId: number, classId: number, courseName: string, semesterStart: string, semesterEnd: string, recurringDays: number[], estimatedHours?: number | null) {
  const start = parseISO(semesterStart);
  const end = parseISO(semesterEnd);
  const days = eachDayOfInterval({ start, end });
  const sessionDays = days.filter((d) => recurringDays.includes(d.getDay()));
  if (sessionDays.length === 0) return;
  const assignments = sessionDays.map((day) => ({
    tutorId, studentId, classId,
    title: `${courseName} - Session`,
    dueDate: new Date(day.setHours(23, 59, 0, 0)),
    priority: "medium" as const,
    status: "not_started" as const,
    isRecurring: true,
    estimatedHours: estimatedHours || null,
  }));
  if (assignments.length > 0) await db.insert(schedulerAssignmentsTable).values(assignments);
}

router.get("/classes", async (req, res): Promise<void> => {
  const tutorId = req.tutorId!;
  const { studentId, search } = req.query as Record<string, string>;

  const conditions = [eq(schedulerClassesTable.tutorId, tutorId)];
  if (studentId) conditions.push(eq(schedulerClassesTable.studentId, parseInt(studentId, 10)));

  const classes = await db.select().from(schedulerClassesTable).where(and(...conditions)).orderBy(schedulerClassesTable.createdAt);
  const students = await db.select({ id: schedulerStudentsTable.id, name: schedulerStudentsTable.name }).from(schedulerStudentsTable).where(eq(schedulerStudentsTable.tutorId, tutorId));
  const studentMap = Object.fromEntries(students.map((s) => [s.id, s.name]));

  let result = classes.map((c) => ({ ...c, recurringDays: parseRecurringDays(c.recurringDays), studentName: studentMap[c.studentId] || "Unknown" }));
  if (search) {
    const q = search.toLowerCase();
    result = result.filter((c) => c.courseName.toLowerCase().includes(q) || (c.subject?.toLowerCase().includes(q)));
  }
  res.json(result);
});

router.post("/classes", async (req, res): Promise<void> => {
  const tutorId = req.tutorId!;
  const {
    studentId, courseName, subject, notes,
    isRecurring, recurringDays, date,
    startTime, endTime, semesterStart, semesterEnd,
    location, hourlyRate, agreedAmount, status,
  } = req.body;

  if (!studentId || !courseName) {
    res.status(400).json({ error: "Bad Request", message: "studentId and courseName are required" });
    return;
  }

  const [student] = await db.select().from(schedulerStudentsTable).where(and(eq(schedulerStudentsTable.id, studentId), eq(schedulerStudentsTable.tutorId, tutorId)));
  if (!student) { res.status(404).json({ error: "Not Found", message: "Student not found" }); return; }

  const [cls] = await db.insert(schedulerClassesTable).values({
    tutorId, studentId, courseName, subject: subject || null, notes: notes || null,
    isRecurring: !!isRecurring,
    recurringDays: recurringDays ? JSON.stringify(recurringDays) : null,
    date: date || null,
    startTime: startTime || null,
    endTime: endTime || null,
    semesterStart: semesterStart || null,
    semesterEnd: semesterEnd || null,
    location: location || null,
    hourlyRate: hourlyRate ?? null,
    agreedAmount: agreedAmount ?? null,
    status: status || "active",
  }).returning();

  if (isRecurring && semesterStart && semesterEnd && recurringDays?.length) {
    await generateRecurringAssignments(tutorId, studentId, cls.id, courseName, semesterStart, semesterEnd, recurringDays);
  }

  res.status(201).json({ ...cls, recurringDays: parseRecurringDays(cls.recurringDays), studentName: student.name });
});

router.get("/classes/:classId", async (req, res): Promise<void> => {
  const tutorId = req.tutorId!;
  const classId = parseInt(req.params.classId, 10);

  const [cls] = await db.select().from(schedulerClassesTable).where(and(eq(schedulerClassesTable.id, classId), eq(schedulerClassesTable.tutorId, tutorId)));
  if (!cls) { res.status(404).json({ error: "Not Found", message: "Class not found" }); return; }

  const [student] = await db.select({ name: schedulerStudentsTable.name }).from(schedulerStudentsTable).where(eq(schedulerStudentsTable.id, cls.studentId));
  res.json({ ...cls, recurringDays: parseRecurringDays(cls.recurringDays), studentName: student?.name || "Unknown" });
});

router.put("/classes/:classId", async (req, res): Promise<void> => {
  const tutorId = req.tutorId!;
  const classId = parseInt(req.params.classId, 10);

  const [existing] = await db.select().from(schedulerClassesTable).where(and(eq(schedulerClassesTable.id, classId), eq(schedulerClassesTable.tutorId, tutorId)));
  if (!existing) { res.status(404).json({ error: "Not Found", message: "Class not found" }); return; }

  const {
    courseName, subject, notes,
    isRecurring, recurringDays, date,
    startTime, endTime, semesterStart, semesterEnd,
    location, hourlyRate, agreedAmount, status,
  } = req.body;

  const updates: Partial<typeof schedulerClassesTable.$inferInsert> = {};
  if (courseName !== undefined) updates.courseName = courseName;
  if (subject !== undefined) updates.subject = subject;
  if (notes !== undefined) updates.notes = notes;
  if (isRecurring !== undefined) updates.isRecurring = !!isRecurring;
  if (recurringDays !== undefined) updates.recurringDays = recurringDays ? JSON.stringify(recurringDays) : null;
  if (date !== undefined) updates.date = date || null;
  if (startTime !== undefined) updates.startTime = startTime || null;
  if (endTime !== undefined) updates.endTime = endTime || null;
  if (semesterStart !== undefined) updates.semesterStart = semesterStart || null;
  if (semesterEnd !== undefined) updates.semesterEnd = semesterEnd || null;
  if (location !== undefined) updates.location = location || null;
  if (hourlyRate !== undefined) updates.hourlyRate = hourlyRate ?? null;
  if (agreedAmount !== undefined) updates.agreedAmount = agreedAmount ?? null;
  if (status !== undefined) updates.status = status;

  const [updated] = await db.update(schedulerClassesTable).set(updates).where(eq(schedulerClassesTable.id, classId)).returning();
  const [student] = await db.select({ name: schedulerStudentsTable.name }).from(schedulerStudentsTable).where(eq(schedulerStudentsTable.id, updated.studentId));
  res.json({ ...updated, recurringDays: parseRecurringDays(updated.recurringDays), studentName: student?.name || "Unknown" });
});

router.delete("/classes/:classId", async (req, res): Promise<void> => {
  const tutorId = req.tutorId!;
  const classId = parseInt(req.params.classId, 10);

  const [existing] = await db.select().from(schedulerClassesTable).where(and(eq(schedulerClassesTable.id, classId), eq(schedulerClassesTable.tutorId, tutorId)));
  if (!existing) { res.status(404).json({ error: "Not Found", message: "Class not found" }); return; }

  await db.delete(schedulerClassesTable).where(eq(schedulerClassesTable.id, classId));
  res.sendStatus(204);
});

export default router;
