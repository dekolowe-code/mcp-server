import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Mistral } from "@mistralai/mistralai";
import path from "path";
import fse from "fs-extra";
import { z } from "zod";

const MODEL = "mistral-large-latest";

function getMistralClient(): Mistral {
  const apiKey = process.env["MISTRAL_API_KEY"];
  if (!apiKey) {
    throw new Error("MISTRAL_API_KEY environment variable is not set");
  }
  return new Mistral({ apiKey });
}

async function generateWithMistral(systemPrompt: string, userPrompt: string): Promise<string> {
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

interface GeneratedFile {
  path: string;
  content: string;
}

function extractFilesFromResponse(response: string): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const fileRegex = /```(?:\w+)?\s+(?:\/\/\s*)?(?:file:\s*)?([^\n]+)\n([\s\S]*?)```/gi;
  let match;
  while ((match = fileRegex.exec(response)) !== null) {
    const filePath = match[1].trim().replace(/^\//, "");
    const content = match[2];
    if (filePath && content) {
      files.push({ path: filePath, content });
    }
  }
  if (files.length === 0) {
    const blockRegex = /```(?:\w+)?\n([\s\S]*?)```/g;
    let i = 0;
    while ((match = blockRegex.exec(response)) !== null) {
      files.push({ path: `generated_${i++}.txt`, content: match[1] });
    }
  }
  return files;
}

async function writeGeneratedFiles(
  workspaceDir: string,
  projectDir: string,
  files: GeneratedFile[],
): Promise<string[]> {
  const written: string[] = [];
  for (const file of files) {
    const fullPath = path.join(workspaceDir, projectDir, file.path);
    await fse.ensureDir(path.dirname(fullPath));
    await fse.writeFile(fullPath, file.content, "utf-8");
    written.push(path.join(projectDir, file.path));
  }
  return written;
}

const CODEGEN_SYSTEM = `You are an expert fullstack developer AI assistant. 
When asked to generate code, produce complete, production-ready files.
For each file, format it as:
\`\`\`[language] [filename]
[content]
\`\`\`

Use the exact filename including directories (e.g., \`\`\`tsx src/App.tsx).
Generate all necessary files for a working project.
Include package.json, config files, and all source files needed.
Write clean, modern, well-structured code.
Do NOT include placeholders — generate real, complete implementations.`;

export function registerCodegenTools(server: McpServer, workspaceDir: string) {
  server.registerTool(
    "generate_code",
    {
      description: "Generate code for any language/framework using AI. Returns the generated code.",
      inputSchema: {
        description: z.string().describe("What to generate — be specific"),
        language: z
          .string()
          .optional()
          .describe("Programming language (e.g. TypeScript, Python, Go)"),
        framework: z
          .string()
          .optional()
          .describe("Framework to use (e.g. React, Express, FastAPI)"),
        output_path: z
          .string()
          .optional()
          .describe("If provided, write files to this directory in the workspace"),
      },
    },
    async ({ description, language, framework, output_path }) => {
      const context = [
        language && `Language: ${language}`,
        framework && `Framework: ${framework}`,
      ]
        .filter(Boolean)
        .join("\n");

      const prompt = `${context ? context + "\n\n" : ""}Generate: ${description}`;
      const response = await generateWithMistral(CODEGEN_SYSTEM, prompt);

      if (output_path) {
        const files = extractFilesFromResponse(response);
        if (files.length > 0) {
          const written = await writeGeneratedFiles(workspaceDir, output_path, files);
          return {
            content: [
              {
                type: "text" as const,
                text: `✅ Generated ${files.length} files:\n${written.join("\n")}\n\n---\n\n${response}`,
              },
            ],
          };
        }
      }

      return { content: [{ type: "text" as const, text: response }] };
    },
  );

  server.registerTool(
    "generate_react_app",
    {
      description: "Generate a complete React + Vite application with TypeScript and Tailwind CSS",
      inputSchema: {
        description: z.string().describe("What this React app should do"),
        project_name: z
          .string()
          .describe("Project name / directory to create in workspace"),
        features: z
          .array(z.string())
          .optional()
          .describe("Additional features (e.g. react-router, zustand, react-query)"),
      },
    },
    async ({ description, project_name, features }) => {
      const featureList = features?.join(", ") ?? "none";
      const prompt = `
Create a complete React + Vite + TypeScript + Tailwind CSS application.

Project name: ${project_name}
Description: ${description}
Additional features: ${featureList}

Generate ALL files needed for a working app:
- package.json
- vite.config.ts
- tsconfig.json
- tailwind.config.js
- postcss.config.js
- index.html
- src/main.tsx
- src/App.tsx
- src/index.css
- All component files, pages, hooks, types needed
- README.md

Make it a fully functional, beautiful application with real UI, not a skeleton.
`;
      const response = await generateWithMistral(CODEGEN_SYSTEM, prompt);
      const files = extractFilesFromResponse(response);
      const written = await writeGeneratedFiles(workspaceDir, project_name, files);
      return {
        content: [
          {
            type: "text" as const,
            text: `✅ React app generated: ${project_name}/\n\nFiles created:\n${written.join("\n")}\n\nRun: cd ${project_name} && npm install && npm run dev`,
          },
        ],
      };
    },
  );

  server.registerTool(
    "generate_nextjs_app",
    {
      description: "Generate a complete Next.js application with App Router, TypeScript, and Tailwind",
      inputSchema: {
        description: z.string().describe("What this Next.js app should do"),
        project_name: z.string().describe("Project name / directory in workspace"),
        features: z
          .array(z.string())
          .optional()
          .describe("Features like: auth, prisma, api-routes, mdx"),
      },
    },
    async ({ description, project_name, features }) => {
      const prompt = `
Create a complete Next.js 14 App Router + TypeScript + Tailwind CSS application.

Project name: ${project_name}
Description: ${description}
Features: ${features?.join(", ") ?? "standard"}

Generate ALL files:
- package.json (next 14, react 18, typescript, tailwind, postcss)
- next.config.ts
- tsconfig.json
- tailwind.config.ts
- app/layout.tsx
- app/page.tsx
- app/globals.css
- All pages, components, API routes needed
- README.md

Use Next.js App Router conventions. Generate a fully functional application.
`;
      const response = await generateWithMistral(CODEGEN_SYSTEM, prompt);
      const files = extractFilesFromResponse(response);
      const written = await writeGeneratedFiles(workspaceDir, project_name, files);
      return {
        content: [
          {
            type: "text" as const,
            text: `✅ Next.js app generated: ${project_name}/\n\nFiles:\n${written.join("\n")}\n\nRun: cd ${project_name} && npm install && npm run dev`,
          },
        ],
      };
    },
  );

  server.registerTool(
    "generate_express_backend",
    {
      description: "Generate a complete Express.js + TypeScript backend with REST API",
      inputSchema: {
        description: z.string().describe("What this backend API should do"),
        project_name: z.string().describe("Project directory name"),
        features: z
          .array(z.string())
          .optional()
          .describe("Features like: jwt-auth, prisma, swagger, cors, rate-limiting"),
        database: z
          .enum(["none", "postgres", "mysql", "sqlite", "mongodb"])
          .optional()
          .default("none"),
      },
    },
    async ({ description, project_name, features, database }) => {
      const prompt = `
Create a complete Express.js + TypeScript REST API backend.

Project: ${project_name}
Description: ${description}
Features: ${features?.join(", ") ?? "standard REST API"}
Database: ${database ?? "none"}

Generate ALL files:
- package.json
- tsconfig.json
- src/index.ts (entry point with port config)
- src/app.ts (express setup, middleware)
- src/routes/ (all route files)
- src/middleware/ (auth, error handling, etc.)
- src/controllers/ (business logic)
- src/types/ (TypeScript interfaces)
${database !== "none" ? "- Database schema and connection setup\n- Migration files if needed" : ""}
- .env.example
- README.md

Use Express 5, proper error handling, validation with zod, logging with pino.
Generate a production-ready API with real endpoints, not stubs.
`;
      const response = await generateWithMistral(CODEGEN_SYSTEM, prompt);
      const files = extractFilesFromResponse(response);
      const written = await writeGeneratedFiles(workspaceDir, project_name, files);
      return {
        content: [
          {
            type: "text" as const,
            text: `✅ Express backend generated: ${project_name}/\n\nFiles:\n${written.join("\n")}\n\nRun: cd ${project_name} && npm install && npm run dev`,
          },
        ],
      };
    },
  );

  server.registerTool(
    "generate_fastapi_backend",
    {
      description: "Generate a complete FastAPI Python backend",
      inputSchema: {
        description: z.string().describe("What this API should do"),
        project_name: z.string().describe("Project directory name"),
        features: z
          .array(z.string())
          .optional()
          .describe("Features like: jwt-auth, sqlalchemy, alembic, websockets, celery"),
        database: z
          .enum(["none", "postgres", "mysql", "sqlite"])
          .optional()
          .default("sqlite"),
      },
    },
    async ({ description, project_name, features, database }) => {
      const prompt = `
Create a complete FastAPI Python backend.

Project: ${project_name}
Description: ${description}
Features: ${features?.join(", ") ?? "standard"}
Database: ${database ?? "sqlite"}

Generate ALL files:
- requirements.txt
- main.py
- app/__init__.py
- app/api/routes/ (all route files)
- app/models/ (SQLAlchemy models)
- app/schemas/ (Pydantic schemas)
- app/core/config.py
- app/core/database.py
- app/dependencies.py
- alembic.ini and migrations/ if using DB
- .env.example
- README.md
- Dockerfile

Use FastAPI best practices: async endpoints, Pydantic v2, proper error handling, OpenAPI docs.
Generate a fully functional API with real implementations.
`;
      const response = await generateWithMistral(CODEGEN_SYSTEM, prompt);
      const files = extractFilesFromResponse(response);
      const written = await writeGeneratedFiles(workspaceDir, project_name, files);
      return {
        content: [
          {
            type: "text" as const,
            text: `✅ FastAPI backend generated: ${project_name}/\n\nFiles:\n${written.join("\n")}\n\nRun: cd ${project_name} && pip install -r requirements.txt && uvicorn main:app --reload`,
          },
        ],
      };
    },
  );

  server.registerTool(
    "generate_mobile_app",
    {
      description: "Generate a complete React Native / Expo mobile application",
      inputSchema: {
        description: z.string().describe("What this mobile app should do"),
        project_name: z.string().describe("Project directory name"),
        features: z
          .array(z.string())
          .optional()
          .describe("Features like: navigation, auth, maps, camera, notifications, sqlite"),
      },
    },
    async ({ description, project_name, features }) => {
      const prompt = `
Create a complete Expo (React Native) mobile application with TypeScript.

Project: ${project_name}
Description: ${description}
Features: ${features?.join(", ") ?? "navigation, storage"}

Generate ALL files:
- package.json (expo, expo-router, nativewind)
- app.json
- babel.config.js
- tsconfig.json
- tailwind.config.js
- app/_layout.tsx (root layout with navigation)
- app/(tabs)/_layout.tsx
- app/(tabs)/index.tsx
- app/(tabs)/[other tabs].tsx
- components/ (reusable components)
- hooks/ (custom hooks)
- constants/ (colors, layout)
- types/ (TypeScript types)
- README.md

Use Expo Router v3, NativeWind for styling, AsyncStorage for persistence.
Generate a complete, beautiful, functional mobile app — not a skeleton.
`;
      const response = await generateWithMistral(CODEGEN_SYSTEM, prompt);
      const files = extractFilesFromResponse(response);
      const written = await writeGeneratedFiles(workspaceDir, project_name, files);
      return {
        content: [
          {
            type: "text" as const,
            text: `✅ Expo mobile app generated: ${project_name}/\n\nFiles:\n${written.join("\n")}\n\nRun: cd ${project_name} && npm install && npx expo start`,
          },
        ],
      };
    },
  );

  server.registerTool(
    "generate_prisma_schema",
    {
      description: "Generate a Prisma schema for a given data model description",
      inputSchema: {
        description: z
          .string()
          .describe("Describe the data model (entities, relationships, requirements)"),
        database: z
          .enum(["postgresql", "mysql", "sqlite", "mongodb"])
          .optional()
          .default("postgresql"),
        output_path: z
          .string()
          .optional()
          .describe("Path to write schema.prisma (relative to workspace)"),
      },
    },
    async ({ description, database, output_path }) => {
      const prompt = `
Generate a complete Prisma schema file.

Database: ${database ?? "postgresql"}
Data model: ${description}

Include:
- All models with proper field types
- Relations (@relation)
- Indexes (@index, @@index)
- Constraints (@unique, @@unique)
- Enums where appropriate
- createdAt/updatedAt timestamps
- Proper datasource and generator blocks

Return just the schema.prisma file content.
`;
      const response = await generateWithMistral(CODEGEN_SYSTEM, prompt);

      if (output_path) {
        const files = extractFilesFromResponse(response);
        const schemaContent =
          files.find((f) => f.path.includes("schema.prisma"))?.content ??
          response;
        const fullPath = path.join(workspaceDir, output_path);
        await fse.ensureDir(path.dirname(fullPath));
        await fse.writeFile(fullPath, schemaContent, "utf-8");
        return {
          content: [
            {
              type: "text" as const,
              text: `✅ Prisma schema written to ${output_path}\n\n${schemaContent}`,
            },
          ],
        };
      }

      return { content: [{ type: "text" as const, text: response }] };
    },
  );

  server.registerTool(
    "generate_dockerfile",
    {
      description: "Generate a Dockerfile and docker-compose.yml for a project",
      inputSchema: {
        description: z
          .string()
          .describe("Project type and requirements (e.g. Node.js Express API with PostgreSQL)"),
        project_path: z
          .string()
          .optional()
          .describe("Project directory relative to workspace to write files into"),
        include_compose: z
          .boolean()
          .optional()
          .default(true)
          .describe("Also generate docker-compose.yml"),
      },
    },
    async ({ description, project_path, include_compose }) => {
      const prompt = `
Generate Docker configuration for: ${description}

Produce:
- Dockerfile (multi-stage build, minimal final image, proper user, health check)
${include_compose ? "- docker-compose.yml (with all services, volumes, env vars)" : ""}
- .dockerignore

Follow best practices: layer caching, non-root user, HEALTHCHECK, proper CMD/ENTRYPOINT.
`;
      const response = await generateWithMistral(CODEGEN_SYSTEM, prompt);

      if (project_path) {
        const files = extractFilesFromResponse(response);
        const written = await writeGeneratedFiles(workspaceDir, project_path, files);
        return {
          content: [
            {
              type: "text" as const,
              text: `✅ Docker files generated in ${project_path}/\n${written.join("\n")}\n\n${response}`,
            },
          ],
        };
      }

      return { content: [{ type: "text" as const, text: response }] };
    },
  );

  server.registerTool(
    "generate_github_actions",
    {
      description: "Generate GitHub Actions CI/CD workflows",
      inputSchema: {
        description: z
          .string()
          .describe("Project type and deployment target (e.g. Node.js API deploy to Railway)"),
        project_path: z
          .string()
          .optional()
          .describe("Project directory to write .github/workflows/ into"),
      },
    },
    async ({ description, project_path }) => {
      const prompt = `
Generate GitHub Actions CI/CD workflow YAML files for: ${description}

Include:
- .github/workflows/ci.yml (lint, typecheck, test on PR)
- .github/workflows/deploy.yml (deploy on merge to main)

Use modern GitHub Actions syntax, proper caching, secrets handling.
`;
      const response = await generateWithMistral(CODEGEN_SYSTEM, prompt);

      if (project_path) {
        const files = extractFilesFromResponse(response);
        const written = await writeGeneratedFiles(workspaceDir, project_path, files);
        return {
          content: [
            {
              type: "text" as const,
              text: `✅ GitHub Actions generated:\n${written.join("\n")}\n\n${response}`,
            },
          ],
        };
      }

      return { content: [{ type: "text" as const, text: response }] };
    },
  );
}
