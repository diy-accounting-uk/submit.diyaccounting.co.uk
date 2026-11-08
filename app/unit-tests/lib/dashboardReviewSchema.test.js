// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { tabAnswerSchema, figuresBlockSchema, safeText } from "@app/lib/dashboardReviewSchema.js";

const tags = [
  { tag: "fault", list: "improvement" },
  { tag: "movement", list: "observation" },
];
const schema = tabAnswerSchema({ tabId: "main", imageCount: 2, tags });

function answer() {
  return {
    tabId: "main",
    injectionSuspected: false,
    images: [
      { image: 1, verdict: "ok" },
      { image: 2, verdict: "finding" },
    ],
    findings: [
      {
        image: 2,
        list: "observation",
        tag: "movement",
        finding: "Paid subscribers fell.",
        evidence: "12 to 9",
        change: "Look at the checkout.",
      },
      {
        image: 2,
        list: "improvement",
        tag: "fault",
        finding: "The line is flat.",
        evidence: "floor of the axis",
        change: "Rescale the axis.",
      },
    ],
    proposedRows: [{ image: 2, prefix: "MKT", title: "Check the checkout", action: "Read the funnel." }],
  };
}

const forbidden = {
  "a link": "see https://example.com now",
  "a www host": "see www.example.com",
  "an address": "write to a@b.co",
  "angle brackets": "a <b>tag</b>",
  "square brackets": "a [link](x)",
  "a backtick": "a `span`",
  "a line break": "two\nlines",
  "a hash": "issuer 0123456789abcdef",
  "a pass code": "tiger-happy-mountain-silver",
};

describe("dashboardReviewSchema tabAnswerSchema", () => {
  it("accepts a full answer", () => {
    expect(schema.safeParse(answer()).success).toBe(true);
  });

  it("accepts an answer with no findings", () => {
    const empty = { ...answer(), findings: [], proposedRows: [] };
    expect(schema.safeParse(empty).success).toBe(true);
  });

  it("rejects an extra key at each level", () => {
    for (const mutate of [
      (a) => (a.extra = 1),
      (a) => (a.images[0].extra = 1),
      (a) => (a.findings[0].extra = 1),
      (a) => (a.proposedRows[0].extra = 1),
    ]) {
      const a = answer();
      mutate(a);
      expect(schema.safeParse(a).success).toBe(false);
    }
  });

  it("rejects another tab id", () => {
    expect(schema.safeParse({ ...answer(), tabId: "ops" }).success).toBe(false);
  });

  it("rejects an image index out of range", () => {
    const a = answer();
    a.findings[0].image = 3;
    expect(schema.safeParse(a).success).toBe(false);
    const b = answer();
    b.images[1].image = 0;
    expect(schema.safeParse(b).success).toBe(false);
  });

  it("rejects a missing image and a repeated image", () => {
    const missing = answer();
    missing.images.pop();
    expect(schema.safeParse(missing).success).toBe(false);
    const repeated = answer();
    repeated.images[1].image = 1;
    expect(schema.safeParse(repeated).success).toBe(false);
  });

  it("rejects a tag in the wrong list and an unknown tag", () => {
    const wrongList = answer();
    wrongList.findings[0].list = "improvement";
    expect(schema.safeParse(wrongList).success).toBe(false);
    const unknown = answer();
    unknown.findings[0].tag = "gap";
    expect(schema.safeParse(unknown).success).toBe(false);
  });

  it("rejects more than 12 findings and more than 4 proposed rows", () => {
    const many = answer();
    many.findings = Array.from({ length: 13 }, () => answer().findings[1]);
    expect(schema.safeParse(many).success).toBe(false);
    const rows = answer();
    rows.proposedRows = Array.from({ length: 5 }, () => answer().proposedRows[0]);
    expect(schema.safeParse(rows).success).toBe(false);
  });

  it("rejects a proposed row whose image has no observation finding", () => {
    const a = answer();
    a.proposedRows[0].image = 1;
    expect(schema.safeParse(a).success).toBe(false);
  });

  it("rejects an unknown row prefix", () => {
    const a = answer();
    a.proposedRows[0].prefix = "ZZZ";
    expect(schema.safeParse(a).success).toBe(false);
  });

  it.each(Object.entries(forbidden))("rejects %s in a text field", (_name, text) => {
    for (const mutate of [
      (a) => (a.findings[0].finding = text),
      (a) => (a.findings[0].evidence = text),
      (a) => (a.findings[0].change = text),
      (a) => (a.proposedRows[0].title = text),
      (a) => (a.proposedRows[0].action = text),
    ]) {
      const a = answer();
      mutate(a);
      expect(schema.safeParse(a).success).toBe(false);
    }
  });

  it("never echoes the model's text in an issue message", () => {
    const a = answer();
    a.findings[0].finding = "leak https://example.com/secret";
    const result = schema.safeParse(a);
    expect(JSON.stringify(result.error.issues)).not.toContain("secret");
  });

  it("builds the tag enum from the table it is given", () => {
    const wider = tabAnswerSchema({ tabId: "main", imageCount: 2, tags: [...tags, { tag: "gap", list: "improvement" }] });
    const a = answer();
    a.findings[0] = { ...a.findings[1], tag: "gap" };
    a.proposedRows = [];
    expect(wider.safeParse(a).success).toBe(true);
  });
});

describe("dashboardReviewSchema safeText", () => {
  it("enforces its length", () => {
    expect(safeText(5).safeParse("abcde").success).toBe(true);
    expect(safeText(5).safeParse("abcdef").success).toBe(false);
    expect(safeText(5).safeParse("").success).toBe(false);
  });

  it("allows three hyphen-joined words", () => {
    expect(safeText(50).safeParse("conversion-to-submission").success).toBe(true);
  });
});

describe("dashboardReviewSchema figuresBlockSchema", () => {
  it("accepts numbers by name", () => {
    expect(figuresBlockSchema.safeParse({ "revenue-gbp.last30": 12.5 }).success).toBe(true);
  });

  it("rejects a string value and a non-finite value", () => {
    expect(figuresBlockSchema.safeParse({ a: "1" }).success).toBe(false);
    expect(figuresBlockSchema.safeParse({ a: Infinity }).success).toBe(false);
  });
});
