import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const providersTable = pgTable("providers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  specialty: text("specialty"),
  role: text("role").notNull().default("provider"),
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
