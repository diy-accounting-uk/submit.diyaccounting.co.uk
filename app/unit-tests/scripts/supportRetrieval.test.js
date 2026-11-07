// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SNIPPET_COUNT,
  cachedEmbedder,
  cosine,
  embeddingText,
  nearestSnippets,
  selectSnippetFiles,
  writeSnippetFiles,
} from "../../../scripts/support-retrieval.mjs";
import { buildSnippets } from "../../../scripts/support-snippets.mjs";

const snippet = (id) => ({
  id,
  source: "faqs",
  title: `Title ${id}`,
  summary: `Summary ${id}.`,
  keywords: [id],
  topics: [],
  bytes: 10,
  updated: "",
  body: `Body of ${id}`,
});

const snippets = ["a", "b", "c", "d", "e"].map(snippet);
const vectorOf = { a: [1, 0], b: [0.9, 0.1], c: [0.5, 0.5], d: [0.1, 0.9], e: [0, 1] };
const embedder = (question) => async (text) => {
  const hit = snippets.find((item) => text === embeddingText(item));
  return hit ? vectorOf[hit.id] : question;
};

describe("cosine", () => {
  it("is 1 for equal directions, 0 for orthogonal ones and 0 for a zero vector", () => {
    expect(cosine([1, 2], [2, 4])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

describe("nearestSnippets", () => {
  const snippetVectors = new Map(Object.entries(vectorOf));

  it("returns the requested number of snippets, nearest first", () => {
    const chosen = nearestSnippets({ snippets, questionVector: [1, 0], snippetVectors, count: 3 });
    expect(chosen.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("breaks a tie by id", () => {
    const tied = new Map([
      ["a", [1, 0]],
      ["b", [1, 0]],
      ["c", [0, 1]],
      ["d", [0, 1]],
      ["e", [0, 1]],
    ]);
    const chosen = nearestSnippets({ snippets: [...snippets].reverse(), questionVector: [1, 0], snippetVectors: tied, count: 2 });
    expect(chosen.map((item) => item.id)).toEqual(["a", "b"]);
  });
});

describe("cachedEmbedder", () => {
  it("embeds a repeated text once", async () => {
    const embed = vi.fn(async () => [1]);
    const cached = cachedEmbedder(embed);
    await cached("x");
    await cached("x");
    expect(embed).toHaveBeenCalledTimes(1);
  });
});

describe("selectSnippetFiles", () => {
  it("writes exactly three snippet files, named by the snippet's own id, nearest first", async () => {
    const dir = mkdtempSync(join(tmpdir(), "retrieval-"));
    const paths = await selectSnippetFiles({ summary: "question", snippets, embed: embedder([1, 0]), dir });
    expect(SNIPPET_COUNT).toBe(3);
    expect(paths).toEqual([join(dir, "a.md"), join(dir, "b.md"), join(dir, "c.md")]);
    const text = readFileSync(paths[0], "utf8");
    expect(text.startsWith("---\nid: a\nsource: faqs\n")).toBe(true);
    expect(text).toContain("Body of a");
  });

  it("keeps a FAQ's own id without a prefix", () => {
    const dir = mkdtempSync(join(tmpdir(), "retrieval-"));
    const [path] = writeSnippetFiles([snippet("how-do-i-submit")], dir);
    expect(path).toBe(join(dir, "how-do-i-submit.md"));
    expect(readFileSync(path, "utf8")).toContain("id: how-do-i-submit\n");
  });

  it("picks real snippets of the site pages", async () => {
    const real = buildSnippets({ updatedOf: () => "" });
    const target = real.find((item) => item.source === "faqs");
    const embed = async (text) => {
      const hit = real.find((item) => text === embeddingText(item));
      if (text === "question") return [1, 0];
      return hit === target ? [1, 0] : [0, 1];
    };
    const dir = mkdtempSync(join(tmpdir(), "retrieval-"));
    const paths = await selectSnippetFiles({ summary: "question", snippets: real, embed, dir });
    expect(paths).toHaveLength(3);
    expect(paths[0]).toBe(join(dir, `${target.id}.md`));
  });

  it("fails when the embedding call fails", async () => {
    const dir = mkdtempSync(join(tmpdir(), "retrieval-"));
    const embed = async () => {
      throw new Error("AccessDeniedException");
    };
    await expect(selectSnippetFiles({ summary: "question", snippets, embed, dir })).rejects.toThrow("AccessDeniedException");
  });

  it("fails when the handling input has no summary", async () => {
    const dir = mkdtempSync(join(tmpdir(), "retrieval-"));
    const embed = vi.fn(async () => [1, 0]);
    await expect(selectSnippetFiles({ summary: "  ", snippets, embed, dir })).rejects.toThrow("no summary");
    expect(embed).not.toHaveBeenCalled();
  });
});
