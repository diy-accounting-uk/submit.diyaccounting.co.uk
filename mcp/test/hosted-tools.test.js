// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, expect, it } from "vitest";

import { createSession } from "../lib/book-tools.js";
import { HOSTED_OVERRIDES, HOSTED_TOOL_NAMES, REVIEWER_GROUP, hostedInstructions, hostedToolNames } from "../lib/hosted-tools.js";
import { VAT_FILING_SENTENCE } from "../lib/handoff-tools.js";
import { handleMcpRequest } from "../lib/http.js";
import { ITSA_TOOLS } from "../lib/itsa-tools.js";
import { createServer, TOOLS } from "../lib/server.js";

const NOT_HOSTED = ["sign_in", "sign_out", "save_book", "write_finance_package"];

describe("the hosted tool set", () => {
  it("names only registered tools, and leaves out exactly the tools that cannot run hosted", () => {
    const all = Object.keys({ ...TOOLS, ...ITSA_TOOLS });
    for (const name of HOSTED_TOOL_NAMES) expect(all).toContain(name);
    expect(all.filter((name) => !HOSTED_TOOL_NAMES.includes(name)).sort()).toEqual([...NOT_HOSTED].sort());
  });

  it("overrides open_book, run_for_clients and the two derivations that write a file locally only", () => {
    expect(Object.keys(HOSTED_OVERRIDES).sort()).toEqual([
      "derive_company_tax_return",
      "derive_itsa_annual_submission",
      "open_book",
      "run_for_clients",
    ]);
    expect(Object.keys(HOSTED_OVERRIDES.derive_company_tax_return.inputSchema)).toEqual([]);
    expect(Object.keys(HOSTED_OVERRIDES.open_book.inputSchema)).toEqual(["bookId", "clientId"]);
    expect(Object.keys(HOSTED_OVERRIDES.derive_itsa_annual_submission.inputSchema)).toEqual(["taxYear"]);
  });

  it("gives every registered tool a title and all three hints, with the filing tools destructive and open-world", () => {
    const tables = { ...TOOLS, ...ITSA_TOOLS, ...HOSTED_OVERRIDES };
    for (const [name, tool] of Object.entries(tables)) {
      expect(tool.title, name).toMatch(/\S/);
      expect(Object.keys(tool.annotations ?? {}).sort(), name).toEqual(["destructiveHint", "openWorldHint", "readOnlyHint"]);
      for (const hint of Object.values(tool.annotations)) expect(typeof hint, name).toBe("boolean");
      expect(tool.annotations.readOnlyHint && tool.annotations.destructiveHint, name).toBe(false);
    }
    for (const name of Object.keys(tables).filter(
      (n) => /^submit_/.test(n) || ["invite_client", "run_for_clients", "sign_out", "save_book"].includes(n),
    )) {
      expect(tables[name].annotations.destructiveHint, name).toBe(true);
    }
    for (const name of Object.keys(tables).filter((n) =>
      /^(submit_|list_vat_(obligations|liabilities|payments|penalties)|get_vat_return|poll_submission)/.test(n),
    )) {
      expect(tables[name].annotations.openWorldHint, name).toBe(true);
    }
    for (const name of Object.keys(tables).filter((n) => /^(derive_|list_books|open_book)/.test(n))) {
      expect(tables[name].annotations.readOnlyHint, name).toBe(true);
    }
  });

  it("gives the four accounts tools an optional revision with its three texts and an optional receipt name on the hosted server", async () => {
    const listed = await handleMcpRequest(
      new Request("https://submit.diyaccounting.co.uk/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", "accept": "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
      { session: createSession(), toolNames: hostedToolNames("ci") },
    ).then((response) => response.json());
    const { tools } = listed.result;
    for (const name of [
      "render_micro_entity_accounts_sandbox",
      "submit_micro_entity_accounts_sandbox",
      "render_small_company_accounts_sandbox",
      "submit_small_company_accounts_sandbox",
    ]) {
      const schema = tools.find((tool) => tool.name === name).inputSchema;
      expect(Object.keys(schema.properties.revision.properties).sort(), name).toEqual([
        "amendments",
        "nonCompliance",
        "originalDateOfApproval",
        "revisesReceipt",
      ]);
      expect(schema.properties.revision.required.sort(), name).toEqual(["amendments", "nonCompliance", "originalDateOfApproval"]);
      expect(schema.required ?? [], name).not.toContain("revision");
    }
  });

  it("refuses the company tax return with no book loaded", async () => {
    await expect(HOSTED_OVERRIDES.derive_company_tax_return.handler(createSession(), {})).rejects.toThrow(/No book is loaded/);
  });

  it("refuses open_book without a bookId", async () => {
    await expect(HOSTED_OVERRIDES.open_book.handler(createSession(), {})).rejects.toThrow(/requires bookId/);
  });

  it("refuses the annual submission with no book loaded", async () => {
    await expect(HOSTED_OVERRIDES.derive_itsa_annual_submission.handler(createSession(), {})).rejects.toThrow(/No book is loaded/);
  });

  it("refuses to run the filesystem book tools for every client", async () => {
    for (const tool of ["open_book", "save_book"]) {
      await expect(HOSTED_OVERRIDES.run_for_clients.handler(createSession(), { tool, args: { path: "/etc" } })).rejects.toThrow(
        /does not support tool/,
      );
    }
    expect(HOSTED_OVERRIDES.run_for_clients.inputSchema.tool.options).not.toContain("open_book");
  });

  it("registers only the named tools on a server", () => {
    const server = createServer(createSession(), { toolNames: HOSTED_TOOL_NAMES, overrides: HOSTED_OVERRIDES });
    expect(Object.keys(server._registeredTools).sort()).toEqual([...HOSTED_TOOL_NAMES].sort());
  });

  it("refuses a tool name it does not know", () => {
    expect(() => createServer(createSession(), { toolNames: ["no_such_tool"] })).toThrow(/Unknown tool/);
  });

  it("offers every hosted tool outside prod", () => {
    for (const environmentName of ["ci", "simulator", "proxy", undefined]) {
      expect(hostedToolNames(environmentName)).toEqual(HOSTED_TOOL_NAMES);
    }
  });

  it("offers only the books, derivation, hand-off link and receipt tools in prod, none of which reach HMRC", () => {
    const prodNames = hostedToolNames("prod");
    expect(prodNames).toContain("prepare_vat_return");
    for (const hmrcTool of ["submit_vat_return", "list_vat_obligations", "get_vat_return", "request_hmrc_authorisation"]) {
      expect(prodNames).not.toContain(hmrcTool);
    }
    expect(prodNames).toEqual(expect.arrayContaining(["list_books", "open_book"]));
    expect(
      prodNames.filter((name) => /sandbox|itsa|uk_property|client|company|confirmation|accounts|poll_submission|move_book/.test(name)),
    ).toEqual([]);
    const server = createServer(createSession(), { toolNames: prodNames, overrides: HOSTED_OVERRIDES });
    expect(Object.keys(server._registeredTools).sort()).toEqual([...prodNames].sort());
  });

  it("gives a caller in the reviewer group prod's tool set in every environment", () => {
    for (const environmentName of ["ci", "simulator", undefined]) {
      expect(hostedToolNames(environmentName, [REVIEWER_GROUP])).toEqual(hostedToolNames("prod"));
      expect(hostedToolNames(environmentName, ["another-group"])).toEqual(HOSTED_TOOL_NAMES);
    }
  });

  it("lists prod's tools for the reviewer and answers every other tool as not found", async () => {
    const credentials = { accessToken: async () => "bearer", idToken: async () => null };
    const toolNames = hostedToolNames("ci", [REVIEWER_GROUP]);
    const call = (body) =>
      handleMcpRequest(
        new Request("https://submit.diyaccounting.co.uk/mcp", {
          method: "POST",
          headers: { "content-type": "application/json", "accept": "application/json, text/event-stream" },
          body: JSON.stringify(body),
        }),
        { session: createSession({ credentials }), toolNames },
      ).then((response) => response.json());

    const listed = await call({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(listed.result.tools.map((tool) => tool.name).sort()).toEqual([...hostedToolNames("prod")].sort());

    for (const name of HOSTED_TOOL_NAMES.filter((tool) => !toolNames.includes(tool))) {
      const answer = await call({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: {} } });
      const text = JSON.stringify(answer);
      expect(text, name).toMatch(/not found/i);
    }
  });

  describe("server instructions", () => {
    const initialize = (instructions) =>
      handleMcpRequest(
        new Request("https://submit.diyaccounting.co.uk/mcp", {
          method: "POST",
          headers: { "content-type": "application/json", "accept": "application/json, text/event-stream" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } },
          }),
        }),
        { session: createSession(), toolNames: hostedToolNames("prod"), instructions },
      ).then((response) => response.json());

    it("the initialize result for prod's tool set says the connector offers VAT tools only and cannot file accounts or pay", async () => {
      const { result } = await initialize(hostedInstructions("prod"));

      expect(result.instructions).toMatch(/VAT tools only/);
      expect(result.instructions).toMatch(/cannot file a VAT return, pay HMRC or anyone else, or file company accounts/);
    });

    it("the initialize result says how a return is filed and what to show from a derived return", async () => {
      const { result } = await initialize(hostedInstructions("prod"));

      expect(result.instructions).toContain("call prepare_vat_return");
      expect(result.instructions).toContain(VAT_FILING_SENTENCE);
      expect(result.instructions).toMatch(/After derive_vat_return, show the nine boxes and the largest lines behind boxes 1 and 4/);
    });

    it("the reviewer gets prod's instructions in every environment, and the wider tool set gets none", () => {
      for (const environmentName of ["ci", "simulator", undefined]) {
        expect(hostedInstructions(environmentName, [REVIEWER_GROUP])).toBe(hostedInstructions("prod"));
        expect(hostedInstructions(environmentName)).toBeUndefined();
      }
    });

    it("a server built with no instructions sends none", async () => {
      const { result } = await initialize(undefined);

      expect(result.instructions).toBeUndefined();
    });
  });
});
