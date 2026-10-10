// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// http.js -- the hosted MCP endpoint's streamable-HTTP transport. Each request
// gets its own server and a stateless web-standard transport that answers in
// JSON; the caller owns the session and the authentication.

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { HOSTED_OVERRIDES, HOSTED_TOOL_NAMES } from "./hosted-tools.js";
import { createServer } from "./server.js";

/**
 * Answers one MCP request.
 * @param {Request} request
 * @param {{session: Object, toolNames?: string[], overrides?: Object}} options
 * @returns {Promise<Response>}
 */
export async function handleMcpRequest(request, { session, toolNames = HOSTED_TOOL_NAMES, overrides = HOSTED_OVERRIDES }) {
  const server = createServer(session, { toolNames, overrides });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(request);
}
