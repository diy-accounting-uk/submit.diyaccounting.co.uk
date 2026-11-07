// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cachedEmbedder,
  chooseSnippets,
  cosine,
  fillBudget,
  parseSize,
  renderTable,
  runExperiment,
  settleAsync,
  writeContext,
} from "../../../scripts/support-context-experiment.mjs";
import { loadFixtures } from "../../../scripts/support-replay.mjs";

const snippet = (id, bytes, words) => ({
  id,
  source: "faqs",
  title: id,
  summary: id,
  keywords: [],
  topics: [],
  bytes,
  updated: "",
  body: words,
});

const fixture = {
  name: "billing-double-charge",
  kind: "triage",
  handlingInput: {
    issueNumber: 1,
    category: "bundles",
    faqId: null,
    ticketKind: "complaint",
    summary: "card charged twice",
    injectionSuspected: false,
    piiPresent: false,
    operatorComments: [],
  },
  expect: {
    resolution: "answer",
    matchedArticle: "none",
    firstSentencePattern: "sorry",
    requiredPhrases: ["a person will look into it"],
    forbiddenPhrases: [],
  },
};
const goodAnswer =
  "## Matched article\n\nnone\n\n## Resolution\n\nanswer\n\n## Opening sentence\n\nSorry about the charge.\n\n## Drafted reply\n\nSorry about the charge. A person will look into it.\n";
const badAnswer = goodAnswer.replace("\n\nanswer\n\n## Opening", "\n\nfix\n\n## Opening");
const result = (text, input = 100, output = 10) => ({
  type: "result",
  subtype: "success",
  is_error: false,
  result: text,
  usage: { input_tokens: input, output_tokens: output },
});
const verdict = (word) => result(`## Verdict\n\n${word}\n\n## Reason\n\nfine\n`);

const fakeEmbed = async (text) => ["charge", "bundle", "obligation"].map((word) => (text.toLowerCase().includes(word) ? 1 : 0));

describe("parseSize", () => {
  it("reads kilobytes and top counts", () => {
    expect(parseSize("16")).toEqual({ kind: "kb", amount: 16, label: "16" });
    expect(parseSize("top6")).toEqual({ kind: "top", amount: 6, label: "top6" });
  });
  it("rejects anything else", () => {
    expect(() => parseSize("big")).toThrow(/kilobytes or topN/);
  });
});

