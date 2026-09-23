<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Google Ads MCP Server Evaluation

## What It Is

Google's official Model Context Protocol server for Google Ads API: https://github.com/googleads/google-ads-mcp. A Python-based service that exposes three read-only tools to AI agents and LLMs: `list_accessible_customers`, `search` (GAQL queries), and `get_resource_metadata`.

## What It Adds Beyond The Two Scripts

The MCP server provides Protocol-level integration for Claude, ChatGPT, and Gemini agents to query Google Ads accounts through natural language. It handles GAQL parsing and execution in an MCP-standardized interface. The existing `ads-inventory.js`, `ads-sync.js`, `ads-report.js`, and `ads-forecast.js` scripts are direct API consumers written in Node.js, running on schedule or on-demand as CLI commands. The MCP server is an agent interface layer, not a replacement for scripted bulk operations or mutations.

## Running It Beside The Toml Door

**Credential cost**: Reuse the existing OAuth client (YouTube scope + adwords scope) and refresh token already in Secrets Manager; no new credentials.

**Hosting cost**: Separate Python process. Either local development overhead (`pipx` installation) or Google Cloud Run deployment (containerized). The current door uses Node.js and runs inline within existing scripts.

**Maintenance cost**: Dependency tracking and updates for the Python implementation and its client libraries. The MCP server delegates GAQL execution to the official Python client library (`google-ads-python-client`); Google maintains both. Node.js scripts use the same underlying Google Ads API and manage dependencies in the existing `package.json`. Separate language runtimes mean separate deployment pipelines, environment setup, and security scanning.

**Integration cost**: The MCP server is read-only (list, search, metadata). The existing door already supports read-only operations (`ads-inventory.js`, `ads-forecast.js`) and mutations (`ads-sync.js`). Running both requires coordinating two credential flows (OAuth tokens) and two processes for what is currently one script invocation.

## Decision

No. The MCP server adds complexity (Python runtime, separate process, dual language maintenance) for a narrower interface (read-only GAQL only). The existing Node.js scripts already cover both read (`ads-inventory.js`, `ads-report.js`, `ads-forecast.js`) and write (`ads-sync.js`) operations with a single OAuth credential pair reused across all of them. For Claude to query Ads performance data, run the existing read-only scripts directly; they are already available and faster than a protocol roundtrip to a separate process.

---

**Verified**: Google Ads API developer tokens were sunset on 2026-09-09. The API now ignores them; access levels are managed through the Google Cloud Console per project. Existing code with `developer-token` headers continues working; they will be rejected in a future major API version not yet named.

Sources:
- [Google Ads MCP Server Repository](https://github.com/googleads/google-ads-mcp)
- [Official Google Documentation](https://developers.google.com/google-ads/api/docs/developer-toolkit/mcp-server)
- [Google Ads API Developer Token Policy](https://developers.google.com/google-ads/api/docs/api-policy/developer-token)
