// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildSnippets,
  firstSentence,
  renderSnippet,
  splitFaqs,
  splitHtml,
  topWords,
  writeSnippets,
} from "../../../scripts/support-snippets.mjs";

const toml = `
[[faq]]
id = "first-one"
category = "submission"
question = "How do I send it?"
answer = """
Press the button. Then wait.

More text.
"""
keywords = ["send", "button"]
priority = 1

[[faq]]
id = "second-one"
category = "bundles"
question = "What is a bundle?"
answer = """
A bundle is a set of features.
"""
keywords = []
priority = 2
`;

const html = `<html><head><title>Help Page</title><script>var x = 1;</script></head><body>
<p>Intro text here. More.</p><h2>Billing &amp; pay</h2><p>Pay by card. Cards work.</p><!-- hidden -->
<h2>Empty</h2><h3>Contact</h3><p>Write to us.</p></body></html>`;

describe("firstSentence", () => {
  it("returns the text up to the first full stop", () => {
    expect(firstSentence("Press the button.  Then wait.")).toBe("Press the button.");
  });
  it("returns a text with no full stop whole, cut to 200 characters", () => {
    expect(firstSentence("a".repeat(300))).toHaveLength(200);
  });
});

describe("topWords", () => {
  it("ranks by count, drops stop words and breaks ties alphabetically", () => {
    expect(topWords("the card card pay pay bundle and", 3)).toEqual(["card", "pay", "bundle"]);
  });
});

describe("splitFaqs", () => {
  it("makes one snippet for each entry with its own fields", () => {
    const snippets = splitFaqs(toml);
    expect(snippets.map((snippet) => snippet.id)).toEqual(["first-one", "second-one"]);
    expect(snippets[0]).toMatchObject({
      title: "How do I send it?",
      summary: "Press the button.",
      keywords: ["send", "button"],
      topics: ["submission"],
    });
    expect(snippets[0].body).toContain("More text.");
  });
});

describe("splitHtml", () => {
  const snippets = splitHtml(html, "help");
  it("splits at h1 to h3 headings and drops sections with no text", () => {
    expect(snippets.map((snippet) => snippet.title)).toEqual(["Help Page", "Billing & pay", "Contact"]);
  });
  it("removes scripts and comments from the text", () => {
    expect(snippets.map((snippet) => snippet.body).join(" ")).not.toMatch(/var x|hidden/);
  });
  it("gives each snippet a summary, keywords and a topic", () => {
    expect(snippets[1]).toMatchObject({ summary: "Pay by card.", topics: ["help"] });
    expect(snippets[1].keywords).toContain("card");
  });
});

describe("buildSnippets and writeSnippets", () => {
  const files = {
    "web/public/faqs.toml": toml,
    "web/public/help.html": html,
    "web/public/guide.html": "<body><h1>Guide</h1><p>Steps.</p></body>",
  };
  const snippets = buildSnippets({ root: ".", read: (path) => files[path], updatedOf: () => "2026-01-01T00:00:00Z" });

  it("sets source, bytes and updated on every snippet", () => {
    expect(snippets.every((snippet) => snippet.bytes === Buffer.byteLength(snippet.body) && snippet.updated)).toBe(true);
    expect([...new Set(snippets.map((snippet) => snippet.source))]).toEqual(["faqs", "help", "guide"]);
  });

  it("writes one file for each snippet, with front matter first", () => {
    const dir = mkdtempSync(join(tmpdir(), "snippets-test-"));
    writeSnippets(snippets, dir);
    expect(readdirSync(dir)).toHaveLength(snippets.length);
    const text = readFileSync(join(dir, "first-one.md"), "utf8");
    expect(text.startsWith("---\nid: first-one\nsource: faqs\n")).toBe(true);
    for (const key of ["title", "summary", "keywords", "topics", "bytes", "updated"]) expect(text).toContain(`\n${key}: `);
  });

  it("renders keywords as a quoted list", () => {
    expect(renderSnippet(snippets[0])).toContain('keywords: ["send", "button"]');
  });
});

describe("the real pages", () => {
  it("split into snippets that each carry an id, a title and text", () => {
    const real = buildSnippets({ updatedOf: () => "" });
    expect(real.length).toBeGreaterThan(30);
    expect(new Set(real.map((snippet) => snippet.id)).size).toBe(real.length);
    expect(real.every((snippet) => snippet.title && snippet.bytes > 0)).toBe(true);
  });
});
