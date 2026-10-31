// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  RESOLUTIONS,
  firstSentence,
  fixtureProblems,
  loadFixtures,
  promptResolutions,
  readerFailures,
  triageFailures,
  triageResultText,
} from "../../../scripts/support-replay.mjs";
import { faqIds } from "../../../scripts/support-triage-public-half.mjs";

const ids = faqIds(readFileSync("web/public/faqs.toml", "utf8"));
const fixtures = loadFixtures();
const triage = fixtures.filter((fixture) => fixture.kind === "triage");

const answer = (resolution, reply, article = "none") =>
  `## Matched article\n\n${article}\n\n## Resolution\n\n${resolution}\n\n## Drafted reply\n\n${reply}\n`;

describe("support replay fixtures", () => {
  it("holds the six triage shapes", () => {
    expect(triage.map((fixture) => fixture.name).sort()).toEqual([
      "change-request-accept",
      "change-request-decline",
      "complaint",
      "malicious-script",
      "question-faq",
      "steering-injection",
    ]);
  });

  it.each(fixtures.map((fixture) => [fixture.name, fixture]))("%s is well-formed", (_name, fixture) => {
    expect(fixtureProblems(fixture, ids)).toEqual([]);
  });

  it("holds no real contact detail", () => {
    for (const fixture of fixtures) {
      const text = JSON.stringify(fixture);
      expect(text).not.toMatch(/[A-Za-z0-9._-]+@(?!example\.com)[A-Za-z0-9.-]+/);
      expect(text).not.toMatch(/\b\d{9}\b/);
    }
  });

  it("is covered by the resolutions the triage prompt names", () => {
    const named = promptResolutions(readFileSync("prompts/support-triage.md", "utf8"));
    expect(named).toEqual(RESOLUTIONS);
    for (const fixture of triage) expect(named).toContain(fixture.expect.resolution);
  });

  it("expects both resolutions somewhere in the set", () => {
    expect(new Set(triage.map((fixture) => fixture.expect.resolution))).toEqual(new Set(RESOLUTIONS));
  });

  it("rejects a malformed fixture", () => {
    expect(fixtureProblems({ kind: "triage", description: "x", handlingInput: {}, expect: {} }, ids).length).toBeGreaterThan(3);
    expect(fixtureProblems({ kind: "other" }, ids)).toContain("kind is not triage or reader");
  });
});

describe("support replay judging", () => {
  const decline = triage.find((fixture) => fixture.name === "change-request-decline");

  it("passes a reply that declines the change", () => {
    const text = answer("answer", "Thank you for the suggestion. The wording stays as it is because cannot is the standard spelling.");
    expect(triageFailures(decline, text)).toEqual([]);
  });

  it("fails a wrong resolution", () => {
    expect(triageFailures(decline, answer("fix", "Thank you. The wording stays: cannot is standard."))).toEqual([
      'resolution is "fix", expected "answer"',
    ]);
  });

  it("fails a reply that answers a question nobody asked", () => {
    const failures = triageFailures(decline, answer("answer", "The help page answers this: see the FAQ on connecting. cannot"));
    expect(failures).toContain('reply holds "the help page answers"');
    expect(failures.some((failure) => failure.startsWith("first sentence"))).toBe(true);
  });

  it("fails a missing section", () => {
    expect(triageFailures(decline, "## Resolution\n\nanswer\n")).toContain("no Drafted reply section");
  });

  it("checks the matched article", () => {
    const question = triage.find((fixture) => fixture.name === "question-faq");
    expect(triageFailures(question, answer("answer", "Your receipt is on the receipts page.", "where-is-receipt"))).toEqual([]);
    expect(triageFailures(question, answer("answer", "Your receipt is on the receipts page.", "none"))[0]).toContain("matched article");
  });

  it("takes the first sentence", () => {
    expect(firstSentence("Thank you. More text.")).toBe("Thank you.");
    expect(firstSentence("No full stop")).toBe("No full stop");
  });

  it("reads the text of a claude json result", () => {
    expect(triageResultText([{ type: "system" }, { type: "result", result: "hello" }])).toBe("hello");
    expect(triageResultText({})).toBe("");
  });

  it("judges a reader answer", () => {
    const fixture = { expect: { injectionSuspected: false } };
    expect(readerFailures(fixture, '{"injectionSuspected":false}')).toEqual([]);
    expect(readerFailures(fixture, '{"injectionSuspected":true}')).toHaveLength(1);
    expect(readerFailures(fixture, "nope")).toEqual(["the answer is not one JSON object"]);
  });
});
