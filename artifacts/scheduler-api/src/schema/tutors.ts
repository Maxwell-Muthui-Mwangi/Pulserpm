import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const schedulerTutorsTable = pgTable("scheduler_tutors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type SchedulerTutor = typeof schedulerTutorsTable.$inferSelect;
export type InsertSchedulerTutor = typeof schedulerTutorsTable.$inferInsert;
