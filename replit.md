# MCP FullStack Builder

An autonomous AI FullStack Engineering Platform exposed as an MCP server. Compatible with Claude Desktop, Cline, Cursor, Windsurf, and any MCP-compatible client.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- MCP: `@modelcontextprotocol/sdk` (StreamableHTTPServerTransport)
- AI: Mistral AI (`mistral-large-latest`) via `MISTRAL_API_KEY`
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/mcp/server.ts` — MCP server factory, registers all tool groups
- `artifacts/api-server/src/mcp/tools/filesystem.ts` — read/write/edit/delete/search/tree
- `artifacts/api-server/src/mcp/tools/terminal.ts` — run commands, npm/pnpm/pip install, build, tests
- `artifacts/api-server/src/mcp/tools/codegen.ts` — AI-powered code generation (React, Next.js, Express, FastAPI, Expo, Prisma, Docker, GH Actions)
- `artifacts/api-server/src/mcp/tools/debug.ts` — error analysis, code fixing, review, refactor
- `artifacts/api-server/src/mcp/tools/design.ts` — design suggestions, tokens, component generation
- `artifacts/api-server/src/mcp/tools/project.ts` — project analysis, architecture planning, security scan, test generation
- `artifacts/api-server/src/routes/mcp.ts` — HTTP routes for MCP (POST/GET/DELETE /api/mcp)

## MCP Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/mcp/info` | Server info, tool list, session count |
| POST | `/api/mcp` | Initialize or continue MCP session |
| GET | `/api/mcp` | SSE stream for active session |
| DELETE | `/api/mcp` | Close session |

## MCP Configuration (Claude Desktop / Cline / Cursor)

```json
{
  "mcpServers": {
    "fullstack-builder": {
      "url": "https://<your-replit-domain>/api/mcp"
    }
  }
}
```

## Workspace

Generated project files are written to `MCP_WORKSPACE_DIR` (default: `/tmp/mcp-workspace`).
Set `MCP_WORKSPACE_DIR` env var to change this.

## Environment Variables

- `MISTRAL_API_KEY` — Mistral API key (required)
- `MCP_WORKSPACE_DIR` — Directory for generated projects (default: `/tmp/mcp-workspace`)

## Architecture Decisions

- MCP sessions are stateful (in-memory Map) per-connection with `StreamableHTTPServerTransport`
- Filesystem operations are sandboxed to `WORKSPACE_DIR` (path traversal protection)
- Mistral `mistral-large-latest` is used for all AI operations (code gen, debug, design)
- Tools are grouped by category and registered via `registerXxxTools(server, workspaceDir)` pattern
- The MCP server is embedded inside the Express app at `/api/mcp` (no separate process)

## Tools Available (37 total)

**Filesystem (10):** read_file, write_file, edit_file, delete_file, copy_file, move_file, create_directory, list_directory, search_files, generate_tree

**Terminal (7):** run_command, run_npm_install, run_pnpm_install, run_pip_install, run_build, run_tests, kill_process

**Code Generation (9):** generate_code, generate_react_app, generate_nextjs_app, generate_express_backend, generate_fastapi_backend, generate_mobile_app, generate_prisma_schema, generate_dockerfile, generate_github_actions

**Debugging (8):** analyze_error, fix_code, analyze_build_error, fix_typescript_errors, fix_dependency_conflicts, code_review, refactor_code, explain_code

**Design (5):** suggest_design, extract_design_tokens, generate_component, analyze_design, generate_landing_page

**Project (5):** analyze_project, plan_architecture, generate_readme, scan_security, generate_tests

## User preferences

_Populate as needed_

## Gotchas

- Always run `pnpm --filter @workspace/api-spec run codegen` after OpenAPI spec changes
- MCP sessions are in-memory only — they reset on server restart
- The workspace dir defaults to `/tmp/mcp-workspace` which is ephemeral; set `MCP_WORKSPACE_DIR` to a persistent path for production use

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details



<!-- Claude Code
+ Playwright MCP
+ Firecrawl/WebClaw
+ Context7
+ PostgreSQL/Supabase MCP
+ Filesystem MCP
+ GitHub MCP
+ Figma MCP -->