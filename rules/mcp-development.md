# MCP Development Standards

## Single MCP Service

All MCP tools for Groupon IQ **must** live in the canonical service:

```text
apps/encore-ts/services/_mcp/groupon-iq-mcp/
```

Do **not** create new Encore services, `encore.service.ts` registrations, or separate MCP server implementations. If you need MCP-accessible functionality, add a tool to this service.

---

## Adding a tool

1. **Create** `tools/<domain>/<toolName>.tool.ts` exporting a `register<Name>Tool(server, context: ToolContext)` function. Each domain (e.g., `reports`, `incentives`, `user`) has its own folder. One file per tool. No `index.ts` barrel files.
2. **Register** it in `tools/_tool_registry.ts` by adding an import and entry to `TOOL_REGISTRY`.
3. **Set `requiredRoles`** on the registry entry if the tool requires specific IQ roles. Omit for tools available to all authenticated users.
4. **Use** `buildSuccessResponse` / `buildErrorResponse` from `utils/response.utils.ts`.
5. **Validate** all parameters with Zod schemas and add `.describe()` to every field.
6. **(Optional)** Shared code within a domain goes in `tools/<domain>/_non_tools/`:
   - `_non_tools/<domain>.interfaces.ts` -- domain-specific types
   - `_non_tools/<domain>.constants.ts` -- domain constants and type literals
   - `_non_tools/<domain>.utils.ts` -- shared validation, builders, helpers
   - The domain folder root contains only `*.tool.ts` files.

Full walkthrough with examples: `groupon-iq-mcp/README.md`.

---

## Tool function signature

Every tool registration function must follow this signature:

```typescript
export function register<Name>Tool(server: McpServer, context: ToolContext): void
```

- `ToolContext.authenticatedUser` — the validated IQ user (ID, name, email, roles).
- `ToolContext.externalTokens` — tokens from `x-ext-<name>` request headers for external service credentials.

---

## Authentication and authorization

| Layer | Mechanism | Where |
|-------|-----------|-------|
| **Identity** | `g-api-key` header → IQ API token validation | `mcpAuth.service.ts` |
| **Tool visibility** | `requiredRoles` on `ToolDefinition` | `tools/_tool_registry.ts` |
| **External credentials** | `x-ext-<name>` headers → `context.externalTokens` | `mcpMessagesPost.controller.ts` |

- The `g-api-key` token determines **who** the user is and **what roles** they hold.
- `requiredRoles` determines **which tools** the user can see and invoke.
- External tokens are **transport credentials** for calling legacy or third-party APIs from within a tool. They do not affect authorization decisions inside IQ.

---

## Naming conventions

| Item | Convention | Example |
|------|-----------|---------|
| Tool file | `<domain>/<toolName>.tool.ts` | `incentives/getIncentiveDetails.tool.ts` |
| Supporting code | `<domain>/_non_tools/<domain>.<type>.ts` | `incentives/_non_tools/incentives.utils.ts` |
| Tool name (MCP) | `snake_case` | `get_incentive` |
| Register function | `register<PascalCase>Tool` | `registerGetIncentiveTool` |
| Required roles | `UPPER_SNAKE_CASE` | `INCENTIVE_ADMIN` |

---

## What NOT to do

- **Do not** create a new `encore.service.ts` for MCP functionality.
- **Do not** implement custom auth flows — use the existing `g-api-key` validation and role gating.
- **Do not** construct custom response shapes — use `buildSuccessResponse` / `buildErrorResponse`.
- **Do not** log tokens, API keys, or secrets at any log level.
- **Do not** let unhandled exceptions propagate from tool handlers — catch and return `buildErrorResponse`.
