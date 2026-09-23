// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// mail-invoices.test.js -- invoiceLinesForPeriod over three recorded, redacted
// mailbox documents (an AWS billing statement, a Google Cloud invoice, and an
// AWS invoice email whose total sits only in its PDF attachment's extracted
// text), with the corpus CLI replaced by a function returning the fixtures
// instead of shelling out to a live index.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { validateLines } from "@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-schema.js";

import { findWorkspaceRoot, invoiceLinesForPeriod } from "../lib/finance/mail-invoices.js";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures", "finance");

function readFixture(name) {
  return JSON.parse(readFileSync(resolve(FIXTURES, name), "utf8"));
}

const AWS_FIXTURE = readFixture("mail-invoices-aws.json");
const GOOGLE_CLOUD_FIXTURE = readFixture("mail-invoices-google-cloud.json");
const AWS_PDF_TOTAL_FIXTURE = readFixture("mail-invoices-aws-pdf-total.json");

function fakeRunCorpus(fixturesBySupplier) {
  const docsByPath = new Map();
  for (const fixture of Object.values(fixturesBySupplier)) {
    docsByPath.set(fixture.doc.path, fixture.doc);
    if (fixture["noise-doc"]) docsByPath.set(fixture["noise-doc"].path, fixture["noise-doc"]);
  }

  return async (args) => {
    const command = args[0];
    if (command === "search") {
      const supplierName = args.at(-1);
      const fixture = fixturesBySupplier[supplierName];
      if (!fixture) throw new Error(`no recorded search fixture for "${supplierName}"`);
      return fixture.search;
    }
    if (command === "doc") {
      const path = args.at(-1);
      const doc = docsByPath.get(path);
      if (!doc) throw new Error(`no recorded doc fixture for "${path}"`);
      return doc;
    }
    throw new Error(`unexpected corpus command "${command}"`);
  };
}

const CLOUD_HOSTING_ACCOUNT = { accountMainID: "5002", accountMainDescription: "Cloud hosting" };

describe("invoiceLinesForPeriod", () => {
  it("emits a purchases invoice line from a recorded AWS billing statement, and skips a hit with no total", async () => {
    const lines = await invoiceLinesForPeriod(
      { from: "2026-09-01", to: "2026-09-30", suppliers: [{ name: "Amazon Web Services", taxCode: "OS", ...CLOUD_HOSTING_ACCOUNT }] },
      { runCorpus: fakeRunCorpus({ "Amazon Web Services": AWS_FIXTURE }) },
    );

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      sourceJournalID: "purchases",
      documentType: "invoice",
      postingDate: "2026-09-02",
      documentDate: "2026-09-02",
      accountMainID: "5002",
      amount: 84,
      amountCurrency: "USD",
      taxCode: "OS",
      detailComment: "Amazon Web Services",
    });
    expect(lines[0]).not.toHaveProperty("documentReference");
  });

  it("emits a purchases invoice line from an AWS invoice email whose total sits only in its PDF attachment's extracted text", async () => {
    const lines = await invoiceLinesForPeriod(
      { from: "2026-06-01", to: "2026-06-30", suppliers: [{ name: "Amazon Web Services", taxCode: "OS", ...CLOUD_HOSTING_ACCOUNT }] },
      { runCorpus: fakeRunCorpus({ "Amazon Web Services": AWS_PDF_TOTAL_FIXTURE }) },
    );

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      sourceJournalID: "purchases",
      documentType: "invoice",
      postingDate: "2026-06-02",
      documentDate: "2026-06-02",
      accountMainID: "5002",
      amount: 123.45,
      amountCurrency: "EUR",
      taxCode: "OS",
      documentReference: "EUINGB26-000001",
      detailComment: "Amazon Web Services",
    });
  });

  it("emits a purchases invoice line from a recorded Google Cloud invoice, with its invoice number as the reference", async () => {
    const lines = await invoiceLinesForPeriod(
      { from: "2026-03-01", to: "2026-03-31", suppliers: [{ name: "Google Cloud EMEA Limited", taxCode: "OS", ...CLOUD_HOSTING_ACCOUNT }] },
      { runCorpus: fakeRunCorpus({ "Google Cloud EMEA Limited": GOOGLE_CLOUD_FIXTURE }) },
    );

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      sourceJournalID: "purchases",
      documentType: "invoice",
      postingDate: "2026-03-01",
      amount: 196,
      amountCurrency: "GBP",
      taxCode: "OS",
      documentReference: "5450054252",
    });
  });

  it("emits lines that validate against the diya-gl lines schema", async () => {
    const runCorpus = fakeRunCorpus({
      "Amazon Web Services": AWS_FIXTURE,
      "Google Cloud EMEA Limited": GOOGLE_CLOUD_FIXTURE,
    });
    const lines = await invoiceLinesForPeriod(
      {
        from: "2026-01-01",
        to: "2026-12-31",
        suppliers: [
          { name: "Amazon Web Services", taxCode: "OS", ...CLOUD_HOSTING_ACCOUNT },
          { name: "Google Cloud EMEA Limited", taxCode: "OS", ...CLOUD_HOSTING_ACCOUNT },
        ],
      },
      { runCorpus },
    );

    const book = { accounts: { purchases: { 5002: { accountMainDescription: "Cloud hosting" } } } };
    const result = validateLines(lines, book);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("throws rather than search with no suppliers configured", async () => {
    await expect(invoiceLinesForPeriod({ from: "2026-01-01", to: "2026-01-31", suppliers: [] })).rejects.toThrow(/supplier/);
  });
});

describe("findWorkspaceRoot", () => {
  const existsOnly = (paths) => (path) => paths.has(path);

  it("finds the workspace root from a main checkout path", () => {
    const workspaceRoot = "/ws/diy-accounting-limited";
    const startPath = `${workspaceRoot}/submit.diyaccounting.co.uk/mcp/lib/finance`;
    const exists = existsOnly(new Set([`${workspaceRoot}/index/corpus.toml`]));

    expect(findWorkspaceRoot(startPath, "diy-accounting-limited", exists)).toBe(workspaceRoot);
  });

  it("finds the workspace root from a worktree path", () => {
    const workspaceRoot = "/ws/diy-accounting-limited";
    const startPath = `${workspaceRoot}/submit.diyaccounting.co.uk/.claude/worktrees/agent-af0ba2f/mcp/lib/finance`;
    const exists = existsOnly(new Set([`${workspaceRoot}/index/corpus.toml`]));

    expect(findWorkspaceRoot(startPath, "diy-accounting-limited", exists)).toBe(workspaceRoot);
  });

  it("throws when no directory of the configured name is found within the cap", () => {
    const startPath = "/home/runner/work/submit.diyaccounting.co.uk/submit.diyaccounting.co.uk/mcp/lib/finance";
    const exists = existsOnly(new Set());

    expect(() => findWorkspaceRoot(startPath, "diy-accounting-limited", exists)).toThrow(
      /no "diy-accounting-limited" workspace directory.*8 levels above ".*mcp\/lib\/finance"/,
    );
  });

  it("throws when the matching directory has no index/corpus.toml beside it", () => {
    const startPath = "/opt/diy-accounting-limited/other-project/mcp/lib/finance";
    const exists = existsOnly(new Set());

    expect(() => findWorkspaceRoot(startPath, "diy-accounting-limited", exists)).toThrow(/diy-accounting-limited/);
  });
});
