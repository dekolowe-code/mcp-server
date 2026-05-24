import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { execa } from "execa";
import path from "path";
import { z } from "zod";

const DEFAULT_TIMEOUT = 120_000; // 2 minutes

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs = DEFAULT_TIMEOUT,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const result = await execa(command, args, {
      cwd,
      timeout: timeoutMs,
      reject: false,
      all: true,
    });
    return {
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      exitCode: result.exitCode ?? 0,
    };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; exitCode?: number; message?: string };
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? e.message ?? String(err),
      exitCode: e.exitCode ?? 1,
    };
  }
}

function formatResult(
  stdout: string,
  stderr: string,
  exitCode: number,
): string {
  const parts: string[] = [];
  if (stdout) parts.push(`STDOUT:\n${stdout}`);
  if (stderr) parts.push(`STDERR:\n${stderr}`);
  parts.push(`Exit code: ${exitCode}`);
  return parts.join("\n\n");
}

export function registerTerminalTools(server: McpServer, workspaceDir: string) {
  server.registerTool(
    "run_command",
    {
      description:
        "Execute a shell command in the workspace. Prefer using specific tools (run_npm_install, run_build, etc.) when available.",
      inputSchema: {
        command: z.string().describe("The full shell command to run"),
        cwd: z
          .string()
          .optional()
          .describe("Working directory relative to workspace (default: root)"),
        timeout_seconds: z
          .number()
          .optional()
          .default(120)
          .describe("Timeout in seconds (default: 120)"),
      },
    },
    async ({ command, cwd, timeout_seconds }) => {
      const workingDir = cwd
        ? path.resolve(workspaceDir, cwd)
        : workspaceDir;
      const { stdout, stderr, exitCode } = await runCommand(
        "sh",
        ["-c", command],
        workingDir,
        (timeout_seconds ?? 120) * 1000,
      );
      return {
        content: [
          {
            type: "text" as const,
            text: formatResult(stdout, stderr, exitCode),
          },
        ],
        isError: exitCode !== 0,
      };
    },
  );

  server.registerTool(
    "run_npm_install",
    {
      description: "Run npm install in a directory",
      inputSchema: {
        packages: z
          .array(z.string())
          .optional()
          .describe("Specific packages to install (omit to install all from package.json)"),
        dev: z
          .boolean()
          .optional()
          .default(false)
          .describe("Install as dev dependency"),
        cwd: z
          .string()
          .optional()
          .describe("Working directory relative to workspace"),
      },
    },
    async ({ packages, dev, cwd }) => {
      const workingDir = cwd ? path.resolve(workspaceDir, cwd) : workspaceDir;
      const args = ["install"];
      if (packages && packages.length > 0) {
        args.push(...packages);
      }
      if (dev) args.push("--save-dev");
      const { stdout, stderr, exitCode } = await runCommand(
        "npm",
        args,
        workingDir,
        180_000,
      );
      return {
        content: [
          {
            type: "text" as const,
            text: formatResult(stdout, stderr, exitCode),
          },
        ],
        isError: exitCode !== 0,
      };
    },
  );

  server.registerTool(
    "run_pnpm_install",
    {
      description: "Run pnpm install in a directory",
      inputSchema: {
        packages: z
          .array(z.string())
          .optional()
          .describe("Specific packages to install (omit to install all)"),
        dev: z
          .boolean()
          .optional()
          .default(false)
          .describe("Install as dev dependency"),
        cwd: z
          .string()
          .optional()
          .describe("Working directory relative to workspace"),
      },
    },
    async ({ packages, dev, cwd }) => {
      const workingDir = cwd ? path.resolve(workspaceDir, cwd) : workspaceDir;
      const args = ["install"];
      if (packages && packages.length > 0) {
        args.push(...packages);
      }
      if (dev) args.push("--save-dev");
      const { stdout, stderr, exitCode } = await runCommand(
        "pnpm",
        args,
        workingDir,
        180_000,
      );
      return {
        content: [
          {
            type: "text" as const,
            text: formatResult(stdout, stderr, exitCode),
          },
        ],
        isError: exitCode !== 0,
      };
    },
  );

  server.registerTool(
    "run_pip_install",
    {
      description: "Run pip install for Python packages",
      inputSchema: {
        packages: z
          .array(z.string())
          .describe("Packages to install"),
        cwd: z
          .string()
          .optional()
          .describe("Working directory relative to workspace"),
      },
    },
    async ({ packages, cwd }) => {
      const workingDir = cwd ? path.resolve(workspaceDir, cwd) : workspaceDir;
      const { stdout, stderr, exitCode } = await runCommand(
        "pip",
        ["install", ...packages],
        workingDir,
        180_000,
      );
      return {
        content: [
          {
            type: "text" as const,
            text: formatResult(stdout, stderr, exitCode),
          },
        ],
        isError: exitCode !== 0,
      };
    },
  );

  server.registerTool(
    "run_build",
    {
      description: "Run the build command for a project (npm run build, pnpm run build, etc.)",
      inputSchema: {
        package_manager: z
          .enum(["npm", "pnpm", "yarn", "bun"])
          .optional()
          .default("npm")
          .describe("Package manager to use"),
        script: z
          .string()
          .optional()
          .default("build")
          .describe("npm script to run (default: build)"),
        cwd: z
          .string()
          .optional()
          .describe("Working directory relative to workspace"),
      },
    },
    async ({ package_manager, script, cwd }) => {
      const workingDir = cwd ? path.resolve(workspaceDir, cwd) : workspaceDir;
      const pm = package_manager ?? "npm";
      const scriptName = script ?? "build";
      const { stdout, stderr, exitCode } = await runCommand(
        pm,
        ["run", scriptName],
        workingDir,
        300_000,
      );
      return {
        content: [
          {
            type: "text" as const,
            text: formatResult(stdout, stderr, exitCode),
          },
        ],
        isError: exitCode !== 0,
      };
    },
  );

  server.registerTool(
    "run_tests",
    {
      description: "Run tests for a project",
      inputSchema: {
        package_manager: z
          .enum(["npm", "pnpm", "yarn"])
          .optional()
          .default("npm"),
        script: z
          .string()
          .optional()
          .default("test")
          .describe("Test script name"),
        cwd: z
          .string()
          .optional()
          .describe("Working directory relative to workspace"),
      },
    },
    async ({ package_manager, script, cwd }) => {
      const workingDir = cwd ? path.resolve(workspaceDir, cwd) : workspaceDir;
      const pm = package_manager ?? "npm";
      const { stdout, stderr, exitCode } = await runCommand(
        pm,
        ["run", script ?? "test"],
        workingDir,
        300_000,
      );
      return {
        content: [
          {
            type: "text" as const,
            text: formatResult(stdout, stderr, exitCode),
          },
        ],
        isError: exitCode !== 0,
      };
    },
  );

  server.registerTool(
    "kill_process",
    {
      description: "Kill a process by name or port",
      inputSchema: {
        port: z
          .number()
          .optional()
          .describe("Kill process listening on this port"),
        process_name: z
          .string()
          .optional()
          .describe("Kill process by name (e.g. node, python)"),
      },
    },
    async ({ port, process_name }) => {
      let command: string;
      if (port) {
        command = `fuser -k ${port}/tcp 2>/dev/null || lsof -ti:${port} | xargs kill -9 2>/dev/null`;
      } else if (process_name) {
        command = `pkill -f "${process_name}" 2>/dev/null`;
      } else {
        return {
          content: [
            {
              type: "text" as const,
              text: "❌ Provide either port or process_name",
            },
          ],
          isError: true,
        };
      }
      const { stdout, stderr, exitCode } = await runCommand(
        "sh",
        ["-c", command],
        workspaceDir,
      );
      return {
        content: [
          {
            type: "text" as const,
            text: exitCode === 0
              ? `✅ Process killed`
              : formatResult(stdout, stderr, exitCode),
          },
        ],
      };
    },
  );
}
