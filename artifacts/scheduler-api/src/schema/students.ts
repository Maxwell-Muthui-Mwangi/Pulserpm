import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { schedulerTutorsTable } from "./tutors.js";

export const schedulerStudentsTable = pgTable("scheduler_students", {
  id: serial("id").primaryKey(),
  tutorId: integer("tutor_id").notNull().references(() => schedulerTutorsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  notes: text("notes"),
  status: text("status", { enum: ["active", "archived"] }).notNull().default("active"),
  color: text("color").notNull().default("#6366f1"),
  paymentStatus: text("payment_status", { enum: ["paid", "pending", "overdue"] }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("idx_sched_students_tutor_id").on(t.tutorId),
  index("idx_sched_students_status").on(t.tutorId, t.status),
]);

export type SchedulerStudent = typeof schedulerStudentsTable.$inferSelect;
export type InsertSchedulerStudent = typeof schedulerStudentsTable.$inferInsert;
