// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi } from "vitest";
import { writeFact, labelsFor } from "@app/lib/trustedEvents/issueWriter.js";
import { buildBody, buildTitle, parseBody, factHash, fullLines, hashOfParsed } from "@app/lib/trustedEvents/issueFormat.js";

const context = { env: "prod", account: "123456789012", observed: "2026-11-05T07:00:00.000Z", sourceId: "evt-1" };

const fact = (overrides = {}) => ({
  source: "aws.acm",
  sourceLabel: "acm",
  key: "acm:arn-1:2026-11-21",
  version: "days:30",
  subject: "example.com certificate expires in 20 days",
  scopeInTitle: true,
  region: "us-east-1",
  lines: [
    ["Common name", "example.com"],
    ["Days to expiry", 20],
  ],
  ...overrides,
});

function fakes({ items = {}, issue = null, createError = null } = {}) {
  const ledgerItems = { ...items };
  const ledger = {
    getLedgerItem: vi.fn(async (dedupeKey) => ledgerItems[dedupeKey] || null),
    putVersion: vi.fn(async () => {}),
    putKey: vi.fn(async () => {}),
  };
  const github = {
    getGitHubIssue: vi.fn(async () => issue),
    commentOnGitHubIssue: vi.fn(async () => ({})),
    createGitHubIssue: vi.fn(async () => {
      if (createError) throw createError;
      return { number: 41 };
    }),
  };
  return { ledger, github };
}

describe("issue format", () => {
  test("title is [EVENT], the source and the subject, with region and environment", () => {
    expect(buildTitle(fact(), context)).toBe("[EVENT] aws.acm: example.com certificate expires in 20 days (us-east-1, prod)");
  });

  test("title is at most 120 characters", () => {
    expect(buildTitle(fact({ subject: "x".repeat(300) }), context)).toHaveLength(120);
  });

  test("body lines come in the fixed order and end with the disclosure", () => {
    const body = buildBody(fact(), context);
    const names = [...body.matchAll(/^\*\*([^*]+):\*\*/gm)].map((match) => match[1]);
    expect(names).toEqual(["Source", "Key", "Version", "Account", "Region", "Observed", "Source id", "Common name", "Days to expiry"]);
    expect(body).toContain("**Account:** 123456789012 (prod)");
    expect(body).toContain("Verify: `gh workflow run trusted-event-verify.yml -f environment=prod");
    expect(body.trimEnd().endsWith("*Raised automatically by an automated pipeline.*")).toBe(true);
  });

  test("a fact account replaces the account of the function", () => {
    expect(buildBody(fact({ account: "210987654321" }), context)).toContain("**Account:** 210987654321 (prod)");
  });

  test("parseBody reads the block back and hashes the same as the writer", () => {
    const body = buildBody(fact(), context);
    const parsed = parseBody(body);
    expect(parsed).toMatchObject({ source: "aws.acm", key: "acm:arn-1:2026-11-21", version: "days:30" });
    expect(hashOfParsed(parsed)).toBe(factHash("aws.acm", "acm:arn-1:2026-11-21", "days:30", fullLines(fact(), context)));
  });

  test("a description in a fenced block is outside the hash", () => {
    const plain = parseBody(buildBody(fact(), context));
    const described = parseBody(buildBody(fact({ description: "text\nmore" }), context));
    expect(hashOfParsed(described)).toBe(hashOfParsed(plain));
  });

  test("an edited line changes the hash", () => {
    const body = buildBody(fact(), context).replace("**Version:** days:30", "**Version:** days:15");
    expect(hashOfParsed(parseBody(body))).not.toBe(hashOfParsed(parseBody(buildBody(fact(), context))));
  });

  test("parseBody returns null without the heading, a required line or a known source", () => {
    expect(parseBody("nothing here")).toBeNull();
    expect(parseBody("## Trusted event\n**Source:** aws.acm\n**Key:** k")).toBeNull();
    expect(parseBody("## Trusted event\n**Source:** other\n**Key:** k\n**Version:** v")).toBeNull();
  });
});

