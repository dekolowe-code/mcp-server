import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import mcpRouter from "./mcp.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(mcpRouter);

export default router;
