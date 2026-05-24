import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerFilesystemTools } from "./tools/filesystem.js";
import { registerTerminalTools } from "./tools/terminal.js";
import { registerCodegenTools } from "./tools/codegen.js";
import { registerDebugTools } from "./tools/debug.js";
import { registerDesignTools } from "./tools/design.js";
import { registerProjectTools } from "./tools/project.js";

const WORKSPACE_DIR =
  process.env["MCP_WORKSPACE_DIR"] ?? "/tmp/mcp-workspace";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "mcp-fullstack-builder",
    version: "1.0.0",
  });

  registerFilesystemTools(server, WORKSPACE_DIR);
  registerTerminalTools(server, WORKSPACE_DIR);
  registerCodegenTools(server, WORKSPACE_DIR);
  registerDebugTools(server);
  registerDesignTools(server);
  registerProjectTools(server, WORKSPACE_DIR);

  return server;
}

export { WORKSPACE_DIR };
