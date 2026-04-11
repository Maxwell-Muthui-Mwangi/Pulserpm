import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import router from "./routes/index.js";
import { isOriginAllowed } from "./lib/origins.js";

const app = express();

app.set("trust proxy", 1);

app.use(helmet({ contentSecurityPolicy: false }));

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, false);
    if (isOriginAllowed(origin)) return callback(null, true);
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));

const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: false });

app.use(globalLimiter);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/scheduler/api/healthz", (_req, res) => res.json({ ok: true, service: "scheduler-api" }));

app.use("/scheduler/api/auth", authLimiter);
app.use("/scheduler/api", router);

app.use((_req, res) => res.status(404).json({ error: "Not Found" }));

export default app;
