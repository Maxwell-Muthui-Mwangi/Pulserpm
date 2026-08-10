import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import router from "./routes/index.js";
import { auditMiddleware } from "./middlewares/auditLog.js";
import { apiLimiter, deviceLimiter } from "./middlewares/rateLimit.js";

// Hard-coded trusted origins (regex patterns or exact strings).
const ALLOWED_ORIGINS: (RegExp | string)[] = [
  /\.replit\.dev$/,
  /\.replit\.app$/,
  /\.kirk\.replit\.dev$/,
  /^http:\/\/localhost(:\d+)?$/,
  // Custom production domain
  /\.ballershopke\.ltd$/,
];

// Runtime-configurable extra origins (comma-separated hostnames or origins in
// the EXTRA_ALLOWED_ORIGINS env var, e.g. "myapp.com,staging.myapp.com").
// This lets new domains be added via an environment secret without a code
// change or redeploy.
if (process.env.EXTRA_ALLOWED_ORIGINS) {
  for (const raw of process.env.EXTRA_ALLOWED_ORIGINS.split(",")) {
    const entry = raw.trim();
    if (entry) ALLOWED_ORIGINS.push(entry);
  }
}

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  return ALLOWED_ORIGINS.some((pattern) =>
    typeof pattern === "string" ? origin === pattern : pattern.test(origin)
  );
}

const app: Express = express();

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin '${origin}' not allowed`));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Device-Api-Key"],
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use("/api", apiLimiter);
// Apply the strict device rate-limit to ALL ingest paths — both the primary
// route and every alias accepted for companion-app compatibility.
app.use("/api/device/ingest",       deviceLimiter);
app.use("/api/device/sync",         deviceLimiter);
app.use("/api/ingest",              deviceLimiter);
app.use("/api/device/ingest/batch", deviceLimiter);
app.use("/api/device/batch",        deviceLimiter);
app.use("/api/ingest/batch",        deviceLimiter);
app.use("/api/batch",               deviceLimiter);
app.use("/api", auditMiddleware);

// Prevent browser and proxy caching of all API responses so the dashboard
// always receives fresh data. SSE routes override this with their own headers.
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

app.use("/api", router);

export default app;
