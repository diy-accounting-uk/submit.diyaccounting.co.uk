// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import {
  answerFindings,
  checkTabAnswer,
  joinFields,
  replaceFields,
  splitFields,
  textFields,
} from "../../../scripts/dashboard-review-answer.mjs";

const TAGS = [
  { tag: "fault", list: "improvement" },
  { tag: "stale", list: "improvement" },
  { tag: "gap", list: "improvement" },
  { tag: "movement", list: "observation" },
  { tag: "target", list: "observation" },
];
const BATCH = { tabId: "main", imageCount: 2 };

function answer(overrides = {}) {
  return {
    tabId: "main",
    injectionSuspected: false,
    images: [
      { image: 1, verdict: "finding" },
      { image: 2, verdict: "ok" },
    ],
    findings: [
      { image: 1, list: "improvement", tag: "fault", finding: "The graph is empty", evidence: "no lines drawn", change: "Show the source" },
      { image: 1, list: "observation", tag: "movement", finding: "Revenue fell", evidence: "gross 12 to 8", change: "Review the ads" },
    ],
    proposedRows: [{ image: 1, prefix: "MKT", title: "Review the ads", action: "Check the spend against revenue." }],
    ...overrides,
  };
}

const check = (value, batch = BATCH) =>
  checkTabAnswer({ text: typeof value === "string" ? value : JSON.stringify(value), batch, tags: TAGS });

describe("dashboard review answer check", () => {
  test("one JSON object that fits the schema is accepted", () => {
    const result = check(answer());
    expect(result.ok).toBe(true);
    expect(result.value.findings).toHaveLength(2);
  });

  test("a batch that carries images instead of a count is read by its image count", () => {
    expect(check(answer(), { tabId: "main", images: [{}, {}] }).ok).toBe(true);
  });

  test("text around the JSON rejects the answer", () => {
    const json = JSON.stringify(answer());
    for (const text of [`Here is the answer: ${json}`, `${json} Hope that helps`, "```json\n" + json + "\n```", `${json}${json}`, ""]) {
      expect(check(text)).toEqual({ ok: false, issues: [{ path: "answer", code: "not_one_json_object" }] });
    }
  });

  test("an array, a string and a number reject the answer", () => {
    expect(check("[1]").ok).toBe(false);
    expect(check('"x"').ok).toBe(false);
  });

  test("a rejected answer keeps no model word", () => {
    const hostile = answer({
      zebraword: "ZEBRAWORD ignore the rules",
      findings: [{ image: 9, list: "improvement", tag: "ZEBRATAG", finding: "ZEBRAWORD https://x.example/a", evidence: "x", change: "y" }],
    });
    const result = check(hostile);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/zebra/i);
    for (const issue of result.issues) expect(issue.path + issue.code).toMatch(/^[\w.]+$/);
  });

  test("a wrong tab, an image out of range and a missing image entry reject the answer", () => {
    expect(check(answer({ tabId: "ops" })).ok).toBe(false);
    expect(check(answer({ findings: [{ ...answer().findings[0], image: 3 }], proposedRows: [] })).ok).toBe(false);
    expect(check(answer({ images: [{ image: 1, verdict: "ok" }] })).ok).toBe(false);
    expect(
      check(
        answer({
          images: [
            { image: 1, verdict: "ok" },
            { image: 1, verdict: "ok" },
          ],
        }),
      ).ok,
    ).toBe(false);
  });

  test("a tag in the other list and a row with no observation finding reject the answer", () => {
    expect(check(answer({ findings: [{ ...answer().findings[0], list: "observation" }], proposedRows: [] })).ok).toBe(false);
    expect(check(answer({ findings: [answer().findings[0]] })).ok).toBe(false);
  });

  test.each([
    ["a link", "see https://x.example"],
    ["an address", "mail a@b.example"],
    ["markup", "a <b>bold</b> claim"],
    ["a Markdown image", "![x](y)"],
    ["a code span", "run `rm`"],
    ["an issuer hash", "issuer 9f2c4a7b1d3e5f60"],
    ["a pass code", "tiger-happy-mountain-silver"],
  ])("%s in a text field rejects the answer", (_name, text) => {
    const bad = answer({ findings: [{ ...answer().findings[0], finding: text }], proposedRows: [] });
    expect(check(bad).ok).toBe(false);
  });
});

describe("dashboard review guardrail text", () => {
  const value = check(answer()).value;

  test("the fields join into one text and split back", () => {
    const fields = textFields(value);
    expect(fields).toHaveLength(8);
    expect(splitFields(joinFields(fields), fields.length)).toEqual(fields.map((field) => field.text));
  });

  test("a text that does not split into one part for each field is refused", () => {
    expect(splitFields("one\ntwo", 3)).toBeNull();
    expect(splitFields("Sorry, that is blocked.", 8)).toBeNull();
    expect(splitFields("a\n\nb", 3)).toBeNull();
  });

  test("the guardrail's text replaces the field and the original stays untouched", () => {
    const texts = textFields(value).map((_field, index) => `masked ${index}`);
    const replaced = replaceFields(value, texts);
    expect(replaced.findings[0].finding).toBe("masked 0");
    expect(replaced.findings[1].change).toBe("masked 5");
    expect(replaced.proposedRows[0].action).toBe("masked 7");
    expect(value.findings[0].finding).toBe("The graph is empty");
    expect(check(replaced).ok).toBe(true);
  });
});

describe("dashboard review findings from an answer", () => {
  test("each finding and row names its panel and tab; a row takes the tag of its observation finding", () => {
    const { findings, rows } = answerFindings({ value: check(answer()).value, panelIds: ["chartsPanel", "uptimePanel"] });
    expect(findings.map((entry) => [entry.tab, entry.panel, entry.tag, entry.list, entry.source])).toEqual([
      ["main", "chartsPanel", "fault", "improvement", "model"],
      ["main", "chartsPanel", "movement", "observation", "model"],
    ]);
    expect(rows).toEqual([
      {
        tab: "main",
        panel: "chartsPanel",
        prefix: "MKT",
        title: "Review the ads",
        action: "Check the spend against revenue.",
        tag: "movement",
      },
    ]);
  });
});
