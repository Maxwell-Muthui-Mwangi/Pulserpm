import { pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const providersTable = pgTable("providers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  specialty: text("specialty"),
  role: text("role").notNull().default("provider"),
  emailVerified: boolean("email_verified").notNull().default(false),
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
  isManager: boolean("is_manager").notNull().default(false),
  approved: boolean("approved").notNull().default(false),
  approvedAt: timestamp("approved_at"),
  approvedBy: integer("approved_by"),
  verificationCode: text("verification_code"),
  verificationCodeExpiry: timestamp("verification_code_expiry"),
  passwordResetCode: text("password_reset_code"),
  passwordResetCodeExpiry: timestamp("password_reset_code_expiry"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProviderSchema = createInsertSchema(providersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProvider = z.infer<typeof insertProviderSchema>;
export type Provider = typeof providersTable.$inferSelect;
