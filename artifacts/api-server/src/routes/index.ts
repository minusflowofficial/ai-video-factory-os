import { Router, type IRouter } from "express";
import healthRouter from "./health";
import projectsRouter from "./projects";
import bulkJobsRouter from "./bulk-jobs";
import settingsRouter from "./settings";
import statsRouter from "./stats";

const router: IRouter = Router();

router.use(healthRouter);
router.use(projectsRouter);
router.use(bulkJobsRouter);
router.use(settingsRouter);
router.use(statsRouter);

export default router;
