// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import { BOOK_READ_TOOLS } from "../lib/book-read-tools.js";
import { createSession, openBook } from "../lib/book-tools.js";
import { HOSTED_OVERRIDES, HOSTED_TOOL_NAMES, hostedToolNames, REVIEWER_GROUP } from "../lib/hosted-tools.js";
import { createServer } from "../lib/server.js";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");
const READ_TOOLS = ["report", "trial_balance", "checks", "lines", "chart", "book"];

describe("the DIYA-GL book read tools", () => {
  let session;

  beforeAll(async () => {
    session = createSession();
    await openBook(session, { path: join(FIXTURES, "precision-code-ltd-full") });
  });

  it("are the six read tools, each read-only, not destructive and closed to the outside world", () => {
    expect(Object.keys(BOOK_READ_TOOLS).sort()).toEqual([...READ_TOOLS].sort());
    for (const [name, tool] of Object.entries(BOOK_READ_TOOLS)) {
      expect(tool.annotations, name).toEqual({ readOnlyHint: true, destructiveHint: false, openWorldHint: false });
    }
  });

  it.each(READ_TOOLS)("%s refuses when no DIYA-GL book is open, naming open_book", async (name) => {
    await expect(async () => BOOK_READ_TOOLS[name].handler(createSession(), {})).rejects.toThrow(/Call open_book first/);
  });

  it("report answers the open book's figures and its book checks", async () => {
    const answer = await BOOK_READ_TOOLS.report.handler(session, {});
    expect(answer.report.values.length).toBeGreaterThan(0);
    expect(answer.bookChecks.summary).toBeDefined();
  });

  it("report gives entryNumbers to the figures named only", async () => {
    const key = "section/profit-loss-account/sales-turnover";
    const answer = await BOOK_READ_TOOLS.report.handler(session, { entryNumbers: [key] });
    const withNumbers = answer.report.values.filter((entry) => entry.entryNumbers);
    expect(withNumbers.map((entry) => entry.key)).toEqual([key]);
  });

  it("trial_balance answers equal debit and credit totals for a company's year", async () => {
    const answer = await BOOK_READ_TOOLS.trial_balance.handler(session, {});
    expect(JSON.stringify(answer)).toMatch(/debit/i);
    const totals = answer.totals;
    expect(totals.debit).toBe(totals.credit);
  });

  it("checks answers each check's verdict and the summary", async () => {
    const answer = await BOOK_READ_TOOLS.checks.handler(session, {});
    expect(answer.summary).toBeDefined();
    expect(answer.checks.length).toBeGreaterThan(0);
    expect(answer.checks.every((check) => ["pass", "warn", "fail"].includes(check.verdict))).toBe(true);
  });

  it("lines filters by journal and groups by customer with a total", async () => {
    const answer = await BOOK_READ_TOOLS.lines.handler(session, { journal: "sales", groupBy: "detailComment", top: 3 });
    expect(answer.groups.length).toBeLessThanOrEqual(3);
    expect(answer.groups.length).toBeGreaterThan(0);
  });

  it("chart answers the accounts with their line counts", async () => {
    const answer = await BOOK_READ_TOOLS.chart.handler(session, {});
    expect(answer.product).toBe("ltd");
    expect(answer.accounts.length).toBeGreaterThan(0);
  });

  it("book answers the product and the accounting period", async () => {
    const answer = await BOOK_READ_TOOLS.book.handler(session, {});
    expect(JSON.stringify(answer)).toContain("ltd");
  });

  it("take no book or lines in a call", () => {
    for (const [name, tool] of Object.entries(BOOK_READ_TOOLS)) {
      expect(Object.keys(tool.inputSchema), name).not.toContain("book");
      expect(Object.keys(tool.inputSchema), name).not.toContain("lines");
    }
  });

  it("are offered by the hosted connector in every environment, prod and the reviewer's set included", () => {
    for (const name of READ_TOOLS) {
      expect(HOSTED_TOOL_NAMES, name).toContain(name);
      expect(hostedToolNames("prod"), name).toContain(name);
      expect(hostedToolNames("ci", [REVIEWER_GROUP]), name).toContain(name);
    }
  });

  it("register on the hosted server outside prod", () => {
    const server = createServer(createSession(), { toolNames: hostedToolNames("ci"), overrides: HOSTED_OVERRIDES });
    for (const name of READ_TOOLS) expect(Object.keys(server._registeredTools), name).toContain(name);
  });
});
