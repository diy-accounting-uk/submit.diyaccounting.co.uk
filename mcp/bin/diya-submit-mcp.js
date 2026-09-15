#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// diya-submit-mcp.js -- the stdio surface of the submission MCP: the same
// server lib/server.js builds, connected to stdin and stdout. Point an MCP
// client at this command with no arguments.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createServer } from "../lib/server.js";

await createServer().connect(new StdioServerTransport());
