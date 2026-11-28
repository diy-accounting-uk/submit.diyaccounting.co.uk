// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// handoff-tools.test.js -- prepare_vat_return and the accounts and Company Tax Return links: each link
// decodes, with the steps the pages use, into the JSON the page documents, and carries the figures its
// derive tool answers.

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createSession, openBook } from "../lib/book-tools.js";
import {
  ACCOUNTS_FILING_SENTENCE,
  COMPANY_TAX_RETURN_FILING_SENTENCE,
  handoffLink,
  prepareCompanyTaxReturn,
  prepareMicroEntityAccounts,
  prepareSmallCompanyAccounts,
  prepareVatReturn,
  VAT_FILING_SENTENCE,
} from "../lib/handoff-tools.js";
import { deriveCompanyTaxReturn, deriveMicroEntityAccounts, deriveSmallCompanyAccounts } from "../lib/accounts-tools.js";
import { deriveVatReturn } from "../lib/vat-tools.js";
import { createServer, TOOLS } from "../lib/server.js";
import { HOSTED_TOOL_NAMES, hostedToolNames } from "../lib/hosted-tools.js";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures");
const SITE = "https://ci-example.submit.diyaccounting.co.uk";

// The page's own decoder, web/public/lib/auth-url-builder.js, step for step.
function decodeFragment(link) {
  const hash = new URL(link).hash;
  expect(hash.startsWith("#books=")).toBe(true);
  const encoded = hash.slice("#books=".length);
  expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, (character) => character.charCodeAt(0))));
}

describe("prepare_vat_return", () => {
  let previousBaseUrl;
  let previousPublicBaseUrl;
  beforeEach(() => {
    previousBaseUrl = process.env.DIYA_SUBMIT_BASE_URL;
    previousPublicBaseUrl = process.env.DIY_SUBMIT_BASE_URL;
    process.env.DIYA_SUBMIT_BASE_URL = "https://deployment-host.submit.diyaccounting.co.uk/";
    process.env.DIY_SUBMIT_BASE_URL = `${SITE}/`;
  });
  afterEach(() => {
    if (previousBaseUrl === undefined) delete process.env.DIYA_SUBMIT_BASE_URL;
    else process.env.DIYA_SUBMIT_BASE_URL = previousBaseUrl;
    if (previousPublicBaseUrl === undefined) delete process.env.DIY_SUBMIT_BASE_URL;
    else process.env.DIY_SUBMIT_BASE_URL = previousPublicBaseUrl;
  });

  describe("over the BrickWork Pro book", () => {
    let session;
    beforeAll(async () => {
      session = createSession();
      await openBook(session, { path: join(FIXTURES, "brickwork-pro-ltd-vat") });
    });

    it("answers a link to the VAT form whose fragment decodes to the page's JSON with the derived figures", async () => {
      const derived = await deriveVatReturn(session, { periodEnd: "2025-06-30" });
      const answer = await prepareVatReturn(session, { periodEnd: "2025-06-30" });
      expect(answer.link.startsWith(`${SITE}/hmrc/vat/submitVat.html?utm_source=unknown&utm_medium=mcp#books=`)).toBe(true);
      expect(new URL(answer.link).origin).toBe(SITE);
      const decoded = decodeFragment(answer.link);
      expect(Object.keys(decoded).sort()).toEqual(["figures", "kind", "packageVersion", "period", "sourceFileName"]);
      expect(decoded.kind).toBe("vat");
      expect(decoded.sourceFileName).toBe("brickwork-pro-ltd-vat");
      expect(decoded.packageVersion).toMatch(/\S/);
      expect(decoded.period).toEqual({ periodStart: "2025-04-01", periodEnd: "2025-06-30" });
      expect(decoded.figures).toEqual({
        vatDueSales: derived.hmrc.vatDueSales,
        vatDueAcquisitions: derived.hmrc.vatDueAcquisitions,
        vatReclaimedCurrPeriod: derived.hmrc.vatReclaimedCurrPeriod,
        totalValueSalesExVAT: derived.hmrc.totalValueSalesExVAT,
        totalValuePurchasesExVAT: derived.hmrc.totalValuePurchasesExVAT,
        totalValueGoodsSuppliedExVAT: derived.hmrc.totalValueGoodsSuppliedExVAT,
        totalAcquisitionsExVAT: derived.hmrc.totalAcquisitionsExVAT,
      });
      expect(answer.figures).toEqual(decoded.figures);
      expect(answer.instruction).toMatch(/check the figures.*declaration.*file the return there.*Nothing has been filed/);
      expect(answer.instruction).toBe(VAT_FILING_SENTENCE);
      expect(answer.instruction).toMatch(/tick the declaration and file the return there in your browser/);
    });

    it("refuses with no book loaded", async () => {
      await expect(prepareVatReturn(createSession(), { periodEnd: "2025-06-30" })).rejects.toThrow(/No book is loaded/);
    });
  });

  it("carries pence and a figure of 0 through the link unchanged", () => {
    const handoff = {
      kind: "vat",
      sourceFileName: "Café Ltd.json",
      packageVersion: "1.2.3",
      period: { periodStart: "2026-01-01", periodEnd: "2026-03-31" },
      figures: {
        vatDueSales: 1234.56,
        vatDueAcquisitions: 0,
        vatReclaimedCurrPeriod: 0.07,
        totalValueSalesExVAT: 6172,
        totalValuePurchasesExVAT: 0,
        totalValueGoodsSuppliedExVAT: 0,
        totalAcquisitionsExVAT: 0,
      },
    };
    const link = handoffLink("/hmrc/vat/submitVat.html", handoff, "claude");
    expect(link.slice(link.indexOf("#") + "#books=".length)).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeFragment(link)).toEqual(handoff);
  });

  it("names the assistant as the campaign source in the query before the fragment", async () => {
    const session = createSession({ client: "chatgpt" });
    await openBook(session, { path: join(FIXTURES, "brickwork-pro-ltd-vat") });
    const url = new URL((await prepareVatReturn(session, { periodEnd: "2025-06-30" })).link);
    expect(url.pathname).toBe("/hmrc/vat/submitVat.html");
    expect(url.searchParams.get("utm_source")).toBe("chatgpt");
    expect(url.searchParams.get("utm_medium")).toBe("mcp");
    expect(url.hash.startsWith("#books=")).toBe(true);
  });

  it("is registered in every hosted environment, prod included", () => {
    expect(HOSTED_TOOL_NAMES).toContain("prepare_vat_return");
    expect(hostedToolNames("ci")).toContain("prepare_vat_return");
    expect(hostedToolNames("prod")).toContain("prepare_vat_return");
  });

  it("is a read tool that reaches no outside service", () => {
    expect(TOOLS.prepare_vat_return.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, openWorldHint: false });
    expect(TOOLS.prepare_vat_return.description).toMatch(/never files anything/);
    expect(createServer(createSession(), { toolNames: ["prepare_vat_return"] })).toBeTruthy();
  });
});

