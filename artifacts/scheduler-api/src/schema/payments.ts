import { pgTable, text, serial, timestamp, integer, real, date, index } from "drizzle-orm/pg-core";
import { schedulerTutorsTable } from "./tutors.js";
import { schedulerStudentsTable } from "./students.js";
import { schedulerAssignmentsTable } from "./assignments.js";
import { schedulerClassesTable } from "./classes.js";

export const schedulerPaymentsTable = pgTable("scheduler_payments", {
  id: serial("id").primaryKey(),
  tutorId: integer("tutor_id").notNull().references(() => schedulerTutorsTable.id, { onDelete: "cascade" }),
  studentId: integer("student_id").notNull().references(() => schedulerStudentsTable.id, { onDelete: "cascade" }),
  assignmentId: integer("assignment_id").references(() => schedulerAssignmentsTable.id, { onDelete: "set null" }),
  classId: integer("class_id").references(() => schedulerClassesTable.id, { onDelete: "set null" }),
  description: text("description").notNull(),
  agreedAmount: real("agreed_amount").notNull().default(0),
  paidAmount: real("paid_amount").notNull().default(0),
  status: text("status", { enum: ["pending", "paid", "partial", "overdue"] }).notNull().default("pending"),
  paymentDate: date("payment_date"),
  dueDate: date("due_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("idx_sched_payments_tutor_id").on(t.tutorId),
  index("idx_sched_payments_student_id").on(t.studentId),
  index("idx_sched_payments_status").on(t.tutorId, t.status),
]);

export type SchedulerPayment = typeof schedulerPaymentsTable.$inferSelect;
export type InsertSchedulerPayment = typeof schedulerPaymentsTable.$inferInsert;
