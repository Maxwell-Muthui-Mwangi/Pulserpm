import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { schedulerTutorsTable } from "./tutors.js";
import { schedulerAssignmentsTable } from "./assignments.js";

export const schedulerNotificationsTable = pgTable("scheduler_notifications", {
  id: serial("id").primaryKey(),
  tutorId: integer("tutor_id").notNull().references(() => schedulerTutorsTable.id, { onDelete: "cascade" }),
  assignmentId: integer("assignment_id").references(() => schedulerAssignmentsTable.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["reminder_48h", "day_of", "urgent_2h", "weekly_digest"] }).notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  email: text("email").notNull(),
  subject: text("subject").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SchedulerNotification = typeof schedulerNotificationsTable.$inferSelect;
export type InsertSchedulerNotification = typeof schedulerNotificationsTable.$inferInsert;