describe("the accounts and Company Tax Return links", () => {
  let previousPublicBaseUrl;
  let session;
  beforeAll(async () => {
    session = createSession({ client: "claude" });
    await openBook(session, { path: join(FIXTURES, "precision-code-ltd-full") });
  });
  beforeEach(() => {
    previousPublicBaseUrl = process.env.DIY_SUBMIT_BASE_URL;
    process.env.DIY_SUBMIT_BASE_URL = `${SITE}/`;
  });
  afterEach(() => {
    if (previousPublicBaseUrl === undefined) delete process.env.DIY_SUBMIT_BASE_URL;
    else process.env.DIY_SUBMIT_BASE_URL = previousPublicBaseUrl;
  });

  it("prepare_micro_entity_accounts links to the micro-entity form with the figures that form fills", async () => {
    const derived = await deriveMicroEntityAccounts(session);
    const answer = await prepareMicroEntityAccounts(session);
    const url = new URL(answer.link);
    expect(url.origin + url.pathname).toBe(`${SITE}/companies-house/fileMicroEntityAccounts.html`);
    expect(url.searchParams.get("utm_source")).toBe("claude");
    const decoded = decodeFragment(answer.link);
    expect(decoded.kind).toBe("micro-entity-accounts");
    expect(decoded.sourceFileName).toBe("precision-code-ltd-full");
    expect(decoded.period).toEqual({ periodStart: derived.periodStart, periodEnd: derived.periodEnd });
    expect(decoded.figures.companyNumber).toBe(derived.companyNumber);
    expect(decoded.figures.balanceSheet).toEqual(derived.balanceSheet);
    expect(decoded.figures.profitAndLoss).toEqual(derived.profitAndLoss);
    expect(decoded.figures.averageNumberOfEmployees).toBe(derived.averageNumberOfEmployees);
    expect(decoded.figures).not.toHaveProperty("derivation");
    expect(decoded.figures).not.toHaveProperty("notes");
    expect(answer.companyNumber).toBe(derived.companyNumber);
    expect(answer.instruction).toBe(ACCOUNTS_FILING_SENTENCE);
  });

  it("prepare_small_company_accounts links to the small company form with both formats, the balance sheet and the note", async () => {
    const derived = await deriveSmallCompanyAccounts(session);
    const answer = await prepareSmallCompanyAccounts(session);
    expect(new URL(answer.link).pathname).toBe("/companies-house/fileSmallCompanyAccounts.html");
    const decoded = decodeFragment(answer.link);
    expect(decoded.kind).toBe("small-company-accounts");
    expect(decoded.figures.profitAndLoss).toEqual(derived.profitAndLoss);
    expect(decoded.figures.profitAndLossFormat2).toEqual(derived.profitAndLossFormat2);
    expect(decoded.figures.balanceSheet).toEqual(derived.balanceSheet);
    expect(decoded.figures.fixedAssetNote).toEqual(derived.fixedAssetNote);
    expect(decoded.figures.directors).toEqual(derived.directors);
    expect(decoded.figures).not.toHaveProperty("derivation");
    expect(answer.instruction).toBe(ACCOUNTS_FILING_SENTENCE);
  });

  it("prepare_company_tax_return links to the CT600 form with the answer derive_company_tax_return gives", async () => {
    const derived = await deriveCompanyTaxReturn(session, {});
    const answer = await prepareCompanyTaxReturn(session);
    expect(new URL(answer.link).pathname).toBe("/companies-house/fileCompanyTaxReturn.html");
    expect(decodeFragment(answer.link)).toEqual(derived);
    expect(answer.period).toEqual(derived.period);
    expect(answer.instruction).toBe(COMPANY_TAX_RETURN_FILING_SENTENCE);
  });

  it("keeps each link inside the page's 32768-character limit on the fragment", async () => {
    for (const prepare of [prepareMicroEntityAccounts, prepareSmallCompanyAccounts, prepareCompanyTaxReturn]) {
      const { link } = await prepare(session);
      expect(link.slice(link.indexOf("#books=") + "#books=".length).length).toBeLessThan(32768);
    }
  });

  it("refuses each link with no book loaded", async () => {
    for (const prepare of [prepareMicroEntityAccounts, prepareSmallCompanyAccounts, prepareCompanyTaxReturn]) {
      await expect(prepare(createSession())).rejects.toThrow(/No book is loaded/);
    }
  });
});
