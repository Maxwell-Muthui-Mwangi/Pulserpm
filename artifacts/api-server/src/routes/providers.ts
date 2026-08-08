import { Router } from "express";
import { db, providersTable, patientsTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { hashPassword } from "../lib/auth.js";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

router.get("/providers", requireAuth, async (_req, res) => {
  try {
    const providers = await db.select().from(providersTable);
    const counts = await db
      .select({ providerId: patientsTable.providerId, count: count() })
      .from(patientsTable)
      .groupBy(patientsTable.providerId);

    const countMap = new Map(counts.map((c) => [c.providerId, Number(c.count)]));

    const result = providers.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      specialty: p.specialty,
      patientCount: countMap.get(p.id) ?? 0,
      createdAt: p.createdAt,
    }));

    res.json(result);
  } catch (err) {
    console.error("List providers error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to list providers" });
  }
});

router.post("/providers", requireAuth, async (req, res) => {
  try {
    const { name, email, password, specialty } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ error: "Bad Request", message: "name, email, and password are required" });
      return;
    }

    const [existing] = await db
      .select()
      .from(providersTable)
      .where(eq(providersTable.email, email))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: "Conflict", message: "Email already in use" });
      return;
    }

    const [provider] = await db
      .insert(providersTable)
      .values({
        name,
        email,
        passwordHash: hashPassword(password),
        specialty: specialty || null,
        role: "provider",
      })
      .returning();

    res.status(201).json({
      id: provider.id,
      name: provider.name,
      email: provider.email,
      specialty: provider.specialty,
      patientCount: 0,
      createdAt: provider.createdAt,
    });
  } catch (err) {
    console.error("Create provider error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to create provider" });
  }
});

export default router;
