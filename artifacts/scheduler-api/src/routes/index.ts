import { Router, type IRouter } from "express";
import authRouter from "./auth.js";
import studentsRouter from "./students.js";
import classesRouter from "./classes.js";
import assignmentsRouter from "./assignments.js";
import paymentsRouter from "./payments.js";
import dashboardRouter from "./dashboard.js";
import { csrfMiddleware } from "../middlewares/csrf.js";

const router: IRouter = Router();

router.use(csrfMiddleware);
router.use(authRouter);
router.use(studentsRouter);
router.use(classesRouter);
router.use(assignmentsRouter);
router.use(paymentsRouter);
router.use(dashboardRouter);

export default router;
