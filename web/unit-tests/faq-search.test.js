// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { loadFaqs } from "../../scripts/build-static-content.mjs";
import { FAQSearch } from "../public/lib/faq-search.js";
import { FAQ_CATEGORY_ORDER, renderFaqGroups } from "../public/lib/faq-markdown.js";

const faqs = loadFaqs();
const search = new FAQSearch(faqs);
const ids = (query) => search.search(query).map((faq) => faq.id);

describe("FAQSearch with no query", () => {
  test("lists every question, grouped in the category order, by priority inside a category", () => {
    const all = search.search("");
    expect(all).toHaveLength(faqs.length);
    const ranks = all.map((faq) => FAQ_CATEGORY_ORDER.indexOf(faq.category));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(ranks).not.toContain(-1);
    for (const category of FAQ_CATEGORY_ORDER) {
      const priorities = all.filter((faq) => faq.category === category).map((faq) => faq.priority);
      expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
    }
  });

  test("the grouped markup holds every question once, collapsed, under its category heading", () => {
    const html = renderFaqGroups(faqs);
    for (const faq of faqs) expect(html.split(`data-id="${faq.id}"`)).toHaveLength(2);
    expect(html.match(/<section class="faq-group"/g)).toHaveLength(FAQ_CATEGORY_ORDER.length);
    expect(html.match(/class="faq-answer" hidden/g)).toHaveLength(faqs.length);
  });
});

describe("FAQSearch with a query", () => {
  test("'refund my xero payroll' returns no question", () => {
    expect(ids("refund my xero payroll")).toEqual([]);
  });

  test("'delete my account' returns the delete-account entry first and nothing unrelated", () => {
    const result = ids("delete my account");
    expect(result[0]).toBe("delete-account");
    expect(result).not.toContain("hmrc-connect-fail");
    expect(result).not.toContain("box-numbers");
  });

  test("'cancel' returns the cancel-subscription entry and not the HMRC connection entry", () => {
    const result = ids("cancel");
    expect(result[0]).toBe("cancel-subscription");
    expect(result).not.toContain("hmrc-connect-fail");
  });

  test("'Self Assessment' returns the Self Assessment entry first", () => {
    expect(ids("Self Assessment")[0]).toBe("self-assessment-itsa");
  });

  test("'Companies House' returns the Companies House entries", () => {
    const result = ids("Companies House");
    expect(result).toContain("companies-house-filings");
    expect(result).toContain("companies-house-accounts-filings");
  });

  test("the priority orders equal scores and adds nothing to a score", () => {
    const first = new FAQSearch([
      { id: "a", question: "Alpha thing", keywords: ["zeta"], category: "errors", priority: 9 },
      { id: "b", question: "Alpha thing", keywords: ["zeta"], category: "errors", priority: 2 },
    ]);
    expect(first.search("zeta").map((faq) => faq.id)).toEqual(["b", "a"]);
    const high = new FAQSearch([{ id: "c", question: "Unrelated words", keywords: ["other"], category: "errors", priority: 1 }]);
    expect(high.search("zeta")).toEqual([]);
  });
});
