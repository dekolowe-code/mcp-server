import { Router } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";
import fse from "fs-extra";
import { createMcpServer, WORKSPACE_DIR } from "../mcp/server.js";
import { logger } from "../lib/logger.js";

const mcpRouter = Router();

// In-memory session store
const sessions = new Map<string, StreamableHTTPServerTransport>();

// Ensure workspace directory exists
fse.ensureDirSync(WORKSPACE_DIR);
logger.info({ workspaceDir: WORKSPACE_DIR }, "MCP workspace ready");

// POST /api/mcp — initialize or continue a session
mcpRouter.post("/mcp", async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && sessions.has(sessionId)) {
      transport = sessions.get(sessionId)!;
    } else {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          sessions.set(id, transport);
          logger.info({ sessionId: id }, "MCP session initialized");
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          sessions.delete(transport.sessionId);
          logger.info({ sessionId: transport.sessionId }, "MCP session closed");
        }
      };

      const server = createMcpServer();
      await server.connect(transport);
    }

    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    logger.error({ err }, "MCP POST error");
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// GET /api/mcp — SSE streaming for existing sessions
mcpRouter.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !sessions.has(sessionId)) {
    res.status(400).json({ error: "Invalid or missing session ID" });
    return;
  }
  try {
    const transport = sessions.get(sessionId)!;
    await transport.handleRequest(req, res);
  } catch (err) {
    logger.error({ err }, "MCP GET error");
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// DELETE /api/mcp — close a session
mcpRouter.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !sessions.has(sessionId)) {
    res.status(400).json({ error: "Invalid or missing session ID" });
    return;
  }
  try {
    const transport = sessions.get(sessionId)!;
    await transport.handleRequest(req, res);
    sessions.delete(sessionId);
  } catch (err) {
    logger.error({ err }, "MCP DELETE error");
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// GET /api/mcp/info — server info (no auth needed)
mcpRouter.get("/mcp/info", (_req, res) => {
  res.json({
    name: "MCP FullStack Builder",
    version: "1.0.0",
    description:
      "Autonomous AI FullStack Engineering Platform — generates web apps, mobile apps, backends, databases, and more.",
    workspaceDir: WORKSPACE_DIR,
    activeSessions: sessions.size,
    tools: {
      filesystem: [
        "read_file",
        "write_file",
        "edit_file",
        "delete_file",
        "copy_file",
        "move_file",
        "create_directory",
        "list_directory",
        "search_files",
        "generate_tree",
      ],
      terminal: [
        "run_command",
        "run_npm_install",
        "run_pnpm_install",
        "run_pip_install",
        "run_build",
        "run_tests",
        "kill_process",
      ],
      codegen: [
        "generate_code",
        "generate_react_app",
        "generate_nextjs_app",
        "generate_express_backend",
        "generate_fastapi_backend",
        "generate_mobile_app",
        "generate_prisma_schema",
        "generate_dockerfile",
        "generate_github_actions",
      ],
      debug: [
        "analyze_error",
        "fix_code",
        "analyze_build_error",
        "fix_typescript_errors",
        "fix_dependency_conflicts",
        "code_review",
        "refactor_code",
        "explain_code",
      ],
      design: [
        "suggest_design",
        "extract_design_tokens",
        "generate_component",
        "analyze_design",
        "generate_landing_page",
      ],
      project: [
        "analyze_project",
        "plan_architecture",
        "generate_readme",
        "scan_security",
        "generate_tests",
      ],
    },
  });
});

export default mcpRouter;
