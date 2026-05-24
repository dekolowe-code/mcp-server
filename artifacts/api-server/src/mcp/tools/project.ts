import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Mistral } from "@mistralai/mistralai";
import fs from "fs/promises";
import path from "path";
import { glob } from "glob";
import { z } from "zod";

const MODEL = "mistral-large-latest";

function getMistralClient(): Mistral {
  const apiKey = process.env["MISTRAL_API_KEY"];
  if (!apiKey) throw new Error("MISTRAL_API_KEY not set");
  return new Mistral({ apiKey });
}

async function askMistral(systemPrompt: string, userPrompt: string): Promise<string> {
  const client = getMistralClient();
  const response = await client.chat.complete({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    maxTokens: 8192,
  });
  const content = response.choices?.[0]?.message?.content;
  if (!content) throw new Error("No response from Mistral");
  return typeof content === "string" ? content : JSON.stringify(content);
}

const ARCHITECT_SYSTEM = `You are an expert software architect and technical consultant.
You analyze projects, detect technologies, plan architectures, and provide strategic technical guidance.
Be specific, practical, and comprehensive in your analysis.`;

export function registerProjectTools(server: McpServer, workspaceDir: string) {
  server.registerTool(
    "analyze_project",
    {
      description:
        "Analyze an existing project: detect framework, architecture, dependencies, and issues",
      inputSchema: {
        path: z
          .string()
          .optional()
          .default(".")
          .describe("Project path relative to workspace"),
      },
    },
    async ({ path: projectPath }) => {
      const fullPath = path.resolve(workspaceDir, projectPath ?? ".");

      // Gather project info
      const indicators: string[] = [];

      const filesToCheck = [
        "package.json",
        "requirements.txt",
        "Cargo.toml",
        "go.mod",
        "pom.xml",
        "composer.json",
        "Gemfile",
        "next.config.js",
        "next.config.ts",
        "vite.config.ts",
        "vite.config.js",
        "angular.json",
        "nuxt.config.ts",
        "svelte.config.js",
        "astro.config.mjs",
        "app.json",
        "pubspec.yaml",
        "Dockerfile",
        "docker-compose.yml",
        ".env.example",
        "tsconfig.json",
        "tailwind.config.js",
        "tailwind.config.ts",
        "prisma/schema.prisma",
        "drizzle.config.ts",
      ];

      for (const file of filesToCheck) {
        const filePath = path.join(fullPath, file);
        try {
          const content = await fs.readFile(filePath, "utf-8");
          indicators.push(`=== ${file} ===\n${content.slice(0, 2000)}`);
        } catch {
          // File doesn't exist
        }
      }

      // Get directory structure
      let structure = "";
      try {
        const entries = await glob("**/*", {
          cwd: fullPath,
          ignore: ["node_modules/**", ".git/**", "dist/**", ".next/**", "__pycache__/**"],
          maxDepth: 3,
        });
        structure = entries.slice(0, 100).join("\n");
      } catch {
        structure = "Could not read directory";
      }

      const prompt = `
Analyze this project:

Directory structure:
${structure}

Key files:
${indicators.join("\n\n")}

Provide a comprehensive analysis:
1. **Framework & Stack** — detected technologies and versions
2. **Architecture** — SPA/SSR/SSG/Monorepo/Microservices/etc.
3. **Dependencies** — key packages, outdated ones, security concerns
4. **Code structure** — organization, patterns used
5. **Detected issues** — bugs, anti-patterns, tech debt
6. **Improvement recommendations** — prioritized list
7. **Missing best practices** — what should be added
`;
      const result = await askMistral(ARCHITECT_SYSTEM, prompt);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.registerTool(
    "plan_architecture",
    {
      description: "Get a detailed technical architecture plan for a new project",
      inputSchema: {
        description: z
          .string()
          .describe("What you want to build (type, features, scale)"),
        constraints: z
          .string()
          .optional()
          .describe("Technical constraints (budget, team size, preferred language, etc.)"),
        scale: z
          .enum(["mvp", "startup", "enterprise"])
          .optional()
          .default("startup"),
      },
    },
    async ({ description, constraints, scale }) => {
      const prompt = `
Plan the architecture for: ${description}
Scale: ${scale ?? "startup"}
${constraints ? `Constraints: ${constraints}` : ""}

Provide a complete technical architecture plan:
1. **Tech stack recommendation** — with justification for each choice
2. **System architecture diagram** (ASCII)
3. **Project structure** — directory layout
4. **Database schema** — entities and relationships
5. **API design** — key endpoints
6. **Authentication & authorization** strategy
7. **Deployment architecture** — hosting, CI/CD
8. **Development phases** — MVP → v1 → v2 milestones
9. **Estimated complexity** — time and team size
`;
      const result = await askMistral(ARCHITECT_SYSTEM, prompt);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.registerTool(
    "generate_readme",
    {
      description: "Generate a comprehensive README.md for a project",
      inputSchema: {
        project_path: z
          .string()
          .optional()
          .default(".")
          .describe("Project path relative to workspace"),
        project_name: z.string().optional().describe("Project name"),
        description: z.string().optional().describe("Project description override"),
      },
    },
    async ({ project_path, project_name, description }) => {
      const fullPath = path.resolve(workspaceDir, project_path ?? ".");
      let pkgJson = "";
      try {
        pkgJson = await fs.readFile(path.join(fullPath, "package.json"), "utf-8");
      } catch {
        // no package.json
      }

      const prompt = `
Generate a comprehensive, professional README.md for this project.

${project_name ? `Project name: ${project_name}` : ""}
${description ? `Description: ${description}` : ""}
${pkgJson ? `package.json:\n${pkgJson}` : ""}

Include:
- Project title with badges (build, license, version)
- Description and key features
- Tech stack
- Prerequisites
- Installation & setup
- Environment variables
- Running locally
- Project structure
- API documentation (if applicable)
- Deployment
- Contributing guide
- License

Make it polished and developer-friendly.
`;
      const result = await askMistral(ARCHITECT_SYSTEM, prompt);

      // Write README if path provided
      const readmePath = path.join(fullPath, "README.md");
      await fs.writeFile(readmePath, result, "utf-8").catch(() => {});

      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.registerTool(
    "scan_security",
    {
      description: "Scan project files for common security vulnerabilities and bad practices",
      inputSchema: {
        path: z
          .string()
          .optional()
          .default(".")
          .describe("Project path relative to workspace"),
        include_deps: z
          .boolean()
          .optional()
          .default(false)
          .describe("Include analysis of dependencies"),
      },
    },
    async ({ path: projectPath, include_deps }) => {
      const fullPath = path.resolve(workspaceDir, projectPath ?? ".");
      const patterns = [
        "**/*.ts",
        "**/*.tsx",
        "**/*.js",
        "**/*.jsx",
        "**/*.py",
        "**/*.env*",
        "**/*.config.*",
      ];

      const codeSnippets: string[] = [];
      for (const pattern of patterns) {
        const files = await glob(pattern, {
          cwd: fullPath,
          ignore: ["node_modules/**", ".git/**", "dist/**"],
        });
        for (const file of files.slice(0, 20)) {
          try {
            const content = await fs.readFile(path.join(fullPath, file), "utf-8");
            codeSnippets.push(`=== ${file} ===\n${content.slice(0, 1500)}`);
          } catch {
            // skip
          }
        }
      }

      const prompt = `
Perform a security scan on this codebase.

Files to analyze:
${codeSnippets.join("\n\n")}

Check for:
- Hardcoded secrets, API keys, passwords in code
- SQL/NoSQL injection vulnerabilities
- XSS vulnerabilities
- CSRF issues
- Insecure authentication (weak hashing, no rate limiting, etc.)
- Exposed sensitive endpoints
- Insecure dependencies (if names visible)
- Environment variable exposure
- Path traversal vulnerabilities
- Command injection risks
- Insecure file uploads
- Missing HTTPS enforcement
${include_deps ? "- Known vulnerable dependency patterns" : ""}

For each issue:
🔴 CRITICAL | 🟠 HIGH | 🟡 MEDIUM | 🟢 LOW
- Location (file:line if possible)
- Description
- Exact fix

End with a security score (0-100) and top 3 immediate actions.
`;
      const result = await askMistral(ARCHITECT_SYSTEM, prompt);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.registerTool(
    "generate_tests",
    {
      description: "Generate tests for a given function, module, or API",
      inputSchema: {
        code: z.string().describe("Code to generate tests for"),
        language: z.string().describe("Programming language"),
        test_framework: z
          .string()
          .optional()
          .describe("Test framework (e.g. vitest, jest, pytest, go test)"),
        test_type: z
          .enum(["unit", "integration", "e2e", "all"])
          .optional()
          .default("unit"),
      },
    },
    async ({ code, language, test_framework, test_type }) => {
      const prompt = `
Generate ${test_type ?? "unit"} tests for this ${language} code.
Test framework: ${test_framework ?? "appropriate default for " + language}

Code to test:
\`\`\`${language.toLowerCase()}
${code}
\`\`\`

Generate comprehensive tests:
- Happy path cases
- Edge cases and boundary conditions
- Error cases and exception handling
- Mock external dependencies where needed
- Clear test descriptions
- Good coverage of all code paths

Return complete, runnable test code.
`;
      const result = await askMistral(ARCHITECT_SYSTEM, prompt);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );
}
