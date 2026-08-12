/**
 * Client-side threat classification for audit log events.
 * Applied in both the Audit Log table column and the Threat Detection page.
 */

export interface AuditLogEntry {
  id: number;
  timestamp: string;
  actorId: number | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  outcome: "success" | "failure" | "denied";
  details: string | null;
}

export type ThreatLevel = "critical" | "high" | "medium" | "low";

export interface ThreatInfo {
  level: ThreatLevel | null;
  type: string;
  reason: string;
}

/** Map a single audit log entry to a threat classification. */
export function classifyThreat(log: AuditLogEntry): ThreatInfo {
  // Critical: repeated login failure pattern (detected via action label)
  if (log.action === "auth.login_failed" && log.outcome === "failure") {
    return {
      level: "high",
      type: "Unauthorized Access",
      reason: "Authentication failure — possible credential attack",
    };
  }

  // High: any auth action that resulted in failure
  if (log.action.startsWith("auth.") && log.outcome === "failure") {
    return {
      level: "high",
      type: "Unauthorized Access",
      reason: "Auth operation failed — token or session anomaly",
    };
  }

  // Medium: explicitly denied by authorization layer
  if (log.outcome === "denied") {
    return {
      level: "medium",
      type: "Unauthorized Access",
      reason: "Request denied by access-control policy",
    };
  }

  // Medium: permanent patient record deletion
  if (log.action === "patient.delete" && log.outcome === "success") {
    return {
      level: "medium",
      type: "Data Exfiltration",
      reason: "Patient record permanently deleted",
    };
  }

  // Low: any non-auth operation failure
  if (log.outcome === "failure") {
    return {
      level: "low",
      type: "Anomalous Behavior",
      reason: "Unexpected operation failure — possible tampering",
    };
  }

  // Low: sensitive write with no identifiable source IP
  if (
    !log.ipAddress &&
    ["vitals.write", "patient.update", "thresholds.update", "admin.approve_patient"].includes(
      log.action,
    )
  ) {
    return {
      level: "low",
      type: "Anomalous Behavior",
      reason: "Sensitive write from unidentified network source",
    };
  }

  return { level: null, type: "", reason: "" };
}

/** Badge colour classes per threat level. */
export const THREAT_COLORS: Record<ThreatLevel, string> = {
  critical: "bg-red-100 text-red-800 border-red-200",
  high:     "bg-orange-100 text-orange-800 border-orange-200",
  medium:   "bg-amber-100 text-amber-800 border-amber-200",
  low:      "bg-blue-100 text-blue-800 border-blue-200",
};

export const THREAT_DOT: Record<ThreatLevel, string> = {
  critical: "bg-red-500",
  high:     "bg-orange-500",
  medium:   "bg-amber-500",
  low:      "bg-blue-500",
};

/** Deterministic 64-char hex "hash" for blockchain display (browser-safe). */
export function sha256Like(input: string): string {
  const seeds = [
    0xdeadbeef, 0x41c6ce57, 0xcafe1234, 0xbabe5678,
    0x13371337, 0xf00df00d, 0xdeadc0de, 0xfeedface,
  ];
  return seeds
    .map((seed) => {
      let h = seed;
      for (let i = 0; i < input.length; i++) {
        h = Math.imul(h ^ input.charCodeAt(i), 2654435761);
        h ^= h >>> 16;
      }
      return (h >>> 0).toString(16).padStart(8, "0");
    })
    .join("");
}
