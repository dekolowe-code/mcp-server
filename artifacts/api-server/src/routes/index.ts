import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import mcpRouter from "./mcp.js";
import uiApiRouter from "./ui-api.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(mcpRouter);
router.use("/ui", uiApiRouter);

export default router;
