/**
 * TimezoneContext
 *
 * Provides a user-selectable display timezone across the whole app.
 * Default: "Africa/Nairobi" (EAT, UTC+3).
 * The preference is persisted to localStorage so it survives page refreshes.
 *
 * Hardening guarantees:
 *  • Invalid / corrupted localStorage values are rejected and fall back to EAT
 *    using the browser-native Intl.DateTimeFormat validator.
 *  • setTimezone() only accepts values present in TIMEZONE_OPTIONS.
 *  • fmt() is fully safe: null / undefined / NaN-date → "—", every branch is
 *    wrapped in try/catch, and bare Postgres timestamp strings (no Z suffix) are
 *    normalised to UTC before formatting — so even a cached API response from
 *    before the server-side fix was deployed will render correctly.
 *
 * Usage:
 *   const { fmt } = useTimezone();
 *   fmt(someDate, "h:mm a")  // → "5:47 AM" in the selected timezone
 */

import { createContext, useContext, useState, ReactNode } from "react";
import { formatInTimeZone } from "date-fns-tz";

const STORAGE_KEY = "pulserpm_timezone";
const DEFAULT_TZ  = "Africa/Nairobi";

export interface TimezoneOption {
  value: string;
  label: string;
  abbr:  string;
}

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { value: "Africa/Nairobi",      label: "Nairobi (EAT)",        abbr: "EAT"  },
  { value: "UTC",                  label: "UTC",                   abbr: "UTC"  },
  { value: "Europe/London",        label: "London (GMT/BST)",      abbr: "GMT"  },
  { value: "Europe/Paris",         label: "Paris (CET/CEST)",      abbr: "CET"  },
  { value: "Africa/Lagos",         label: "Lagos (WAT)",           abbr: "WAT"  },
  { value: "Africa/Cairo",         label: "Cairo (EET)",           abbr: "EET"  },
  { value: "America/New_York",     label: "New York (ET)",         abbr: "ET"   },
  { value: "America/Los_Angeles",  label: "Los Angeles (PT)",      abbr: "PT"   },
  { value: "Asia/Dubai",           label: "Dubai (GST)",           abbr: "GST"  },
  { value: "Asia/Kolkata",         label: "Mumbai/Delhi (IST)",    abbr: "IST"  },
  { value: "Asia/Singapore",       label: "Singapore (SGT)",       abbr: "SGT"  },
  { value: "Australia/Sydney",     label: "Sydney (AEST/AEDT)",    abbr: "AEST" },
];

// ─── IANA timezone validator (uses the browser's built-in Intl engine) ───────

function isValidTimezone(tz: string): boolean {
  if (!tz || typeof tz !== "string") return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ─── Bare-Postgres-string → UTC Date normaliser ───────────────────────────────
// The API now sends "...Z" ISO strings, but old cached responses or edge-case
// code paths may still produce bare strings like "2026-08-09 02:47:21.591381".
// JS treats those as LOCAL time (wrong on non-UTC machines/browsers).
// This helper forces them to be interpreted as UTC.

function toSafeDate(value: Date | string | number | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(value).trim();
  if (!s) return null;
  // Append "Z" if no timezone offset is present (handles bare Postgres timestamps)
  const iso =
    (s.includes("T") ? s : s.replace(" ", "T")) +
    (s.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(s) ? "" : "Z");
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

// ─── Context types ────────────────────────────────────────────────────────────

interface TimezoneCtx {
  timezone:    string;
  setTimezone: (tz: string) => void;
  /**
   * Format a Date (or ISO/Postgres string, or epoch ms) in the selected timezone.
   * Returns "—" for null / undefined / invalid dates. Never throws.
   */
  fmt:  (date: Date | string | number | null | undefined, formatStr: string) => string;
  /** Abbreviation for the current selection (e.g. "EAT"). */
  abbr: string;
}

const TimezoneContext = createContext<TimezoneCtx | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function TimezoneProvider({ children }: { children: ReactNode }) {
  const [timezone, setTimezoneRaw] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      // Reject if not in our known list (fast) OR not a valid IANA zone (safe fallback)
      if (stored && TIMEZONE_OPTIONS.some((o) => o.value === stored) && isValidTimezone(stored)) {
        return stored;
      }
    } catch {
      // localStorage unavailable (SSR, incognito restrictions, quota exceeded)
    }
    return DEFAULT_TZ;
  });

  const setTimezone = (tz: string) => {
    // Whitelist — only accept values from TIMEZONE_OPTIONS; ignore anything else
    if (!TIMEZONE_OPTIONS.some((o) => o.value === tz)) return;
    setTimezoneRaw(tz);
    try {
      localStorage.setItem(STORAGE_KEY, tz);
    } catch {
      // ignore quota / incognito errors
    }
  };

  /**
   * Timezone-aware formatter. Safe against every bad input:
   *   • null / undefined            → "—"
   *   • NaN Date                    → "—"
   *   • bare Postgres timestamp str → auto-normalised to UTC before formatting
   *   • formatInTimeZone throws     → caught, returns "—"
   */
  const fmt = (date: Date | string | number | null | undefined, formatStr: string): string => {
    const d = toSafeDate(date);
    if (!d) return "—";
    try {
      return formatInTimeZone(d, timezone, formatStr);
    } catch {
      // Defensive: formatInTimeZone can throw for malformed format strings too
      return "—";
    }
  };

  const abbr = TIMEZONE_OPTIONS.find((o) => o.value === timezone)?.abbr ?? "EAT";

  return (
    <TimezoneContext.Provider value={{ timezone, setTimezone, fmt, abbr }}>
      {children}
    </TimezoneContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTimezone(): TimezoneCtx {
  const ctx = useContext(TimezoneContext);
  if (!ctx) throw new Error("useTimezone must be used inside <TimezoneProvider>");
  return ctx;
}
