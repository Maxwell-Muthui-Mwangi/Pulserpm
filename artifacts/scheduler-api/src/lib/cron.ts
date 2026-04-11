import cron from "node-cron";
import { db } from "./db.js";
import { schedulerAssignmentsTable, schedulerStudentsTable, schedulerNotificationsTable, schedulerTutorsTable } from "../schema/index.js";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { addHours, addDays, startOfDay, endOfDay, startOfWeek } from "date-fns";
import { sendEmail, buildReminderEmail, buildWeeklyDigestEmail } from "./email.js";
import { logger } from "./logger.js";

async function checkUpcomingAssignments() {
  const now = new Date();
  const in48h = addHours(now, 48);
  const in2h = addHours(now, 2);
  const in50h = addHours(now, 50);

  try {
    const assignments = await db.select().from(schedulerAssignmentsTable).where(and(
      gte(schedulerAssignmentsTable.dueDate, now),
      lte(schedulerAssignmentsTable.dueDate, in50h),
      sql`status NOT IN ('completed', 'submitted')`
    ));

    const tutorEmailCache = new Map<number, string>();

    for (const a of assignments) {
      let tutorEmail = tutorEmailCache.get(a.tutorId);
      if (!tutorEmail) {
        const [tutor] = await db.select({ email: schedulerTutorsTable.email }).from(schedulerTutorsTable).where(eq(schedulerTutorsTable.id, a.tutorId));
        tutorEmail = tutor?.email;
        if (tutorEmail) tutorEmailCache.set(a.tutorId, tutorEmail);
      }
      if (!tutorEmail) continue;

      const [student] = await db.select({ name: schedulerStudentsTable.name }).from(schedulerStudentsTable).where(eq(schedulerStudentsTable.id, a.studentId));
      const studentName = student?.name || "Unknown";
      const dueDate = new Date(a.dueDate);

      if (!a.notified2h && dueDate <= in2h) {
        const { subject, html } = buildReminderEmail(a.title, studentName, dueDate, "2h");
        const sent = await sendEmail(subject, html, tutorEmail);
        if (sent) {
          await db.update(schedulerAssignmentsTable).set({ notified2h: true }).where(eq(schedulerAssignmentsTable.id, a.id));
          await db.insert(schedulerNotificationsTable).values({ tutorId: a.tutorId, assignmentId: a.id, type: "urgent_2h", email: tutorEmail, subject });
        }
      } else if (!a.notifiedDayOf && dueDate >= startOfDay(now) && dueDate <= endOfDay(now)) {
        const { subject, html } = buildReminderEmail(a.title, studentName, dueDate, "day_of");
        const sent = await sendEmail(subject, html, tutorEmail);
        if (sent) {
          await db.update(schedulerAssignmentsTable).set({ notifiedDayOf: true }).where(eq(schedulerAssignmentsTable.id, a.id));
          await db.insert(schedulerNotificationsTable).values({ tutorId: a.tutorId, assignmentId: a.id, type: "day_of", email: tutorEmail, subject });
        }
      } else if (!a.notified48h && dueDate <= in48h) {
        const { subject, html } = buildReminderEmail(a.title, studentName, dueDate, "48h");
        const sent = await sendEmail(subject, html, tutorEmail);
        if (sent) {
          await db.update(schedulerAssignmentsTable).set({ notified48h: true }).where(eq(schedulerAssignmentsTable.id, a.id));
          await db.insert(schedulerNotificationsTable).values({ tutorId: a.tutorId, assignmentId: a.id, type: "reminder_48h", email: tutorEmail, subject });
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "Error checking upcoming assignments");
  }
}

async function sendWeeklyDigest() {
  const now = new Date();
  const in7Days = addDays(now, 7);
  const weekStart = startOfWeek(now, { weekStartsOn: 0 });

  try {
    const tutors = await db.select({ id: schedulerTutorsTable.id, email: schedulerTutorsTable.email }).from(schedulerTutorsTable);

    for (const tutor of tutors) {
      const alreadySent = await db.select({ id: schedulerNotificationsTable.id }).from(schedulerNotificationsTable).where(and(
        eq(schedulerNotificationsTable.tutorId, tutor.id),
        eq(schedulerNotificationsTable.type, "weekly_digest"),
        gte(schedulerNotificationsTable.sentAt, weekStart)
      )).limit(1);

      if (alreadySent.length > 0) { logger.info({ tutorId: tutor.id }, "Weekly digest already sent this week, skipping"); continue; }

      const assignments = await db.select().from(schedulerAssignmentsTable).where(and(
        eq(schedulerAssignmentsTable.tutorId, tutor.id),
        gte(schedulerAssignmentsTable.dueDate, now),
        lte(schedulerAssignmentsTable.dueDate, in7Days),
        sql`${schedulerAssignmentsTable.status} NOT IN ('completed', 'submitted')`
      )).orderBy(schedulerAssignmentsTable.dueDate);

      if (assignments.length === 0) { logger.info({ tutorId: tutor.id }, "No upcoming assignments for weekly digest"); continue; }

      const enriched = await Promise.all(assignments.map(async (a) => {
        const [student] = await db.select({ name: schedulerStudentsTable.name }).from(schedulerStudentsTable).where(eq(schedulerStudentsTable.id, a.studentId));
        return { title: a.title, studentName: student?.name || "Unknown", dueDate: new Date(a.dueDate), priority: a.priority };
      }));

      const { subject, html } = buildWeeklyDigestEmail(enriched);
      const sent = await sendEmail(subject, html, tutor.email);
      if (sent) {
        await db.insert(schedulerNotificationsTable).values({ tutorId: tutor.id, type: "weekly_digest", email: tutor.email, subject });
        logger.info({ tutorId: tutor.id, count: assignments.length }, "Weekly digest sent");
      }
    }
  } catch (err) {
    logger.error({ err }, "Error sending weekly digest");
  }
}

export function startSchedulerCron() {
  cron.schedule("*/15 * * * *", checkUpcomingAssignments);
  cron.schedule("0 19 * * 0", sendWeeklyDigest);
  logger.info("Scheduler cron jobs started (15min reminder check, Sunday 7pm digest)");
}
