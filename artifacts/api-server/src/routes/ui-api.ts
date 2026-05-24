import { Router } from "express";
import fs from "fs/promises";
import { execa } from "execa";
import path from "path";
import { glob } from "glob";
import fse from "fs-extra";
import { Mistral } from "@mistralai/mistralai";
import { WORKSPACE_DIR } from "../mcp/server.js";
import { logger } from "../lib/logger.js";

const uiApiRouter = Router();

function resolveSafe(base: string, rel: string): string {
  const resolved = path.resolve(base, rel.replace(/^\//, ""));
  if (!resolved.startsWith(base)) throw new Error("Path traversal denied");
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
    try { stat = await fs.stat(fullPath); } catch { continue; }
    if (stat.isDirectory()) {
      output += `${prefix}${connector}${entry}/\n`;
      output += await buildTree(fullPath, childPrefix, maxDepth, depth + 1);
    } else {
      output += `${prefix}${connector}${entry} (${formatSize(stat.size)})\n`;
    }
  }
  return output;
}

// GET /api/ui/info
uiApiRouter.get("/info", async (_req, res) => {
  let workspaceFiles = 0;
  try {
    const files = await glob("**/*", { cwd: WORKSPACE_DIR, ignore: ["node_modules/**", ".git/**"], maxDepth: 6 });
    workspaceFiles = files.length;
  } catch { /* empty workspace */ }
  res.json({
    server: { name: "MCP FullStack Builder", version: "1.0.0", status: "running" },
    workspace: { dir: WORKSPACE_DIR, files: workspaceFiles },
    tools: {
      total: 37,
      categories: {
        filesystem: 10, terminal: 7, codegen: 9, debug: 8, design: 5, project: 5,
      },
    },
    ai: { provider: "Mistral", model: "mistral-large-latest" },
  });
});

// GET /api/ui/workspace/tree?path=.&depth=4
uiApiRouter.get("/workspace/tree", async (req, res) => {
  try {
    const rel = (req.query["path"] as string) || ".";
    const depth = parseInt((req.query["depth"] as string) || "4", 10);
    const fullPath = resolveSafe(WORKSPACE_DIR, rel);
    await fse.ensureDir(fullPath);
    const label = rel === "." ? "workspace" : rel;
    const tree = `${label}/\n` + (await buildTree(fullPath, "", depth));
    res.json({ tree, path: rel });
  } catch (err: unknown) {
    res.status(400).json({ error: String(err) });
  }
});

// GET /api/ui/workspace/list?path=.
uiApiRouter.get("/workspace/list", async (req, res) => {
  try {
    const rel = (req.query["path"] as string) || ".";
    const fullPath = resolveSafe(WORKSPACE_DIR, rel);
    await fse.ensureDir(fullPath);
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const items = await Promise.all(
      entries.map(async (e) => {
        const stat = await fs.stat(path.join(fullPath, e.name)).catch(() => null);
        return {
          name: e.name,
          type: e.isDirectory() ? "dir" : "file",
          size: stat && !e.isDirectory() ? stat.size : null,
          modified: stat?.mtimeMs ?? null,
        };
      }),
    );
    res.json({ items, path: rel });
  } catch (err: unknown) {
    res.status(400).json({ error: String(err) });
  }
});

// GET /api/ui/workspace/file?path=...
uiApiRouter.get("/workspace/file", async (req, res) => {
  try {
    const rel = req.query["path"] as string;
    if (!rel) { res.status(400).json({ error: "path required" }); return; }
    const fullPath = resolveSafe(WORKSPACE_DIR, rel);
    const content = await fs.readFile(fullPath, "utf-8");
    res.json({ content, path: rel });
  } catch (err: unknown) {
    res.status(400).json({ error: String(err) });
  }
});

// POST /api/ui/workspace/write
uiApiRouter.post("/workspace/write", async (req, res) => {
  try {
    const { path: rel, content } = req.body as { path: string; content: string };
    if (!rel) { res.status(400).json({ error: "path required" }); return; }
    const fullPath = resolveSafe(WORKSPACE_DIR, rel);
    await fse.ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, content, "utf-8");
    res.json({ ok: true, path: rel });
  } catch (err: unknown) {
    res.status(400).json({ error: String(err) });
  }
});

// POST /api/ui/terminal/run
uiApiRouter.post("/terminal/run", async (req, res) => {
  try {
    const { command, cwd } = req.body as { command: string; cwd?: string };
    if (!command) { res.status(400).json({ error: "command required" }); return; }
    const workingDir = cwd ? resolveSafe(WORKSPACE_DIR, cwd) : WORKSPACE_DIR;
    await fse.ensureDir(workingDir);
    const result = await execa("sh", ["-c", command], {
      cwd: workingDir, timeout: 120_000, reject: false,
    });
    res.json({
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      exitCode: result.exitCode ?? 0,
    });
  } catch (err: unknown) {
    res.status(400).json({ error: String(err) });
  }
});

