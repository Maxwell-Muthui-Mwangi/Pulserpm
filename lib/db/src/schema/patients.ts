import { pgTable, serial, text, timestamp, integer, date, uuid, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { providersTable } from "./providers";

export const patientsTable = pgTable("patients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  dateOfBirth: date("date_of_birth"),
  gender: text("gender"),
  conditions: text("conditions").array().notNull().default([]),
  providerId: integer("provider_id").references(() => providersTable.id),
  deviceType: text("device_type").default("manual"),
  deviceApiKey: uuid("device_api_key"),
  role: text("role").notNull().default("patient"),
  approvalWelcomePending: boolean("approval_welcome_pending").notNull().default(false),
  passwordResetCode: text("password_reset_code"),
  passwordResetCodeExpiry: timestamp("password_reset_code_expiry"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPatientSchema = createInsertSchema(patientsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPatient = z.infer<typeof insertPatientSchema>;
export type Patient = typeof patientsTable.$inferSelect;
