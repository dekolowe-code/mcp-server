import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import fs from "fs/promises";
import fse from "fs-extra";
import path from "path";
import { glob } from "glob";
import { z } from "zod";

function resolveSafe(workspaceDir: string, filePath: string): string {
  const resolved = path.resolve(workspaceDir, filePath);
  if (!resolved.startsWith(workspaceDir)) {
    throw new Error(`Path "${filePath}" is outside the workspace`);
  }
  return resolved;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

async function buildTree(
  dir: string,
  prefix = "",
  maxDepth = 4,
  depth = 0,
): Promise<string> {
  if (depth >= maxDepth) return "";
  let output = "";
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return "";
  }
  const filtered = entries.filter(
    (e) => !["node_modules", ".git", "dist", ".next", "__pycache__"].includes(e),
  );
  for (let i = 0; i < filtered.length; i++) {
    const entry = filtered[i];
    const isLast = i === filtered.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = prefix + (isLast ? "    " : "│   ");
    const fullPath = path.join(dir, entry);
    let stat;
    try {
      stat = await fs.stat(fullPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      output += `${prefix}${connector}${entry}/\n`;
      output += await buildTree(fullPath, childPrefix, maxDepth, depth + 1);
    } else {
      output += `${prefix}${connector}${entry} (${formatSize(stat.size)})\n`;
    }
  }
  return output;
}

export function registerFilesystemTools(
  server: McpServer,
  workspaceDir: string,
) {
  server.registerTool(
    "read_file",
    {
      description: "Read the contents of a file in the workspace",
      inputSchema: {
        path: z.string().describe("File path relative to workspace"),
        encoding: z
          .enum(["utf-8", "base64"])
          .optional()
          .default("utf-8")
          .describe("File encoding"),
      },
    },
    async ({ path: filePath, encoding }) => {
      const fullPath = resolveSafe(workspaceDir, filePath);
      const content = await fs.readFile(
        fullPath,
        encoding === "base64" ? undefined : "utf-8",
      );
      const text =
        encoding === "base64"
          ? (content as Buffer).toString("base64")
          : (content as string);
      return {
        content: [{ type: "text" as const, text }],
      };
    },
  );

  server.registerTool(
    "write_file",
    {
      description: "Write content to a file, creating it and any parent directories if needed",
      inputSchema: {
        path: z.string().describe("File path relative to workspace"),
        content: z.string().describe("Content to write"),
      },
    },
    async ({ path: filePath, content }) => {
      const fullPath = resolveSafe(workspaceDir, filePath);
      await fse.ensureDir(path.dirname(fullPath));
      await fs.writeFile(fullPath, content, "utf-8");
      return {
        content: [{ type: "text" as const, text: `✅ Written: ${filePath}` }],
      };
    },
  );

  server.registerTool(
    "edit_file",
    {
      description:
        "Edit a file by replacing an exact string with a new string. old_string must match exactly.",
      inputSchema: {
        path: z.string().describe("File path relative to workspace"),
        old_string: z.string().describe("Exact string to find and replace"),
        new_string: z.string().describe("Replacement string"),
      },
    },
    async ({ path: filePath, old_string, new_string }) => {
      const fullPath = resolveSafe(workspaceDir, filePath);
      const original = await fs.readFile(fullPath, "utf-8");
      if (!original.includes(old_string)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `❌ old_string not found in ${filePath}`,
            },
          ],
          isError: true,
        };
      }
      const updated = original.replace(old_string, new_string);
      await fs.writeFile(fullPath, updated, "utf-8");
      return {
        content: [{ type: "text" as const, text: `✅ Edited: ${filePath}` }],
      };
    },
  );

  server.registerTool(
    "delete_file",
    {
      description: "Delete a file or directory from the workspace",
      inputSchema: {
        path: z.string().describe("File or directory path relative to workspace"),
        recursive: z
          .boolean()
          .optional()
          .default(false)
          .describe("Delete directories recursively"),
      },
    },
    async ({ path: filePath, recursive }) => {
      const fullPath = resolveSafe(workspaceDir, filePath);
      if (recursive) {
        await fse.remove(fullPath);
      } else {
        await fs.unlink(fullPath);
      }
      return {
        content: [{ type: "text" as const, text: `✅ Deleted: ${filePath}` }],
      };
    },
  );

  server.registerTool(
    "copy_file",
    {
      description: "Copy a file or directory to a new location",
      inputSchema: {
        src: z.string().describe("Source path relative to workspace"),
        dest: z.string().describe("Destination path relative to workspace"),
      },
    },
    async ({ src, dest }) => {
      const srcFull = resolveSafe(workspaceDir, src);
      const destFull = resolveSafe(workspaceDir, dest);
      await fse.copy(srcFull, destFull);
      return {
        content: [
          { type: "text" as const, text: `✅ Copied: ${src} → ${dest}` },
        ],
      };
    },
  );

  server.registerTool(
    "move_file",
    {
      description: "Move or rename a file or directory",
      inputSchema: {
        src: z.string().describe("Source path relative to workspace"),
        dest: z.string().describe("Destination path relative to workspace"),
      },
    },
    async ({ src, dest }) => {
      const srcFull = resolveSafe(workspaceDir, src);
      const destFull = resolveSafe(workspaceDir, dest);
      await fse.move(srcFull, destFull);
      return {
        content: [
          { type: "text" as const, text: `✅ Moved: ${src} → ${dest}` },
        ],
      };
    },
  );

  server.registerTool(
    "create_directory",
    {
      description: "Create a directory (and any missing parent directories)",
      inputSchema: {
        path: z.string().describe("Directory path relative to workspace"),
      },
    },
    async ({ path: dirPath }) => {
      const fullPath = resolveSafe(workspaceDir, dirPath);
      await fse.ensureDir(fullPath);
      return {
        content: [
          { type: "text" as const, text: `✅ Directory created: ${dirPath}` },
        ],
      };
    },
  );

  server.registerTool(
    "list_directory",
    {
      description: "List files and directories in a path",
      inputSchema: {
        path: z
          .string()
          .optional()
          .default(".")
          .describe("Directory path relative to workspace (default: root)"),
        show_hidden: z
          .boolean()
          .optional()
          .default(false)
          .describe("Show hidden files"),
      },
    },
    async ({ path: dirPath, show_hidden }) => {
      const fullPath = resolveSafe(workspaceDir, dirPath ?? ".");
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      const filtered = show_hidden
        ? entries
        : entries.filter((e) => !e.name.startsWith("."));
      const lines = await Promise.all(
        filtered.map(async (e) => {
          const stat = await fs.stat(path.join(fullPath, e.name)).catch(() => null);
          const size = stat && !e.isDirectory() ? ` (${formatSize(stat.size)})` : "";
          return e.isDirectory() ? `📁 ${e.name}/` : `📄 ${e.name}${size}`;
        }),
      );
      return {
        content: [
          {
            type: "text" as const,
            text: lines.length ? lines.join("\n") : "(empty directory)",
          },
        ],
      };
    },
  );

  server.registerTool(
    "search_files",
    {
      description: "Search for files by glob pattern or search file contents by text",
      inputSchema: {
        pattern: z
          .string()
          .describe("Glob pattern (e.g. **/*.ts) or text to find in filenames"),
        search_in_content: z
          .string()
          .optional()
          .describe("Search for this text inside matching files"),
        path: z
          .string()
          .optional()
          .default(".")
          .describe("Start path relative to workspace"),
      },
    },
    async ({ pattern, search_in_content, path: startPath }) => {
      const basePath = resolveSafe(workspaceDir, startPath ?? ".");
      const matches = await glob(pattern, {
        cwd: basePath,
        ignore: ["node_modules/**", ".git/**", "dist/**", ".next/**"],
      });

      if (!search_in_content) {
        return {
          content: [
            {
              type: "text" as const,
              text: matches.length
                ? matches.join("\n")
                : "No files matched the pattern",
            },
          ],
        };
      }

      const results: string[] = [];
      for (const file of matches) {
        const fullFile = path.join(basePath, file);
        try {
          const content = await fs.readFile(fullFile, "utf-8");
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(search_in_content)) {
              results.push(`${file}:${i + 1}: ${lines[i].trim()}`);
            }
          }
        } catch {
          // skip unreadable files
        }
      }
      return {
        content: [
          {
            type: "text" as const,
            text: results.length ? results.join("\n") : "No matches found",
          },
        ],
      };
    },
  );

  server.registerTool(
    "generate_tree",
    {
      description: "Generate a directory tree view of the workspace",
      inputSchema: {
        path: z
          .string()
          .optional()
          .default(".")
          .describe("Root path relative to workspace"),
        max_depth: z
          .number()
          .optional()
          .default(4)
          .describe("Maximum depth to traverse"),
      },
    },
    async ({ path: rootPath, max_depth }) => {
      const fullPath = resolveSafe(workspaceDir, rootPath ?? ".");
      const label = rootPath === "." || !rootPath ? "workspace" : rootPath;
      const tree = `${label}/\n` + (await buildTree(fullPath, "", max_depth ?? 4));
      return {
        content: [{ type: "text" as const, text: tree }],
      };
    },
  );
}