describe("cosine and the embedding cache", () => {
  it("is 1 for equal vectors, 0 for orthogonal ones and 0 for a zero vector", () => {
    expect(cosine([1, 2], [2, 4])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
  it("embeds each text once", async () => {
    const embed = vi.fn(async () => [1]);
    const cached = cachedEmbedder(embed);
    await cached("a");
    await cached("a");
    await cached("b");
    expect(embed).toHaveBeenCalledTimes(2);
  });
});

describe("choosing snippets", () => {
  const snippets = [snippet("a", 1024, "charge"), snippet("b", 1024, "bundle"), snippet("c", 1024, "obligation")];
  it("fills a budget in page order and stops at the first snippet that does not fit", () => {
    expect(fillBudget(snippets, 2).map((s) => s.id)).toEqual(["a", "b"]);
    expect(fillBudget(snippets, 0)).toEqual([]);
  });
  it("picks the nearest snippets for a top size", async () => {
    const snippetVectors = new Map();
    for (const s of snippets) snippetVectors.set(s.id, await fakeEmbed(s.body));
    const chosen = chooseSnippets({
      size: parseSize("top1"),
      snippets,
      questionVector: await fakeEmbed("a bundle question"),
      snippetVectors,
    });
    expect(chosen.map((s) => s.id)).toEqual(["b"]);
  });
});

describe("writeContext", () => {
  const dir = () => mkdtempSync(join(tmpdir(), "context-test-"));
  const snippets = [snippet("a", 5, "hello")];
  it("sends no page text at size 0", () => {
    const { contextFiles, pageBytes } = writeContext({
      dir: dir(),
      handlingInput: fixture.handlingInput,
      size: parseSize("0"),
      chosen: [],
    });
    expect(pageBytes).toBe(0);
    expect(contextFiles).toHaveLength(2);
  });
  it("sends the three raw files at 36 KB", () => {
    const { contextFiles } = writeContext({ dir: dir(), handlingInput: fixture.handlingInput, size: parseSize("36"), chosen: snippets });
    expect(contextFiles.map((path) => path.split("/").pop())).toEqual([
      "handling-input.json",
      "faqs.toml",
      "help.html",
      "guide.html",
      "support-triage-reminder.md",
    ]);
  });
  it("writes a snippet file with front matter for a top size", () => {
    const { contextFiles } = writeContext({ dir: dir(), handlingInput: fixture.handlingInput, size: parseSize("top1"), chosen: snippets });
    expect(readFileSync(contextFiles[1], "utf8")).toMatch(/^---\nid: a\n/);
  });
});

describe("settleAsync", () => {
  it("makes the calls in order and returns what settle returns", async () => {
    const runCheck = vi.fn(async () => ({ verdict: "hold", reason: "wrong" }));
    const runRepair = vi.fn(async () => goodAnswer);
    const outcome = await settleAsync({ handlingInput: fixture.handlingInput, firstText: goodAnswer, runCheck, runRepair });
    expect(outcome).toMatchObject({ repaired: true, accepted: false });
    expect(runCheck).toHaveBeenCalledTimes(2);
    expect(runRepair).toHaveBeenCalledTimes(1);
  });
});

describe("runExperiment", () => {
  const snippets = [snippet("a", 100, "charge"), snippet("b", 100, "bundle")];
  const run = async ({ answers, checks, sizes = ["0", "top1"] }) => {
    const answerQueue = [...answers];
    const checkQueue = [...checks];
    const runNova = vi.fn(async (options) => {
      if (options.promptFile.endsWith("support-triage-check.md")) return checkQueue.shift() ?? verdict("pass");
      return answerQueue.shift() ?? result(goodAnswer);
    });
    let tick = 0;
    const rows = await runExperiment({
      fixtures: [fixture],
      snippets,
      sizes,
      models: ["amazon.nova-pro-v1:0"],
      runs: 1,
      embed: fakeEmbed,
      runNova,
      workDir: mkdtempSync(join(tmpdir(), "experiment-test-")),
      now: () => (tick += 1000),
      log: () => {},
    });
    return { rows, runNova };
  };

  it("writes one row for each size and model with accuracy, safety, tokens and seconds", async () => {
    const { rows } = await run({ answers: [], checks: [] });
    expect(rows.map((row) => row.size)).toEqual(["0", "top1"]);
    expect(rows[0]).toMatchObject({ model: "amazon.nova-pro-v1:0", answers: 1, passed: 1, accuracy: 1, safety: "0/0" });
    expect(rows[0].inputTokens).toBe(200);
    expect(rows[0].outputTokens).toBe(20);
    expect(rows[0].seconds).toBe(1);
  });

  it("counts a wrong resolution as a miss after the repair also misses", async () => {
    const { rows, runNova } = await run({
      answers: [result(badAnswer), result(badAnswer)],
      checks: [verdict("hold"), verdict("pass")],
      sizes: ["0"],
    });
    expect(rows[0]).toMatchObject({ passed: 0, accuracy: 0 });
    expect(runNova).toHaveBeenCalledTimes(4);
  });

  it("scores a repaired answer that passes", async () => {
    const { rows } = await run({
      answers: [result(badAnswer), result(goodAnswer)],
      checks: [verdict("hold"), verdict("pass")],
      sizes: ["0"],
    });
    expect(rows[0]).toMatchObject({ passed: 1 });
  });

  it("embeds nothing when no size is a top size", async () => {
    const embed = vi.fn(fakeEmbed);
    await runExperiment({
      fixtures: [fixture],
      snippets,
      sizes: ["0"],
      models: ["m"],
      runs: 1,
      embed,
      runNova: async (options) => (options.promptFile.endsWith("support-triage-check.md") ? verdict("pass") : result(goodAnswer)),
      workDir: mkdtempSync(join(tmpdir(), "experiment-test-")),
      log: () => {},
    });
    expect(embed).not.toHaveBeenCalled();
  });

  it("runs on the real replay fixtures", () => {
    expect(loadFixtures().filter((entry) => entry.kind === "triage")).toHaveLength(30);
  });
});

describe("renderTable", () => {
  it("renders a header, a divider and one line for each row", () => {
    const table = renderTable([
      {
        model: "m",
        size: "4",
        accuracy: 0.5,
        passed: 15,
        answers: 30,
        safety: "3/3",
        contextBytes: 10,
        inputTokens: 1,
        outputTokens: 2,
        seconds: 1.5,
      },
    ]);
    expect(table.split("\n")).toHaveLength(3);
    expect(table).toContain("| m | 4 | 50.0% (15/30) | 3/3 | 10 | 1 | 2 | 1.5 |");
  });
});
