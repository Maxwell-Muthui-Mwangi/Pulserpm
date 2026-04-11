import { Router, type IRouter } from "express";
import { db } from "../lib/db.js";
import { schedulerTutorsTable } from "../schema/index.js";
import { eq } from "drizzle-orm";
import { hashPassword, comparePassword, signToken } from "../lib/auth.js";
import { schedulerAuthMiddleware } from "../middlewares/auth.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

const COOKIE_NAME = "scheduler_session";

function cookieOptions(rememberMe: boolean) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000,
    path: "/",
  };
}

router.post("/auth/signup", async (req, res): Promise<void> => {
  const { name, email, password } = req.body as { name: string; email: string; password: string };
  if (!name || !email || !password) {
    res.status(400).json({ error: "Bad Request", message: "name, email, and password are required" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Bad Request", message: "Password must be at least 8 characters" });
    return;
  }

  const [existing] = await db.select({ id: schedulerTutorsTable.id }).from(schedulerTutorsTable).where(eq(schedulerTutorsTable.email, email));
  if (existing) {
    res.status(409).json({ error: "Conflict", message: "Email already in use" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const [tutor] = await db.insert(schedulerTutorsTable).values({ name, email, passwordHash }).returning();
  const token = signToken(tutor.id);
  res.cookie(COOKIE_NAME, token, cookieOptions(false));
  logger.info({ tutorId: tutor.id }, "New tutor registered");
  res.status(201).json({ tutor: { id: tutor.id, name: tutor.name, email: tutor.email, createdAt: tutor.createdAt } });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const { email, password, rememberMe } = req.body as { email: string; password: string; rememberMe?: boolean };
  if (!email || !password) {
    res.status(400).json({ error: "Bad Request", message: "email and password are required" });
    return;
  }

  const [tutor] = await db.select().from(schedulerTutorsTable).where(eq(schedulerTutorsTable.email, email));
  if (!tutor) {
    res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
    return;
  }

  const valid = await comparePassword(password, tutor.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
    return;
  }

  const token = signToken(tutor.id);
  res.cookie(COOKIE_NAME, token, cookieOptions(!!rememberMe));
  res.json({ tutor: { id: tutor.id, name: tutor.name, email: tutor.email, createdAt: tutor.createdAt } });
});

router.post("/auth/logout", (_req, res): void => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ ok: true });
});

router.get("/auth/me", schedulerAuthMiddleware, async (req, res): Promise<void> => {
  const [tutor] = await db.select().from(schedulerTutorsTable).where(eq(schedulerTutorsTable.id, req.tutorId!));
  if (!tutor) {
    res.status(404).json({ error: "Not Found", message: "Tutor not found" });
    return;
  }
  res.json({ tutor: { id: tutor.id, name: tutor.name, email: tutor.email, createdAt: tutor.createdAt } });
});

export default router;