describe("labelsFor", () => {
  test("carries the standing labels, the source and the environment", () => {
    expect(labelsFor(fact(), "prod")).toEqual(["trusted-event", "maintainer-review", "origin:machine", "source:acm", "env:prod"]);
  });
});

describe("writeFact", () => {
  test("a version already in the ledger is unchanged and calls nothing", async () => {
    const { ledger, github } = fakes({ items: { "acm:arn-1:2026-11-21#days:30": { issueNumber: 7 } } });
    const result = await writeFact({ fact: fact(), context, token: "t", repo: "o/r", ledger, github });
    expect(result).toEqual({ action: "unchanged", key: "acm:arn-1:2026-11-21", issueNumber: 7 });
    expect(github.createGitHubIssue).not.toHaveBeenCalled();
    expect(github.commentOnGitHubIssue).not.toHaveBeenCalled();
    expect(ledger.putVersion).not.toHaveBeenCalled();
  });

  test("a new key opens an issue with the labels and writes both ledger items", async () => {
    const { ledger, github } = fakes();
    const result = await writeFact({ fact: fact(), context, token: "t", repo: "o/r", ledger, github });
    expect(result).toEqual({ action: "opened", key: "acm:arn-1:2026-11-21", issueNumber: 41 });
    const [, , created] = github.createGitHubIssue.mock.calls[0];
    expect(created.labels).toContain("maintainer-review");
    expect(created.title.startsWith("[EVENT] aws.acm:")).toBe(true);
    expect(ledger.putVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "acm:arn-1:2026-11-21",
        version: "days:30",
        issueNumber: 41,
        sourceId: "evt-1",
        factHash: factHash("aws.acm", "acm:arn-1:2026-11-21", "days:30", fullLines(fact(), context)),
      }),
    );
    expect(ledger.putKey).toHaveBeenCalledWith({ key: "acm:arn-1:2026-11-21", issueNumber: 41, lastVersion: "days:30" });
  });

  test("a new version of a key with an open issue is one comment", async () => {
    const { ledger, github } = fakes({
      items: { "acm:arn-1:2026-11-21": { issueNumber: 7, lastVersion: "days:30" } },
      issue: { number: 7, state: "open" },
    });
    const result = await writeFact({ fact: fact({ version: "days:15" }), context, token: "t", repo: "o/r", ledger, github });
    expect(result).toEqual({ action: "commented", key: "acm:arn-1:2026-11-21", issueNumber: 7 });
    expect(github.commentOnGitHubIssue).toHaveBeenCalledWith("t", "o/r", 7, expect.stringContaining("**Version:** days:15"));
    expect(github.createGitHubIssue).not.toHaveBeenCalled();
  });

  test("a closed issue opens a new issue", async () => {
    const { ledger, github } = fakes({
      items: { "acm:arn-1:2026-11-21": { issueNumber: 7 } },
      issue: { number: 7, state: "closed" },
    });
    const result = await writeFact({ fact: fact({ version: "days:15" }), context, token: "t", repo: "o/r", ledger, github });
    expect(result.action).toBe("opened");
    expect(result.issueNumber).toBe(41);
  });

  test("an issue that no longer exists opens a new issue", async () => {
    const { ledger, github } = fakes({ items: { "acm:arn-1:2026-11-21": { issueNumber: 7 } }, issue: null });
    expect((await writeFact({ fact: fact(), context, token: "t", repo: "o/r", ledger, github })).action).toBe("opened");
  });

  test("a GitHub error throws and writes no ledger item", async () => {
    const { ledger, github } = fakes({ createError: new Error("GitHub API error creating issue: 500") });
    await expect(writeFact({ fact: fact(), context, token: "t", repo: "o/r", ledger, github })).rejects.toThrow("500");
    expect(ledger.putVersion).not.toHaveBeenCalled();
    expect(ledger.putKey).not.toHaveBeenCalled();
  });
});
