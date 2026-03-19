import { pgTable, serial, integer, real, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { patientsTable } from "./patients";

export const alertsTable = pgTable("alerts", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id),
  vitalType: text("vital_type").notNull(),
  severity: text("severity").notNull(),
  message: text("message").notNull(),
  value: real("value"),
  threshold: real("threshold"),
  status: text("status").notNull().default("active"),
  suggestedAction: text("suggested_action"),
  triggeredAt: timestamp("triggered_at").notNull().defaultNow(),
  acknowledgedAt: timestamp("acknowledged_at"),
  resolvedAt: timestamp("resolved_at"),
});

export const insertAlertSchema = createInsertSchema(alertsTable).omit({
  id: true,
});

export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alertsTable.$inferSelect;
