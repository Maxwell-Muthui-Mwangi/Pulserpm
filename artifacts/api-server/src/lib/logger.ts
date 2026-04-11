type LogLevel = "info" | "warn" | "error" | "debug";

function formatMsg(level: LogLevel, data: Record<string, unknown> | string, msg?: string): string {
  const ts = new Date().toISOString();
  if (typeof data === "string") {
    return `[${ts}] ${level.toUpperCase()} ${data}`;
  }
  const { err, ...rest } = data;
  const extra = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : "";
  const errMsg = err instanceof Error ? ` err=${err.message}` : "";
  return `[${ts}] ${level.toUpperCase()}${extra}${errMsg} ${msg || ""}`;
}

export const logger = {
  info(data: Record<string, unknown> | string, msg?: string) {
    console.log(formatMsg("info", data, msg));
  },
  warn(data: Record<string, unknown> | string, msg?: string) {
    console.warn(formatMsg("warn", data, msg));
  },
  error(data: Record<string, unknown> | string, msg?: string) {
    console.error(formatMsg("error", data, msg));
  },
  debug(data: Record<string, unknown> | string, msg?: string) {
    if (process.env.NODE_ENV !== "production") {
      console.debug(formatMsg("debug", data, msg));
    }
  },
};
