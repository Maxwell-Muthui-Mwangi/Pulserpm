import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import providersRouter from "./providers.js";
import patientsRouter from "./patients.js";
import vitalsRouter from "./vitals.js";
import alertsRouter from "./alerts.js";
import thresholdsRouter from "./thresholds.js";
import summaryRouter from "./summary.js";
import deviceRouter from "./device.js";
import auditRouter from "./audit.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(providersRouter);
router.use(patientsRouter);
router.use(vitalsRouter);
router.use(alertsRouter);
router.use(thresholdsRouter);
router.use(summaryRouter);
router.use(deviceRouter);
router.use(auditRouter);

export default router;
