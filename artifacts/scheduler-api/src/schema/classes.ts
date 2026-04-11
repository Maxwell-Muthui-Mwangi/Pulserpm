import { pgTable, text, serial, timestamp, integer, date, real, boolean, index } from "drizzle-orm/pg-core";
import { schedulerTutorsTable } from "./tutors.js";
import { schedulerStudentsTable } from "./students.js";

export const schedulerClassesTable = pgTable("scheduler_classes", {
  id: serial("id").primaryKey(),
  tutorId: integer("tutor_id").notNull().references(() => schedulerTutorsTable.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => schedulerStudentsTable.id, { onDelete: "cascade" }),
  courseName: text("course_name").notNull(),
  subject: text("subject"),
  isRecurring: boolean("is_recurring").notNull().default(false),
  recurringDays: text("recurring_days"),
  date: date("date"),
  startTime: text("start_time"),
  endTime: text("end_time"),
  semesterStart: date("semester_start"),
  semesterEnd: date("semester_end"),
  location: text("location"),
  hourlyRate: integer("hourly_rate"),
  status: text("status").notNull().default("active"),
  agreedAmount: real("agreed_amount"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("idx_sched_classes_tutor_id").on(t.tutorId),
  index("idx_sched_classes_student_id").on(t.studentId),
]);

export type SchedulerClass = typeof schedulerClassesTable.$inferSelect;
export type InsertSchedulerClass = typeof schedulerClassesTable.$inferInsert;
