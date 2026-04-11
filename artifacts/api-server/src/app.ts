import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import router from "./routes/index.js";
import { auditMiddleware } from "./middlewares/auditLog.js";
import { apiLimiter, deviceLimiter } from "./middlewares/rateLimit.js";

const ALLOWED_ORIGINS = [
  /\.replit\.dev$/,
  /\.replit\.app$/,
  /\.kirk\.replit\.dev$/,
  /^http:\/\/localhost(:\d+)?$/,
];

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
app.use("/api/device/ingest", deviceLimiter);
app.use("/api", auditMiddleware);
app.use("/api", router);

export default app;
