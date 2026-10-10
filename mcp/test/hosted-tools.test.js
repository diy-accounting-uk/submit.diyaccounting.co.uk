// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, expect, it } from "vitest";

import { createSession } from "../lib/book-tools.js";
import { HOSTED_OVERRIDES, HOSTED_TOOL_NAMES } from "../lib/hosted-tools.js";
import { ITSA_TOOLS } from "../lib/itsa-tools.js";
import { createServer, TOOLS } from "../lib/server.js";

const NOT_HOSTED = [
  "sign_in",
  "sign_out",
  "save_book",
  "write_finance_package",
  "list_vat_obligations",
  "submit_vat_return",
  "invite_client",
  "client_authorisation_status",
  "run_for_clients",
];

describe("the hosted tool set", () => {
  it("names only registered tools, and leaves out exactly the tools that cannot run hosted", () => {
    const all = Object.keys({ ...TOOLS, ...ITSA_TOOLS });
    for (const name of HOSTED_TOOL_NAMES) expect(all).toContain(name);
    expect(all.filter((name) => !HOSTED_TOOL_NAMES.includes(name)).sort()).toEqual([...NOT_HOSTED].sort());
  });

  it("overrides open_book and derive_itsa_annual_submission only", () => {
    expect(Object.keys(HOSTED_OVERRIDES).sort()).toEqual(["derive_itsa_annual_submission", "open_book"]);
    expect(Object.keys(HOSTED_OVERRIDES.open_book.inputSchema)).toEqual(["bookId", "clientId"]);
    expect(Object.keys(HOSTED_OVERRIDES.derive_itsa_annual_submission.inputSchema)).toEqual(["taxYear"]);
  });

  it("refuses open_book without a bookId", async () => {
    await expect(HOSTED_OVERRIDES.open_book.handler(createSession(), {})).rejects.toThrow(/requires bookId/);
  });

  it("refuses the annual submission with no book loaded", async () => {
    await expect(HOSTED_OVERRIDES.derive_itsa_annual_submission.handler(createSession(), {})).rejects.toThrow(/No book is loaded/);
  });

  it("registers only the named tools on a server", () => {
    const server = createServer(createSession(), { toolNames: HOSTED_TOOL_NAMES, overrides: HOSTED_OVERRIDES });
    expect(Object.keys(server._registeredTools).sort()).toEqual([...HOSTED_TOOL_NAMES].sort());
  });

  it("refuses a tool name it does not know", () => {
    expect(() => createServer(createSession(), { toolNames: ["no_such_tool"] })).toThrow(/Unknown tool/);
  });
});
