import { Router } from "express";
import { db, providersTable, patientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword, createToken } from "../lib/auth.js";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "Bad Request", message: "Email and password required" });
      return;
    }

    const [provider] = await db
      .select()
      .from(providersTable)
      .where(eq(providersTable.email, email))
      .limit(1);

    if (provider && verifyPassword(password, provider.passwordHash)) {
      const token = createToken({ id: provider.id, email: provider.email, role: provider.role });
      res.json({
        token,
        user: { id: provider.id, email: provider.email, name: provider.name, role: provider.role },
      });
      return;
    }

    const [patient] = await db
      .select()
      .from(patientsTable)
      .where(eq(patientsTable.email, email))
      .limit(1);

    if (patient && verifyPassword(password, patient.passwordHash)) {
      const token = createToken({ id: patient.id, email: patient.email, role: patient.role });
      res.json({
        token,
        user: { id: patient.id, email: patient.email, name: patient.name, role: patient.role },
      });
      return;
    }

    res.status(401).json({ error: "Unauthorized", message: "Invalid email or password" });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Login failed" });
  }
});

router.get("/auth/me", requireAuth, async (req, res) => {
  try {
    const user = req.user!;

    if (user.role === "provider" || user.role === "admin") {
      const [provider] = await db
        .select()
        .from(providersTable)
        .where(eq(providersTable.id, user.id))
        .limit(1);

      if (!provider) {
        res.status(404).json({ error: "Not Found", message: "User not found" });
        return;
      }
      res.json({ id: provider.id, email: provider.email, name: provider.name, role: provider.role });
    } else {
      const [patient] = await db
        .select()
        .from(patientsTable)
        .where(eq(patientsTable.id, user.id))
        .limit(1);

      if (!patient) {
        res.status(404).json({ error: "Not Found", message: "User not found" });
        return;
      }
      res.json({ id: patient.id, email: patient.email, name: patient.name, role: patient.role });
    }
  } catch (err) {
    console.error("Get me error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to fetch user" });
  }
});

export default router;
