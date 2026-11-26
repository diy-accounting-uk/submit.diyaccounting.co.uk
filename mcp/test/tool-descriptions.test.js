// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// mcp/test/tool-descriptions.test.js
// The descriptions prod's hosted endpoint answers to tools/list: each says what the tool does, when
// to use it and what it does not do, fits the directory limit, and is the expected tool of at least
// two prompts of the golden prompt set.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createSession } from "../lib/book-tools.js";
import { hostedInstructions, hostedToolNames } from "../lib/hosted-tools.js";
import { handleMcpRequest } from "../lib/http.js";

const GOLDEN = JSON.parse(readFileSync(new URL("./fixtures/golden-prompts.json", import.meta.url), "utf8"));
const PROD_TOOLS = hostedToolNames("prod");

async function prodTools() {
  const listed = await handleMcpRequest(
    new Request("https://submit.diyaccounting.co.uk/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", "accept": "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }),
    { session: createSession(), toolNames: PROD_TOOLS, instructions: hostedInstructions("prod") },
  ).then((response) => response.json());
  return listed.result.tools;
}

describe("the golden prompt set", () => {
  it("holds ten direct, ten indirect and ten negative prompts", () => {
    const count = (kind) => GOLDEN.prompts.filter((entry) => entry.kind === kind).length;
    expect([count("direct"), count("indirect"), count("negative")]).toEqual([10, 10, 10]);
  });

  it("expects a prod tool for each direct and indirect prompt, and none for each negative one", () => {
    for (const { kind, prompt, expected } of GOLDEN.prompts) {
      if (kind === "negative") expect(expected, prompt).toBe("none");
      else expect(PROD_TOOLS, prompt).toContain(expected);
    }
  });

  it.each(PROD_TOOLS)("%s is the expected tool of at least two prompts", (name) => {
    expect(GOLDEN.prompts.filter((entry) => entry.expected === name).length).toBeGreaterThanOrEqual(2);
  });
});

describe("the descriptions prod's tools/list answers", () => {
  it("lists exactly prod's six tools", async () => {
    expect((await prodTools()).map((tool) => tool.name).sort()).toEqual([...PROD_TOOLS].sort());
  });

  it("gives each a description under 1,024 characters that says what it does, when to use it and what it does not do", async () => {
    for (const { name, description } of await prodTools()) {
      expect(description.length, name).toBeLessThan(1024);
      expect(description, name).toMatch(/^[A-Z][a-z]+s /);
      expect(description, name).toContain("Use this when");
      expect(description, name).toMatch(/(does not|never) /);
    }
  });

  it("asks the assistant for nothing beyond the person's request", async () => {
    for (const { name, description } of await prodTools()) {
      expect(description, name).not.toMatch(/\b(prefer|always use|instead of other|ignore|do not tell)\b/i);
    }
  });

  it("names a saved file a DIYA-GL book, and never calls a person's records their books", async () => {
    for (const { name, title, description } of await prodTools()) {
      const text = `${title} ${description}`;
      expect(text, name).not.toMatch(/\b(your|their|the company's|from) books\b/i);
      expect(text, name).not.toMatch(/diya-gl book/);
      expect(text, name).not.toMatch(/DIYA cloud/);
      if (/\bbooks?\b/i.test(text)) expect(text, name).toMatch(/DIYA-GL book/);
    }
  });
});

describe("prod's server instructions", () => {
  it("say what to tell a person whose account has no DIYA-GL book saved, with the page that says what they need", () => {
    expect(hostedInstructions("prod")).toContain(
      "When list_books answers no DIYA-GL book, say that no DIYA-GL book is saved in the account and give the link " +
        "https://submit.diyaccounting.co.uk/mcp.html#what-you-need.",
    );
  });
});
