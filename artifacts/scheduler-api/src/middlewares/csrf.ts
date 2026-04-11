import { Request, Response, NextFunction } from "express";
import { isOriginAllowed } from "../lib/origins.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function csrfMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) { next(); return; }

  const origin = req.get("origin");
  const referer = req.get("referer");

  if (origin) {
    if (!isOriginAllowed(origin)) {
      res.status(403).json({ error: "Forbidden", message: "CSRF: untrusted origin" });
      return;
    }
    next(); return;
  }

  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (!isOriginAllowed(refOrigin)) {
        res.status(403).json({ error: "Forbidden", message: "CSRF: untrusted referer" });
        return;
      }
      next(); return;
    } catch {
      res.status(403).json({ error: "Forbidden", message: "CSRF: invalid referer" });
      return;
    }
  }

  res.status(403).json({ error: "Forbidden", message: "CSRF: missing origin header" });
}
