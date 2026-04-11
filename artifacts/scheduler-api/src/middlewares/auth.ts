import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/auth.js";
import { db } from "../lib/db.js";
import { schedulerTutorsTable } from "../schema/index.js";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      tutorId?: number;
    }
  }
}

export async function schedulerAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const cookieToken = req.cookies?.scheduler_session;
  const bearerToken = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;

  const token = cookieToken || bearerToken;

  if (!token) {
    res.status(401).json({ error: "Unauthorized", message: "Not authenticated" });
    return;
  }

  try {
    const payload = verifyToken(token);
    if (payload.type !== "scheduler") {
      res.status(401).json({ error: "Unauthorized", message: "Invalid token type" });
      return;
    }

    const [tutor] = await db.select({ id: schedulerTutorsTable.id }).from(schedulerTutorsTable).where(eq(schedulerTutorsTable.id, payload.tutorId));
    if (!tutor) {
      res.status(401).json({ error: "Unauthorized", message: "Tutor not found" });
      return;
    }

    req.tutorId = tutor.id;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized", message: "Invalid or expired session" });
  }
}
