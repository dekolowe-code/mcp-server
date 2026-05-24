import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Mistral } from "@mistralai/mistralai";
import { z } from "zod";

const MODEL = "mistral-large-latest";

function getMistralClient(): Mistral {
  const apiKey = process.env["MISTRAL_API_KEY"];
  if (!apiKey) throw new Error("MISTRAL_API_KEY not set");
  return new Mistral({ apiKey });
}

async function analyzeWithMistral(systemPrompt: string, userPrompt: string): Promise<string> {
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

const DEBUG_SYSTEM = `You are an expert software debugger and code fixer.
When analyzing errors:
1. Identify the root cause clearly
2. Explain what went wrong and why
3. Provide the exact fix (complete corrected code when relevant)
4. List any follow-up steps needed (install packages, run migrations, etc.)
Be precise, actionable, and complete.`;

export function registerDebugTools(server: McpServer) {
  server.registerTool(
    "analyze_error",
    {
      description: "Analyze an error message or stack trace and get a diagnosis with fix suggestions",
      inputSchema: {
        error: z.string().describe("The error message or stack trace"),
        context: z
          .string()
          .optional()
          .describe("Additional context: what you were doing, relevant code, file contents"),
        language: z
          .string()
          .optional()
          .describe("Programming language (e.g. TypeScript, Python, Rust)"),
        framework: z
          .string()
          .optional()
          .describe("Framework involved (e.g. React, Express, Next.js)"),
      },
    },
    async ({ error, context, language, framework }) => {
      const prompt = `
Error to analyze:
\`\`\`
${error}
\`\`\`

${language ? `Language: ${language}` : ""}
${framework ? `Framework: ${framework}` : ""}
${context ? `\nContext:\n${context}` : ""}

Diagnose this error and provide the exact fix.
`;
      const result = await analyzeWithMistral(DEBUG_SYSTEM, prompt);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.registerTool(
    "fix_code",
    {
      description: "Fix broken code given the code and the error it produces",
      inputSchema: {
        code: z.string().describe("The code that has an error"),
        error: z
          .string()
          .optional()
          .describe("The error message the code produces"),
        language: z.string().describe("Programming language"),
        instructions: z
          .string()
          .optional()
          .describe("Additional fix instructions or constraints"),
      },
    },
    async ({ code, error, language, instructions }) => {
      const prompt = `
Fix this ${language} code:

\`\`\`${language.toLowerCase()}
${code}
\`\`\`

${error ? `Error:\n\`\`\`\n${error}\n\`\`\`` : ""}
${instructions ? `\nAdditional instructions: ${instructions}` : ""}

Return the complete fixed code with a brief explanation of what was wrong.
`;
      const result = await analyzeWithMistral(DEBUG_SYSTEM, prompt);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.registerTool(
    "analyze_build_error",
    {
      description: "Analyze a build error (TypeScript, webpack, vite, etc.) and get a fix",
      inputSchema: {
        build_output: z.string().describe("The full build command output"),
        build_tool: z
          .enum(["typescript", "vite", "webpack", "esbuild", "rollup", "next", "expo", "other"])
          .optional()
          .default("other"),
        project_structure: z
          .string()
          .optional()
          .describe("Brief description of project structure or relevant files"),
      },
    },
    async ({ build_output, build_tool, project_structure }) => {
      const prompt = `
Build tool: ${build_tool ?? "unknown"}

Build output / errors:
\`\`\`
${build_output}
\`\`\`

${project_structure ? `Project context:\n${project_structure}` : ""}

Identify all errors, explain each one, and provide the exact fixes needed.
`;
      const result = await analyzeWithMistral(DEBUG_SYSTEM, prompt);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.registerTool(
    "fix_typescript_errors",
    {
      description: "Fix TypeScript type errors in a code snippet",
      inputSchema: {
        code: z.string().describe("TypeScript code with errors"),
        errors: z.string().describe("TypeScript error messages (from tsc output)"),
        strict: z
          .boolean()
          .optional()
          .default(true)
          .describe("Whether to maintain strict TypeScript settings"),
      },
    },
    async ({ code, errors, strict }) => {
      const prompt = `
Fix these TypeScript errors.
${strict ? "Maintain strict TypeScript — do not use 'any' or disable strict checks." : ""}

Code with errors:
\`\`\`typescript
${code}
\`\`\`

TypeScript errors:
\`\`\`
${errors}
\`\`\`

Return the complete fixed TypeScript code.
`;
      const result = await analyzeWithMistral(DEBUG_SYSTEM, prompt);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.registerTool(
    "fix_dependency_conflicts",
    {
      description: "Diagnose and fix npm/pnpm/pip dependency conflicts",
      inputSchema: {
        error_output: z.string().describe("The dependency install error output"),
        package_manager: z
          .enum(["npm", "pnpm", "yarn", "pip"])
          .optional()
          .default("npm"),
        package_json: z
          .string()
          .optional()
          .describe("Contents of package.json or requirements.txt"),
      },
    },
    async ({ error_output, package_manager, package_json }) => {
      const prompt = `
Package manager: ${package_manager ?? "npm"}

Install error:
\`\`\`
${error_output}
\`\`\`

${package_json ? `\npackage.json / requirements:\n\`\`\`\n${package_json}\n\`\`\`` : ""}

Diagnose the dependency conflict and provide the exact commands and file changes to fix it.
`;
      const result = await analyzeWithMistral(DEBUG_SYSTEM, prompt);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.registerTool(
    "code_review",
    {
      description: "Perform a thorough code review: bugs, security issues, performance, best practices",
      inputSchema: {
        code: z.string().describe("Code to review"),
        language: z.string().describe("Programming language"),
        focus: z
          .array(z.enum(["bugs", "security", "performance", "style", "architecture", "all"]))
          .optional()
          .default(["all"])
          .describe("Aspects to focus on"),
      },
    },
    async ({ code, language, focus }) => {
      const focusAreas = focus?.join(", ") ?? "all";
      const prompt = `
Review this ${language} code. Focus on: ${focusAreas}

\`\`\`${language.toLowerCase()}
${code}
\`\`\`

Provide:
1. Critical issues (bugs, security vulnerabilities)
2. Performance problems
3. Code quality / best practices issues
4. Specific improvement suggestions with corrected code examples
Rate severity: 🔴 Critical, 🟠 High, 🟡 Medium, 🟢 Low
`;
      const result = await analyzeWithMistral(DEBUG_SYSTEM, prompt);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.registerTool(
    "refactor_code",
    {
      description: "Refactor code to improve quality, readability, or performance",
      inputSchema: {
        code: z.string().describe("Code to refactor"),
        language: z.string().describe("Programming language"),
        goals: z
          .string()
          .optional()
          .describe("Refactoring goals (e.g. extract functions, add types, improve performance)"),
      },
    },
    async ({ code, language, goals }) => {
      const prompt = `
Refactor this ${language} code.
${goals ? `Goals: ${goals}` : "General: improve readability, maintainability, and performance."}

Original code:
\`\`\`${language.toLowerCase()}
${code}
\`\`\`

Return the refactored code with a brief explanation of the changes made.
`;
      const result = await analyzeWithMistral(DEBUG_SYSTEM, prompt);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );

  server.registerTool(
    "explain_code",
    {
      description: "Get a clear explanation of what a piece of code does",
      inputSchema: {
        code: z.string().describe("Code to explain"),
        language: z.string().optional().describe("Programming language"),
        depth: z
          .enum(["brief", "detailed", "line-by-line"])
          .optional()
          .default("detailed"),
      },
    },
    async ({ code, language, depth }) => {
      const prompt = `
Explain this${language ? ` ${language}` : ""} code at a ${depth ?? "detailed"} level:

\`\`\`${language?.toLowerCase() ?? ""}
${code}
\`\`\`

${
  depth === "line-by-line"
    ? "Go through each significant line or block and explain what it does."
    : depth === "brief"
    ? "Give a brief (2-4 sentence) summary."
    : "Explain the overall purpose, how it works, key concepts used, and any important details."
}
`;
      const result = await analyzeWithMistral(DEBUG_SYSTEM, prompt);
      return { content: [{ type: "text" as const, text: result }] };
    },
  );
}
