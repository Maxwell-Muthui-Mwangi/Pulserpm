import { Router } from "express";
import { db, auditLogsTable } from "@workspace/db";
import { desc, eq, and, or, gte, ne, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";

// The founding super admin — permanently shielded from other admins
export const SUPER_ADMIN_EMAIL = "maxwellmuthuimwangi@gmail.com";

const router = Router();

router.get("/audit", requireAuth, requireRole("provider", "admin"), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const outcome = req.query.outcome as string | undefined;
    const action = req.query.action as string | undefined;
    const since = req.query.since as string | undefined;

    const conditions = [];

    // Maxwell is a ghost — his audit activity is invisible to everyone except himself
    if (req.user!.email !== SUPER_ADMIN_EMAIL) {
      conditions.push(ne(auditLogsTable.actorEmail, SUPER_ADMIN_EMAIL));
    }

    if (outcome && ["success", "failure", "denied"].includes(outcome)) {
      conditions.push(eq(auditLogsTable.outcome, outcome));
    }
    if (action) {
      conditions.push(sql`${auditLogsTable.action} ILIKE ${"%" + action + "%"}`);
    }
    if (since) {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) {
        conditions.push(gte(auditLogsTable.timestamp, sinceDate));
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [logs, countResult] = await Promise.all([
      db
        .select()
        .from(auditLogsTable)
        .where(whereClause)
        .orderBy(desc(auditLogsTable.timestamp))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(auditLogsTable)
        .where(whereClause),
    ]);

    res.json({
      logs,
      total: Number(countResult[0]?.count ?? 0),
      limit,
      offset,
    });
  } catch (err) {
    console.error("Audit log error:", err);
    res.status(500).json({ error: "Internal Server Error", message: "Failed to fetch audit logs" });
  }
});

export default router;
