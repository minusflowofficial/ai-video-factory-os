import { Router, type IRouter } from "express";
import healthRouter   from "./health";
import projectsRouter from "./projects";
import bulkJobsRouter from "./bulk-jobs";
import settingsRouter from "./settings";
import statsRouter    from "./stats";
import proxyRouter    from "./proxy";
import ttsRouter      from "./tts";

const router: IRouter = Router();

router.use(proxyRouter);
router.use(healthRouter);
router.use(projectsRouter);
router.use(bulkJobsRouter);
router.use(settingsRouter);
router.use(statsRouter);
router.use(ttsRouter);

export default router;
