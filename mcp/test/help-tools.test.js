// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createSession } from "../lib/book-tools.js";
import { bookFormat, findHelp, MAX_MATCHES, queryTerms } from "../lib/help-tools.js";
import { HOSTED_OVERRIDES, hostedToolNames } from "../lib/hosted-tools.js";
import { handleMcpRequest } from "../lib/http.js";
import { TOOLS } from "../lib/server.js";

const index = JSON.parse(readFileSync(new URL("../lib/help-index.json", import.meta.url), "utf8"));

describe("find_help", () => {
  it("finds a Submit guide journey for a question about a filing, with its summary and address", () => {
    const { matches } = findHelp(createSession(), { query: "How do I submit a VAT return?" });
    expect(matches[0]).toEqual({
      source: "Submit guide",
      title: "How to submit a VAT return under MTD",
      summary: expect.stringMatching(/\S/),
      url: "https://submit.diyaccounting.co.uk/guide.html#submit-return",
    });
  });

  it("finds a diya-gl knowledge base article, with its address on the spreadsheets site", () => {
    const { matches } = findHelp(createSession(), { query: "accounting period over 12 months", source: "knowledge-base" });
    expect(matches[0]).toMatchObject({
      source: "diya-gl knowledge base",
      title: "Accounting Period Over 12 Months",
      url: "https://spreadsheets.diyaccounting.co.uk/articles/accounting-period-over12-months.html",
    });
    expect(matches.every((match) => match.source === "diya-gl knowledge base")).toBe(true);
  });

  it("finds a section of the MCP page by the heading's own address", () => {
    const { matches } = findHelp(createSession(), { query: "what do I need first", source: "guide" });
    expect(matches.map((match) => match.url)).toContain("https://submit.diyaccounting.co.uk/mcp.html#what-you-need");
  });

  it("answers five matches unless asked for another number, and never more than ten", () => {
    expect(findHelp(createSession(), { query: "VAT" }).matches).toHaveLength(5);
    expect(findHelp(createSession(), { query: "VAT", limit: 2 }).matches).toHaveLength(2);
    expect(findHelp(createSession(), { query: "VAT", limit: 50 }).matches).toHaveLength(MAX_MATCHES);
  });

  it("says where the guide and the knowledge base are when nothing matches", () => {
    const answer = findHelp(createSession(), { query: "zzqxv" });
    expect(answer.matches).toEqual([]);
    expect(answer.note).toContain("https://submit.diyaccounting.co.uk/guide.html");
    expect(answer.note).toContain("https://spreadsheets.diyaccounting.co.uk/knowledge-base.html");
  });

  it("refuses a question with no words to search for, and a source it does not know", () => {
    expect(() => findHelp(createSession(), { query: "how do I" })).toThrow(/needs a question/);
    expect(() => findHelp(createSession(), { query: "VAT", source: "elsewhere" })).toThrow(/guide, knowledge-base/);
  });

  it("drops the words that carry no meaning from a question", () => {
    expect(queryTerms("How do I file my Company Tax Return?")).toEqual(["file", "company", "tax", "return"]);
  });
});

describe("book_format", () => {
  it("answers the DIYA-GL book's two files, their fields and the published schemas", () => {
    const format = bookFormat(createSession(), {});
    expect(format.files.map((file) => file.name)).toEqual(["book.toml", "lines.jsonl"]);
    expect(format.bookSections.map((section) => section.name)).toEqual(expect.arrayContaining(["documentInfo", "entityInformation"]));
    expect(format.lineFields.map((field) => field.name)).toEqual(expect.arrayContaining(["entryNumber", "accountMainID", "amount"]));
    expect(format.schemas).toEqual([
      "https://spreadsheets.diyaccounting.co.uk/schema/diya-gl-book-v3.schema.json",
      "https://spreadsheets.diyaccounting.co.uk/schema/diya-gl-lines-v3.schema.json",
    ]);
  });

  it("answers the CT600 box map with its sections, and one section's boxes when asked", () => {
    const all = bookFormat(createSession(), { part: "ct600" });
    expect(all.version).toMatch(/CT600/);
    expect(all.boxes[0]).toMatchObject({ number: 1, label: "Company name", section: "Company information" });
    const narrowed = bookFormat(createSession(), { part: "ct600", section: "company information" });
    expect(narrowed.boxes.length).toBeGreaterThan(0);
    expect(narrowed.boxes.length).toBeLessThan(all.boxes.length);
    expect(narrowed.boxes.every((box) => box.section === "Company information")).toBe(true);
  });

  it("refuses a part or a CT600 section it does not know, naming the sections there are", () => {
    expect(() => bookFormat(createSession(), { part: "vat" })).toThrow(/"book" or "ct600"/);
    expect(() => bookFormat(createSession(), { part: "ct600", section: "nowhere" })).toThrow(/Company information/);
  });
});

describe("the help index", () => {
  it("holds the guide's journeys, the three pages' sections and the knowledge base's articles, each with a public address", () => {
    const sources = new Set(index.entries.map((entry) => entry.source));
    expect([...sources].sort()).toEqual(["Submit guide", "diya-gl knowledge base"]);
    for (const page of ["guide.html#", "mcp.html", "rates.html", "mtd-calendar.html"]) {
      expect(
        index.entries.some((entry) => entry.url.includes(page)),
        page,
      ).toBe(true);
    }
    expect(index.entries.filter((entry) => entry.source === "diya-gl knowledge base").length).toBeGreaterThan(100);
    for (const entry of index.entries) {
      expect(entry.url, entry.title).toMatch(/^https:\/\/(submit|spreadsheets)\.diyaccounting\.co\.uk\//);
      expect(entry.title, entry.url).toMatch(/\S/);
    }
  });

  it("never calls the person's records their books in a summary or title", () => {
    for (const entry of index.entries) expect(`${entry.title} ${entry.summary}`, entry.url).not.toMatch(/\byour books\b/i);
  });
});

describe("the two tools on the hosted connector", () => {
  it("lists and answers find_help and book_format on prod, read-only", async () => {
    const toolNames = hostedToolNames("prod");
    const call = (body) =>
      handleMcpRequest(
        new Request("https://submit.diyaccounting.co.uk/mcp", {
          method: "POST",
          headers: { "content-type": "application/json", "accept": "application/json, text/event-stream" },
          body: JSON.stringify(body),
        }),
        { session: createSession(), toolNames, overrides: HOSTED_OVERRIDES },
      ).then((response) => response.json());

    const listed = await call({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    const tools = Object.fromEntries(listed.result.tools.map((tool) => [tool.name, tool]));
    for (const name of ["find_help", "book_format"]) {
      expect(tools[name].annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: false });
      expect(tools[name].description).toBe(TOOLS[name].description);
    }

    const help = await call({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "find_help", arguments: { query: "submit a VAT return" } },
    });
    expect(help.result.structuredContent.matches[0].url).toBe("https://submit.diyaccounting.co.uk/guide.html#submit-return");

    const format = await call({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "book_format", arguments: {} } });
    expect(format.result.structuredContent.files.map((file) => file.name)).toEqual(["book.toml", "lines.jsonl"]);
  });
});