// POST /api/ui/generate
uiApiRouter.post("/generate", async (req, res) => {
  try {
    const { tool, params } = req.body as {
      tool: string;
      params: Record<string, unknown>;
    };

    const apiKey = process.env["MISTRAL_API_KEY"];
    if (!apiKey) { res.status(500).json({ error: "MISTRAL_API_KEY not configured" }); return; }
    const client = new Mistral({ apiKey });

    const systemPrompts: Record<string, string> = {
      generate_react_app: "You are an expert React developer. Generate complete, production-ready React + Vite + TypeScript + Tailwind CSS applications. For each file use format: ```[lang] [filepath]\n[content]\n```",
      generate_nextjs_app: "You are an expert Next.js developer. Generate complete Next.js 14 App Router applications. For each file: ```[lang] [filepath]\n[content]\n```",
      generate_express_backend: "You are an expert Node.js developer. Generate complete Express + TypeScript backends. For each file: ```[lang] [filepath]\n[content]\n```",
      generate_fastapi_backend: "You are an expert Python developer. Generate complete FastAPI backends. For each file: ```[lang] [filepath]\n[content]\n```",
      generate_mobile_app: "You are an expert Expo/React Native developer. Generate complete Expo apps. For each file: ```[lang] [filepath]\n[content]\n```",
      generate_code: "You are an expert software developer. Generate complete, production-ready code. For each file: ```[lang] [filepath]\n[content]\n```",
      generate_landing_page: "You are an expert frontend developer and designer. Generate complete, beautiful landing pages in React + Tailwind. For each file: ```[lang] [filepath]\n[content]\n```",
    };

    const userPromptBuilders: Record<string, (p: Record<string, unknown>) => string> = {
      generate_react_app: (p) => `Create a complete React + Vite + TypeScript + Tailwind app.\nProject: ${p["project_name"]}\nDescription: ${p["description"]}\nFeatures: ${(p["features"] as string[] | undefined)?.join(", ") ?? "standard"}\n\nGenerate ALL files including package.json, vite.config.ts, tsconfig.json, tailwind.config.js, index.html, src/main.tsx, src/App.tsx, src/index.css, and all components.`,
      generate_nextjs_app: (p) => `Create a complete Next.js 14 App Router app.\nProject: ${p["project_name"]}\nDescription: ${p["description"]}\nFeatures: ${(p["features"] as string[] | undefined)?.join(", ") ?? "standard"}\n\nGenerate ALL files.`,
      generate_express_backend: (p) => `Create a complete Express + TypeScript REST API.\nProject: ${p["project_name"]}\nDescription: ${p["description"]}\nDatabase: ${p["database"] ?? "none"}\n\nGenerate ALL files.`,
      generate_fastapi_backend: (p) => `Create a complete FastAPI Python backend.\nProject: ${p["project_name"]}\nDescription: ${p["description"]}\nDatabase: ${p["database"] ?? "sqlite"}\n\nGenerate ALL files.`,
      generate_mobile_app: (p) => `Create a complete Expo React Native app.\nProject: ${p["project_name"]}\nDescription: ${p["description"]}\nFeatures: ${(p["features"] as string[] | undefined)?.join(", ") ?? "navigation"}\n\nGenerate ALL files.`,
      generate_code: (p) => `Generate: ${p["description"]}\nLanguage: ${p["language"] ?? "TypeScript"}\nFramework: ${p["framework"] ?? ""}`,
      generate_landing_page: (p) => `Generate a complete, beautiful landing page.\nProduct: ${p["product_name"]}\nTagline: ${p["tagline"]}\nDescription: ${p["description"]}\nSections: ${p["sections"] ?? "hero, features, pricing, cta"}`,
    };

    const systemPrompt = systemPrompts[tool] ?? systemPrompts["generate_code"]!;
    const buildUserPrompt = userPromptBuilders[tool] ?? ((p) => JSON.stringify(p));
    const userPrompt = buildUserPrompt(params);

    const response = await client.chat.complete({
      model: "mistral-large-latest",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 8192,
    });

    const content = response.choices?.[0]?.message?.content;
    const text = typeof content === "string" ? content : JSON.stringify(content);

    // Parse files and write them
    const projectName = (params["project_name"] as string) ?? "generated";
    const fileRegex = /```(?:\w+)?\s+([^\n`]+)\n([\s\S]*?)```/gi;
    let match;
    const writtenFiles: string[] = [];
    while ((match = fileRegex.exec(text)) !== null) {
      const filePath = match[1]!.trim().replace(/^\//, "");
      const fileContent = match[2]!;
      if (filePath && fileContent && !filePath.startsWith("bash") && !filePath.startsWith("shell")) {
        const fullPath = path.join(WORKSPACE_DIR, projectName, filePath);
        await fse.ensureDir(path.dirname(fullPath));
        await fs.writeFile(fullPath, fileContent, "utf-8");
        writtenFiles.push(path.join(projectName, filePath));
      }
    }

    logger.info({ tool, project: projectName, files: writtenFiles.length }, "Generation complete");
    res.json({ text, writtenFiles, projectName });
  } catch (err: unknown) {
    logger.error({ err }, "Generation error");
    res.status(500).json({ error: String(err) });
  }
});

export default uiApiRouter;
