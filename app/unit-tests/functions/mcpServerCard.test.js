// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/mcpServerCard.test.js
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

import { SERVER_INFO } from "../../../mcp/lib/server.js";

import { SCOPES } from "@app/functions/mcp/mcpOauth.js";

const readJson = (path) => JSON.parse(readFileSync(new URL(`../../../web/public/.well-known/${path}`, import.meta.url), "utf8"));

describe("the MCP Server Card and AI catalog", () => {
  const card = readJson("mcp/server-card.json");

  it("names the hosted endpoint and the discovery documents the OAuth facade serves", () => {
    expect(card.remotes).toEqual([{ type: "streamable-http", url: "https://submit.diyaccounting.co.uk/mcp" }]);
    expect(card.authentication.protectedResourceMetadata).toBe(
      "https://submit.diyaccounting.co.uk/.well-known/oauth-protected-resource/mcp",
    );
    expect(card.authentication.scopes).toEqual(SCOPES);
    expect(card.authentication.pkce).toBe("S256");
  });

  it("states the token binding by issuer and client id", () => {
    expect(card.authentication.tokenBinding).toMatch(/client_id/);
    expect(card.authentication.tokenBinding).toMatch(/issuer/);
  });

  it("names the same square 512 pixel icon as the server info, and the file exists and is a PNG of that size", () => {
    expect(card.icons).toEqual(SERVER_INFO.icons);
    const [icon] = card.icons;
    const file = readFileSync(new URL("../../../web/public/images/connector-icon.png", import.meta.url));
    expect(icon.src).toBe("https://submit.diyaccounting.co.uk/images/connector-icon.png");
    expect(file.subarray(1, 4).toString()).toBe("PNG");
    expect([file.readUInt32BE(16), file.readUInt32BE(20)]).toEqual([512, 512]);
  });

  it("is listed by the AI catalog at the path the site serves", () => {
    const catalog = readJson("ai-catalog.json");
    expect(catalog.entries.map((entry) => entry.url)).toContain("https://submit.diyaccounting.co.uk/.well-known/mcp/server-card.json");
  });
});
