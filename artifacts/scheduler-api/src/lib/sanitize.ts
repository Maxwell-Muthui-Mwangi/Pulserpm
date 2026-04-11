const MAX_SHORT = 255;
const MAX_NOTES = 4000;

export function sanitizeStr(val: unknown, maxLen = MAX_SHORT): string | undefined {
  if (val === null || val === undefined) return undefined;
  const s = String(val).trim().slice(0, maxLen);
  return s || undefined;
}

export function sanitizeNotes(val: unknown): string | undefined {
  return sanitizeStr(val, MAX_NOTES);
}

export function sanitizeEmail(val: unknown): string | undefined {
  const s = sanitizeStr(val);
  if (!s) return undefined;
  const lower = s.toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower) ? lower : undefined;
}

export function sanitizePhone(val: unknown): string | undefined {
  const s = sanitizeStr(val, 30);
  if (!s) return undefined;
  return /^[\d\s+\-().]{7,30}$/.test(s) ? s : undefined;
}

export function sanitizeHexColor(val: unknown): string | undefined {
  const s = sanitizeStr(val, 7);
  if (!s) return undefined;
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : undefined;
}

export function sanitizeDate(val: unknown): Date | undefined {
  if (!val) return undefined;
  const d = new Date(String(val));
  return isNaN(d.getTime()) ? undefined : d;
}

export function sanitizePositiveFloat(val: unknown, max = 1e8): number | undefined {
  const n = Number(val);
  return isFinite(n) && n >= 0 && n <= max ? n : undefined;
}
