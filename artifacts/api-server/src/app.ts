import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors());

// Raw JSON body needed for MCP protocol
app.use(
  express.json({
    limit: "10mb",
  }),
);
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Serve the web UI at /api/dashboard
const publicDir = path.resolve(__dirname, "..", "public");
app.use("/api/dashboard", express.static(publicDir));
app.get("/api/dashboard", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});
app.get("/api/dashboard/*splat", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

export default app;
