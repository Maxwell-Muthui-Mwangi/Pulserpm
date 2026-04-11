import { pgTable, text, serial, timestamp, integer, boolean, real, index } from "drizzle-orm/pg-core";
import { schedulerTutorsTable } from "./tutors.js";
import { schedulerStudentsTable } from "./students.js";
import { schedulerClassesTable } from "./classes.js";

export const schedulerAssignmentsTable = pgTable("scheduler_assignments", {
  id: serial("id").primaryKey(),
  tutorId: integer("tutor_id").notNull().references(() => schedulerTutorsTable.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => schedulerStudentsTable.id, { onDelete: "cascade" }),
  classId: integer("class_id").references(() => schedulerClassesTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  subject: text("subject"),
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  estimatedHours: real("estimated_hours"),
  priority: text("priority", { enum: ["low", "medium", "high", "urgent"] }).notNull().default("medium"),
  status: text("status", { enum: ["not_started", "in_progress", "completed", "submitted"] }).notNull().default("not_started"),
  notes: text("notes"),
  isRecurring: boolean("is_recurring").notNull().default(false),
  agreedAmount: real("agreed_amount"),
  notified48h: boolean("notified_48h").notNull().default(false),
  notifiedDayOf: boolean("notified_day_of").notNull().default(false),
  notified2h: boolean("notified_2h").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("idx_sched_assignments_tutor_id").on(t.tutorId),
  index("idx_sched_assignments_student_id").on(t.studentId),
  index("idx_sched_assignments_due_date").on(t.dueDate),
  index("idx_sched_assignments_status").on(t.status),
  index("idx_sched_assignments_tutor_due").on(t.tutorId, t.dueDate),
]);

export type SchedulerAssignment = typeof schedulerAssignmentsTable.$inferSelect;
export type InsertSchedulerAssignment = typeof schedulerAssignmentsTable.$inferInsert;
