/**
 * TimezoneContext
 *
 * Provides a user-selectable display timezone across the whole app.
 * Default: "Africa/Nairobi" (EAT, UTC+3).
 * The preference is persisted to localStorage so it survives page refreshes.
 *
 * Usage:
 *   const { timezone, setTimezone, fmt } = useTimezone();
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

interface TimezoneCtx {
  timezone:    string;
  setTimezone: (tz: string) => void;
  /** Format a Date (or ISO string) in the selected timezone. */
  fmt:         (date: Date | string | number | null | undefined, formatStr: string) => string;
  /** The timezone abbreviation for the current selection (e.g. "EAT"). */
  abbr:        string;
}

const TimezoneContext = createContext<TimezoneCtx | null>(null);

export function TimezoneProvider({ children }: { children: ReactNode }) {
  const [timezone, setTimezoneRaw] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_TZ;
    } catch {
      return DEFAULT_TZ;
    }
  });

  const setTimezone = (tz: string) => {
    setTimezoneRaw(tz);
    try { localStorage.setItem(STORAGE_KEY, tz); } catch { /* ignore */ }
  };

  const fmt = (date: Date | string | number | null | undefined, formatStr: string): string => {
    if (date == null) return "—";
    try {
      const d = date instanceof Date ? date : new Date(date);
      if (isNaN(d.getTime())) return "—";
      return formatInTimeZone(d, timezone, formatStr);
    } catch {
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

export function useTimezone(): TimezoneCtx {
  const ctx = useContext(TimezoneContext);
  if (!ctx) throw new Error("useTimezone must be used inside <TimezoneProvider>");
  return ctx;
}
