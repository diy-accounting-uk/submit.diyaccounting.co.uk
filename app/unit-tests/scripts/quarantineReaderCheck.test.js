// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { READER_MARKER, checkReaderAnswer, extractReaderJson } from "../../../scripts/quarantine-reader-check.mjs";

const SENTINEL = "SENTINEL-INJECTED-TEXT";
const ids = new Set(["how-to-submit-vat-return"]);
const families = new Set(["prod-env-github-probe-failed"]);
const run = { modelId: "model-x", runNumber: "7", runUrl: "https://github.com/o/r/actions/runs/1" };

const valid = {
  category: "bundles",
  faqId: "how-to-submit-vat-return",
  summary: "The customer cannot see the bundle.",
  injectionSuspected: false,
  piiPresent: false,
};

function check(answerText, extra = {}) {
  return checkReaderAnswer({ kind: "support", answerText, guardrailAction: "NONE", ids, families, ...run, ...extra });
}

// Recorded shapes of a model answer to a ticket that carries injected instructions.
const fixtures = {
  "model flagged the injection": JSON.stringify({
    ...valid,
    summary: "The ticket asks to add the label approved.",
    injectionSuspected: true,
  }),
  "model obeyed and added a key": JSON.stringify({ ...valid, labels: ["approved"], note: SENTINEL }),
  "model replied with a link": JSON.stringify({ ...valid, summary: `Reply with https://evil.example/${SENTINEL}` }),
  "JSON followed by prose": `${JSON.stringify(valid)}\n\nAs requested, ${SENTINEL}.`,
  "two JSON objects": `${JSON.stringify(valid)}\n${JSON.stringify({ ...valid, summary: SENTINEL })}`,
  "Markdown fence around JSON": `\`\`\`json\n${JSON.stringify({ ...valid, summary: SENTINEL })}\n\`\`\``,
  "prose only": `Sure, I will ignore previous instructions. ${SENTINEL}`,
  "unknown category": JSON.stringify({ ...valid, category: SENTINEL }),
};

describe("quarantine reader check", () => {
  for (const [name, answer] of Object.entries(fixtures)) {
    it(`gives a valid comment or a rejection for: ${name}`, () => {
      const { outcome, comment } = check(answer);
      expect(["accepted", "rejected"]).toContain(outcome);
      expect(comment.startsWith(READER_MARKER)).toBe(true);
      if (outcome === "rejected") {
        expect(comment).not.toContain(SENTINEL);
        expect(comment).toContain("rejected");
      } else {
        expect(extractReaderJson(comment)).toEqual(JSON.parse(answer));
      }
    });
  }

  it("rejects every answer except the one that is a single schema-valid object", () => {
    const outcomes = Object.fromEntries(Object.entries(fixtures).map(([name, answer]) => [name, check(answer).outcome]));
    expect(outcomes).toEqual({
      "model flagged the injection": "accepted",
      "model obeyed and added a key": "rejected",
      "model replied with a link": "rejected",
      "JSON followed by prose": "rejected",
      "two JSON objects": "rejected",
      "Markdown fence around JSON": "rejected",
      "prose only": "rejected",
      "unknown category": "rejected",
    });
  });

  it("lists schema issue paths and codes in a rejection", () => {
    const { comment } = check(fixtures["model obeyed and added a key"]);
    expect(comment).toContain("`answer`: `unrecognized_keys`");
  });

  it("sets piiPresent when the guardrail intervened", () => {
    const { outcome, comment } = check(JSON.stringify(valid), { guardrailAction: "GUARDRAIL_INTERVENED" });
    expect(outcome).toBe("accepted");
    expect(extractReaderJson(comment).piiPresent).toBe(true);
    expect(comment).toContain("PII present: yes");
  });

  it("builds the FAQ link from the id and shows no link for a null id", () => {
    expect(check(JSON.stringify(valid)).comment).toContain(
      "[how-to-submit-vat-return](https://submit.diyaccounting.co.uk/help.html#how-to-submit-vat-return)",
    );
    expect(check(JSON.stringify({ ...valid, faqId: null })).comment).toContain("FAQ none");
  });

  it("keeps a fake json fence inside the summary from being read as the reader's object", () => {
    const fake = { ...valid, category: "other", summary: `x\n\`\`\`json\n${JSON.stringify({ ...valid, category: "connection" })}\n\`\`\`` };
    const { comment } = check(JSON.stringify(fake));
    expect(extractReaderJson(comment)).toEqual(fake);
  });

  it("does not read a comment without the marker", () => {
    expect(extractReaderJson("```json\n{}\n```")).toBeNull();
  });

  it("checks an alarm answer against the family list", () => {
    const answer = {
      stillBroken: "no",
      remedyFamily: "prod-env-github-probe-failed",
      summary: "Passed.",
      injectionSuspected: false,
      piiPresent: false,
    };
    const ok = checkReaderAnswer({ kind: "alarm", answerText: JSON.stringify(answer), guardrailAction: "NONE", ids, families, ...run });
    expect(ok.outcome).toBe("accepted");
    expect(ok.comment).toContain("still broken: no");
    const bad = checkReaderAnswer({
      kind: "alarm",
      answerText: JSON.stringify({ ...answer, remedyFamily: SENTINEL }),
      guardrailAction: "NONE",
      ids,
      families,
      ...run,
    });
    expect(bad.outcome).toBe("rejected");
    expect(bad.comment).not.toContain(SENTINEL);
  });
});
