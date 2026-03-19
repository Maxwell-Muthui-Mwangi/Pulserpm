import { pgTable, serial, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { patientsTable } from "./patients";

export const thresholdsTable = pgTable("thresholds", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().unique().references(() => patientsTable.id),
  heartRateMin: real("heart_rate_min").notNull().default(50),
  heartRateMax: real("heart_rate_max").notNull().default(100),
  heartRateCriticalMin: real("heart_rate_critical_min").notNull().default(40),
  heartRateCriticalMax: real("heart_rate_critical_max").notNull().default(120),
  systolicBpMin: real("systolic_bp_min").notNull().default(90),
  systolicBpMax: real("systolic_bp_max").notNull().default(140),
  systolicBpCriticalMin: real("systolic_bp_critical_min").notNull().default(80),
  systolicBpCriticalMax: real("systolic_bp_critical_max").notNull().default(180),
  diastolicBpMin: real("diastolic_bp_min").notNull().default(60),
  diastolicBpMax: real("diastolic_bp_max").notNull().default(90),
  diastolicBpCriticalMax: real("diastolic_bp_critical_max").notNull().default(120),
  spo2Min: real("spo2_min").notNull().default(95),
  spo2CriticalMin: real("spo2_critical_min").notNull().default(90),
  temperatureMin: real("temperature_min").notNull().default(36.0),
  temperatureMax: real("temperature_max").notNull().default(37.5),
  temperatureCriticalMax: real("temperature_critical_max").notNull().default(39.0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertThresholdSchema = createInsertSchema(thresholdsTable).omit({
  id: true,
  updatedAt: true,
});

export type InsertThreshold = z.infer<typeof insertThresholdSchema>;
export type Threshold = typeof thresholdsTable.$inferSelect;
