import { pgTable, serial, integer, real, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { patientsTable } from "./patients";

export const vitalsTable = pgTable("vitals", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id),
  heartRate: real("heart_rate"),
  systolicBp: real("systolic_bp"),
  diastolicBp: real("diastolic_bp"),
  spo2: real("spo2"),
  caloriesBurned: real("calories_burned"),
  temperature: real("temperature"),
  source: text("source").notNull().default("manual"),
  recordedAt: timestamp("recorded_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertVitalsSchema = createInsertSchema(vitalsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertVitals = z.infer<typeof insertVitalsSchema>;
export type Vitals = typeof vitalsTable.$inferSelect;
