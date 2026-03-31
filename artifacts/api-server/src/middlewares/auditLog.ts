import { Request, Response, NextFunction } from "express";
import { db, auditLogsTable } from "@workspace/db";

export interface AuditEventInput {
  actorId?: number;
  actorEmail?: string;
  actorRole?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  outcome?: "success" | "failure" | "denied";
  details?: string;
}

export function logAuditEvent(event: AuditEventInput): void {
  setImmediate(async () => {
    try {
      await db.insert(auditLogsTable).values({
        actorId: event.actorId ?? null,
        actorEmail: event.actorEmail ?? null,
        actorRole: event.actorRole ?? null,
        action: event.action,
        resourceType: event.resourceType ?? null,
        resourceId: event.resourceId ?? null,
        ipAddress: event.ipAddress ?? null,
        userAgent: event.userAgent ? event.userAgent.slice(0, 500) : null,
        outcome: event.outcome ?? "success",
        details: event.details ?? null,
      });
    } catch (err) {
      console.error("[AuditLog] Failed to write audit event:", err);
    }
  });
}

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "unknown";
}

function classifyAction(req: Request): string {
  const path = req.path.toLowerCase();
  const method = req.method.toUpperCase();

  if (path.includes("/vitals")) return method === "GET" ? "vitals.read" : "vitals.write";
  if (path.includes("/alerts") && method === "POST" && path.includes("/acknowledge")) return "alert.acknowledge";
  if (path.includes("/alerts") && method === "POST" && path.includes("/resolve")) return "alert.resolve";
  if (path.includes("/thresholds")) return "thresholds.update";
  if (path.includes("/patients") && path.includes("/approve")) return "admin.approve_patient";
  if (path.includes("/patients") && method === "DELETE") return "patient.delete";
  if (path.includes("/patients")) return method === "GET" ? "patient.read" : "patient.update";
  if (path.includes("/device/ingest")) return "device.ingest";
  if (path.includes("/auth/dismiss-welcome")) return "auth.dismiss_welcome";

  const resource = path.split("/").filter(Boolean)[0] ?? "unknown";
  return `${resource}.${method.toLowerCase()}`;
}

function extractResourceType(path: string): string | undefined {
  if (path.includes("/patients")) return "patient";
  if (path.includes("/vitals")) return "vitals";
  if (path.includes("/alerts")) return "alert";
  if (path.includes("/thresholds")) return "threshold";
  if (path.includes("/device")) return "device";
  return undefined;
}

function extractResourceId(path: string): string | undefined {
  const match = path.match(/\/(\d+)(?:\/|$)/);
  return match ? match[1] : undefined;
}

export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
    next();
    return;
  }

  const skip = ["/auth/login", "/auth/signup", "/auth/patient-signup", "/auth/verify-email", "/auth/resend-code"];
  if (skip.some((s) => req.path.endsWith(s))) {
    next();
    return;
  }

  res.on("finish", () => {
    if (!req.user) return;
    const status = res.statusCode;
    const outcome: "success" | "failure" | "denied" =
      status >= 200 && status < 300 ? "success" : status === 401 || status === 403 ? "denied" : "failure";

    logAuditEvent({
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      action: classifyAction(req),
      resourceType: extractResourceType(req.path),
      resourceId: extractResourceId(req.path),
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"],
      outcome,
      details: JSON.stringify({ method: req.method, path: req.path, status }),
    });
  });

  next();
}

export { getClientIp };
