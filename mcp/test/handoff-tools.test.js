// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// handoff-tools.test.js -- prepare_vat_return: the link decodes, with the steps the VAT page uses,
// into the JSON the page documents, and carries the figures derive_vat_return answers.

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createSession, openBook } from "../lib/book-tools.js";
import { prepareVatReturn, vatHandoffLink } from "../lib/handoff-tools.js";
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
  beforeEach(() => {
    previousBaseUrl = process.env.DIYA_SUBMIT_BASE_URL;
    process.env.DIYA_SUBMIT_BASE_URL = `${SITE}/`;
  });
  afterEach(() => {
    if (previousBaseUrl === undefined) delete process.env.DIYA_SUBMIT_BASE_URL;
    else process.env.DIYA_SUBMIT_BASE_URL = previousBaseUrl;
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
      expect(answer.link.startsWith(`${SITE}/hmrc/vat/submitVat.html#books=`)).toBe(true);
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
    const link = vatHandoffLink(handoff);
    expect(link.slice(link.indexOf("#") + "#books=".length)).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeFragment(link)).toEqual(handoff);
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
