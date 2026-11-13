// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  LookupError,
  accountsPagesFor,
  daysLeft,
  daysLeftWords,
  deadlineLine,
  errorMessage,
  fetchLookup,
  filingActions,
  isCompanyNumber,
  lookupUrl,
} from "../public/lib/company/deadline-rules.js";
import { loadArticles, renderArticlePages } from "../../scripts/build-filing-pages.mjs";

describe("days left", () => {
  test("counts whole days across a month end and a leap day", () => {
    expect(daysLeft("2027-03-01", "2027-02-27")).toBe(2);
    expect(daysLeft("2028-03-01", "2028-02-27")).toBe(3);
  });

  test("is zero on the due date and negative after it", () => {
    expect(daysLeft("2026-11-13", "2026-11-13")).toBe(0);
    expect(daysLeft("2026-11-12", "2026-11-13")).toBe(-1);
  });

  test("ignores a clock change because both dates are read as UTC midnight", () => {
    expect(daysLeft("2026-10-26", "2026-10-24")).toBe(2);
  });

  test("words say left, today, tomorrow-style singular and overdue", () => {
    expect(daysLeftWords(138)).toBe("138 days left");
    expect(daysLeftWords(1)).toBe("1 day left");
    expect(daysLeftWords(0)).toBe("due today");
    expect(daysLeftWords(-1)).toBe("overdue by 1 day");
    expect(daysLeftWords(-40)).toBe("overdue by 40 days");
  });

  test("a line gives the date and the days, and says when no date is held", () => {
    expect(deadlineLine("2027-03-31", "2026-11-13")).toBe("31 March 2027 (138 days left)");
    expect(deadlineLine("2026-10-31", "2026-11-13")).toBe("31 October 2026 (overdue by 13 days)");
    expect(deadlineLine(undefined, "2026-11-13")).toBe("No date is held for this company");
  });
});

describe("the request", () => {
  test("a number of 8 characters, or fewer digits, is a number lookup", () => {
    expect(isCompanyNumber("00000006")).toBe(true);
    expect(isCompanyNumber("SC123456")).toBe(true);
    expect(isCompanyNumber("6")).toBe(true);
    expect(lookupUrl(" SC123456 ")).toBe("/api/v1/public/company-deadlines?number=SC123456");
  });

  test("a name, even of 8 letters, is a search", () => {
    expect(isCompanyNumber("Barclays")).toBe(false);
    expect(lookupUrl("Barclays")).toBe("/api/v1/public/company-deadlines?q=Barclays");
    expect(lookupUrl("a & b ltd")).toBe("/api/v1/public/company-deadlines?q=a%20%26%20b%20ltd");
  });
});

describe("the filing for a company", () => {
  test("the type of the last accounts picks the accounts page", () => {
    expect(accountsPagesFor("micro-entity").map((page) => page.href)).toEqual(["micro-entity-accounts.html"]);
    expect(accountsPagesFor("small").map((page) => page.href)).toEqual(["small-company-accounts.html"]);
    expect(accountsPagesFor("dormant").map((page) => page.href)).toEqual(["dormant-company-accounts.html"]);
  });

  test("a type that does not say links all three accounts pages", () => {
    for (const type of [undefined, "full", "group"]) expect(accountsPagesFor(type)).toHaveLength(3);
  });

  test("an active company has an accounts filing and the confirmation statement", () => {
    const actions = filingActions({ companyStatus: "active", lastAccountsType: "micro-entity" });
    expect(actions.accounts).toHaveLength(1);
    expect(actions.confirmationStatement.href).toBe("confirmation-statement.html");
  });

  test("a dissolved or converted company has no filing action", () => {
    for (const companyStatus of ["dissolved", "converted-closed"]) {
      expect(filingActions({ companyStatus, lastAccountsType: "micro-entity" })).toEqual({ accounts: [], confirmationStatement: null });
    }
  });
});

describe("each API error", () => {
  const answer = (status, body = {}) => vi.fn().mockResolvedValue({ ok: status < 400, status, json: () => Promise.resolve(body) });

  test("resolves to the body on 200", async () => {
    await expect(fetchLookup("00000006", answer(200, { companyName: "X" }))).resolves.toEqual({ companyName: "X" });
  });

  test.each([
    [400, "Type a company number"],
    [404, "no company with that number"],
    [429, "Try again in a few minutes"],
    [502, "did not answer"],
    [500, "did not answer"],
  ])("rejects %s with its words", async (status, words) => {
    const failure = await fetchLookup("00000006", answer(status)).catch((error) => error);
    expect(failure).toBeInstanceOf(LookupError);
    expect(failure.status).toBe(status);
    expect(failure.message).toContain(words);
    expect(errorMessage(status)).toBe(failure.message);
  });

  test("rejects a network failure as status 0", async () => {
    const failure = await fetchLookup("00000006", vi.fn().mockRejectedValue(new TypeError("offline"))).catch((error) => error);
    expect(failure.status).toBe(0);
  });

  test("rejects an answer that is not JSON", async () => {
    const notJson = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError("<")) });
    await expect(fetchLookup("00000006", notJson)).rejects.toMatchObject({ status: 502 });
  });
});

describe("the page", () => {
  test("the committed page equals what the build script renders", async () => {
    const rendered = await renderArticlePages();
    expect(readFileSync("web/public/company-filing-deadlines.html", "utf8")).toBe(rendered.get("company-filing-deadlines.html"));
  });

  test("the page credits Companies House under the Open Government Licence and loads its script as a module", () => {
    const html = readFileSync("web/public/company-filing-deadlines.html", "utf8");
    expect(html).toContain("Source: Companies House.");
    expect(html).toContain("Open Government Licence v3.0");
    expect(html).toContain('<script type="module" src="lib/company/deadline-lookup.js"></script>');
    expect(html).toMatch(/<noscript\s*>/);
    expect(html.match(/<h1>/g)).toHaveLength(1);
  });

  test("is an article entry and appears in the sitemap and the Lighthouse config", () => {
    expect(loadArticles().map((article) => article.file)).toContain("company-filing-deadlines.html");
    expect(readFileSync("web/public/sitemap.xml", "utf8")).toContain("/company-filing-deadlines.html</loc>");
    expect(readFileSync("lighthouse.config.json", "utf8")).toContain('"/company-filing-deadlines.html"');
  });
});
