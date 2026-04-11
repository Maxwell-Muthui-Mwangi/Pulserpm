import { Router, type IRouter } from "express";
import { db } from "../lib/db.js";
import { schedulerAssignmentsTable, schedulerStudentsTable, schedulerPaymentsTable } from "../schema/index.js";
import { eq, and, gte, lte, lt, sql } from "drizzle-orm";
import { schedulerAuthMiddleware } from "../middlewares/auth.js";
import { startOfDay, endOfDay, addDays, subDays, format, addHours } from "date-fns";

const router: IRouter = Router();
router.use(schedulerAuthMiddleware);

async function enrichAssignment(a: typeof schedulerAssignmentsTable.$inferSelect) {
  const [student] = await db.select({ name: schedulerStudentsTable.name, color: schedulerStudentsTable.color }).from(schedulerStudentsTable).where(eq(schedulerStudentsTable.id, a.studentId));
  return { ...a, studentName: student?.name || "Unknown", studentColor: student?.color || "#6366f1", className: null as string | null };
}

router.get("/dashboard", async (req, res): Promise<void> => {
  const tutorId = req.tutorId!;
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const next7Days = addDays(now, 7);
  const twoHoursFromNow = addHours(now, 2);

  const [students, allActive, todayRaw, upcomingRaw, urgentRaw, overdueRaw, weekPayments] = await Promise.all([
    db.select({ id: schedulerStudentsTable.id }).from(schedulerStudentsTable).where(and(eq(schedulerStudentsTable.tutorId, tutorId), eq(schedulerStudentsTable.status, "active"))),
    db.select({ status: schedulerAssignmentsTable.status }).from(schedulerAssignmentsTable).where(and(eq(schedulerAssignmentsTable.tutorId, tutorId), sql`status NOT IN ('completed', 'submitted')`)),
    db.select().from(schedulerAssignmentsTable).where(and(eq(schedulerAssignmentsTable.tutorId, tutorId), gte(schedulerAssignmentsTable.dueDate, todayStart), lte(schedulerAssignmentsTable.dueDate, todayEnd))).orderBy(schedulerAssignmentsTable.dueDate),
    db.select().from(schedulerAssignmentsTable).where(and(eq(schedulerAssignmentsTable.tutorId, tutorId), gte(schedulerAssignmentsTable.dueDate, now), lte(schedulerAssignmentsTable.dueDate, next7Days), sql`status NOT IN ('completed', 'submitted')`)).orderBy(schedulerAssignmentsTable.dueDate),
    db.select().from(schedulerAssignmentsTable).where(and(eq(schedulerAssignmentsTable.tutorId, tutorId), eq(schedulerAssignmentsTable.priority, "urgent"), sql`status NOT IN ('completed', 'submitted')`)).orderBy(schedulerAssignmentsTable.dueDate),
    db.select().from(schedulerAssignmentsTable).where(and(eq(schedulerAssignmentsTable.tutorId, tutorId), lt(schedulerAssignmentsTable.dueDate, now), sql`status NOT IN ('completed', 'submitted')`)).orderBy(schedulerAssignmentsTable.dueDate),
    db.select({ paidAmount: schedulerPaymentsTable.paidAmount, status: schedulerPaymentsTable.status }).from(schedulerPaymentsTable).where(and(eq(schedulerPaymentsTable.tutorId, tutorId), gte(schedulerPaymentsTable.createdAt, subDays(now, 7)), eq(schedulerPaymentsTable.status, "paid"))),
  ]);

  const allAssignments = await db.select({ status: schedulerAssignmentsTable.status }).from(schedulerAssignmentsTable).where(eq(schedulerAssignmentsTable.tutorId, tutorId));
  const totalAssignments = allAssignments.length;
  const completedAssignments = allAssignments.filter((a) => a.status === "completed" || a.status === "submitted").length;

  const [todayEnriched, upcomingEnriched, urgentEnriched, overdueEnriched] = await Promise.all([
    Promise.all(todayRaw.map(enrichAssignment)),
    Promise.all(upcomingRaw.map(enrichAssignment)),
    Promise.all(urgentRaw.map(enrichAssignment)),
    Promise.all(overdueRaw.map(enrichAssignment)),
  ]);

  res.json({
    stats: {
      totalStudents: students.length,
      activeAssignments: allActive.length,
      completionRate: totalAssignments > 0 ? Math.round((completedAssignments / totalAssignments) * 100) : 0,
      weeklyEarnings: weekPayments.reduce((sum, p) => sum + (p.paidAmount || 0), 0),
      overdueCount: overdueRaw.length,
      urgentCount: urgentRaw.length,
    },
    todaysAssignments: todayEnriched,
    upcomingAssignments: upcomingEnriched,
    urgentAssignments: urgentEnriched,
    overdueAssignments: overdueEnriched,
  });
});

router.get("/dashboard/heatmap", async (req, res): Promise<void> => {
  const tutorId = req.tutorId!;
  const weeks = parseInt((req.query.weeks as string) || "16", 10);
  const end = new Date();
  const start = subDays(end, weeks * 7);

  const assignments = await db.select({ dueDate: schedulerAssignmentsTable.dueDate }).from(schedulerAssignmentsTable).where(and(eq(schedulerAssignmentsTable.tutorId, tutorId), gte(schedulerAssignmentsTable.dueDate, start), lte(schedulerAssignmentsTable.dueDate, end)));

  const countMap: Record<string, number> = {};
  for (const a of assignments) {
    const key = format(new Date(a.dueDate), "yyyy-MM-dd");
    countMap[key] = (countMap[key] || 0) + 1;
  }

  const maxCount = Math.max(...Object.values(countMap), 1);
  const days: { date: string; count: number; level: number }[] = [];
  for (let i = weeks * 7; i >= 0; i--) {
    const d = subDays(end, i);
    const key = format(d, "yyyy-MM-dd");
    const count = countMap[key] || 0;
    days.push({ date: key, count, level: count === 0 ? 0 : Math.ceil((count / maxCount) * 4) });
  }

  res.json(days);
});

export default router;
