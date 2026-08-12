import { pgTable, serial, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pendingPatientsTable = pgTable("pending_patients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  verificationCode: text("verification_code").notNull(),
  verificationExpiry: timestamp("verification_expiry").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  preferredProviderId: integer("preferred_provider_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPendingPatientSchema = createInsertSchema(pendingPatientsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertPendingPatient = z.infer<typeof insertPendingPatientSchema>;
export type PendingPatient = typeof pendingPatientsTable.$inferSelect;
