# PLAN: Issue #648 — MCP Server

> Source issue: https://github.com/antonycc/submit.diyaccounting.co.uk/issues/648
> Original body: (empty)
> Existing plans:
> - **`_developers/backlog/PLAN_MCP_SERVER.md`** (1475 lines — authoritative, detailed design)
> - `_developers/backlog/MCP Server Implementation Guide for DIY Accounting _ Claude.mhtml` (research export)
> - `_developers/backlog/MCP Server Implementation Guide.txt` (transcribed text)
> - Frontend stub: `web/public/mcp.html` ("Coming Soon" page per recon)

## Elaboration

**Model Context Protocol (MCP)** is Anthropic's open protocol for letting AI assistants (Claude Desktop, Claude Code, etc.) access external tools and data securely. An MCP server exposes:

- **Tools** — functions the AI can call (e.g. `submit_vat_return`, `list_obligations`).
- **Resources** — read-only data the AI can fetch (e.g. `user's active bundles`, `recent VAT submissions`).
- **Prompts** — reusable prompt templates.

For DIY Accounting, an MCP server lets an accountant's AI assistant (Claude Desktop plugged into our server) do things like:
> "Claude, check my client VRN 123456789's next VAT obligation and draft a return from the spreadsheets I'll attach."

Strategic value:
- First-mover MCP server in UK MTD space.
- Differentiator: small business owners can operate the product via their AI assistant.
- Ties into the spreadsheets brand (DIY Accounting already has calculation spreadsheets; MCP bridges them to HMRC).

The detailed design is already written (1475 lines). This issue is a delivery tracker.

## Likely source files to change

Per `PLAN_MCP_SERVER.md` (summary, likely structure):

- New top-level package `packages/mcp-server/` (or separate repo if we productise).
- Lambda `app/functions/mcp/mcpServer.js` — API endpoint running the MCP server inside Lambda behind API Gateway.
- Alternative: a standalone Fargate container if MCP session affinity matters.
- New `infra/main/java/.../stacks/McpStack.java` — hosts the MCP endpoint.
- Auth: **decided 2026-04-22 — OAuth device-code flow** (Q648.2). User types a short code from Claude Desktop into a browser tab hosted on `submit.diyaccounting.co.uk`, authorises, and the AI assistant polls the token endpoint.
  - Required endpoints on our side:
    - `POST /api/v1/mcp/device-code` — issue a `user_code` + `device_code` pair.
    - `GET /mcp/authorize?user_code=XXXX` — HTML page the user opens to confirm.
    - `POST /api/v1/mcp/token` — the MCP client polls with the `device_code` until the user authorises; returns a short-lived access token and a long-lived refresh token scoped to the user.
  - Scopes: `mcp:read`, `mcp:write`, `mcp:submit` (explicit for mutating tools).
- New `web/public/mcp/authorize.html` — the "Enter your code" + "Authorise [App]" consent page.
- Personal-API-token scheme is **out of scope for v1**; may be added later for headless/CI consumers.
- New `web/public/mcp.html` — replace "Coming Soon" with setup instructions, tool catalogue, scopes.
- Tool implementations — each MCP tool wraps an existing REST call:
  - `list_obligations(vrn)` → existing obligations Lambda
  - `view_return(vrn, periodKey)` → existing view-return Lambda
  - `submit_return(vrn, periodKey, boxes)` → existing submit Lambda **with explicit user confirmation** (critical: MCP should never autonomously submit)
- Secrets + token storage — new table `{env}-env-api-tokens` with hashed tokens.

## Likely tests to change/add

- Unit tests per tool.
- Integration test harness using Anthropic's MCP SDK to assert tool definitions and schemas match expectations.
- Behaviour test: generate API token, configure an MCP client stub, call `list_obligations`, assert a response.
- Security test: expired token rejected; revoked token rejected; mutating tool (submit_return) requires additional consent.

## Likely docs to change

- `_developers/backlog/PLAN_MCP_SERVER.md` — delivery progress.
- New `web/public/mcp.html` replacement with tool catalogue, setup guide, security notes.
- `privacy.html` — note that MCP clients on the user's machine access the user's data.
- `guide.html` — section on using DIY Accounting from Claude Desktop.

## Acceptance criteria

1. MCP server endpoint returns a valid tool catalogue per the MCP spec.
2. User can generate a personal API token in `/account/api-tokens`.
3. Configured Claude Desktop (or similar MCP client) can:
   - List obligations for a VRN.
   - View a submitted return.
   - Draft (but not auto-submit) a new return. Submission requires explicit user confirmation in a browser step.
4. All MCP calls are audited to the activity bus (Telegram + Slack fan-out).
5. Token revocation takes effect within 60 s.
6. Rate limit on MCP calls to protect HMRC quotas.
7. Security review — tokens hashed at rest, transport TLS, scopes enforced.

## Implementation approach

**Recommended — start read-only, MVP tool set.**

1. Stand up the MCP server Lambda with two tools: `list_obligations`, `view_return`.
2. Ship API token generation UI.
3. Smoke test end-to-end with Claude Desktop.
4. Add `submit_return` last, with an explicit "confirmation via web" flow (MCP generates a short URL the user opens to approve the submission).
5. Open to external testers (accountants) in a waitlist.

### Alternative A — defer until MCP spec stabilises
MCP is ~1 year old as of 2026; still evolving. Waiting means less re-work but misses the first-mover slot.

### Alternative B — ship as a container, not a Lambda
If the MCP protocol uses long-lived connections (streaming tools), Lambda isn't ideal. Fargate with a TLS endpoint behind an ALB is cleaner. Per current Anthropic SDK design, streaming support has been added — Lambda+API-Gateway streaming or Fargate both work. Pick later after a POC.

## Questions (for QUESTIONS.md)

- Q648.1: MCP host — Lambda (cheap, limits on streaming) or Fargate (more robust, higher baseline cost)?
- ~~Q648.2: Auth model~~ — **answered 2026-04-22: OAuth device-code flow.** Section above updated.
- Q648.3: Initial tool set — read-only tools only, or include `submit_return` from day 1 (with the web-confirmation step)?
- Q648.4: Productise as a standalone package / separate repo? Opens a contribution path.

## Good fit for Copilot?

Partial. MCP protocol handling and each tool implementation are bounded. The auth model and security review are human-only.
