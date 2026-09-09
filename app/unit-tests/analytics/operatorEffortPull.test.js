// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const mockSmSend = vi.fn();
vi.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: class {
    send(...args) {
      return mockSmSend(...args);
    }
  },
  GetSecretValueCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

const mockS3Send = vi.fn();
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send(...args) {
      return mockS3Send(...args);
    }
  },
  PutObjectCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  handler,
  defaultTargetDate,
  nextDay,
  parseNextLink,
  fetchAllPages,
  pullWorkflowRuns,
  pullIssueEvents,
  pullCommits,
  toNdjson,
} from "@app/functions/analytics/operatorEffortPull.js";

function jsonResponse(body, headers = {}) {
  return {
    ok: true,
    json: () => Promise.resolve(body),
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  };
}

describe("operatorEffortPull", () => {
  beforeEach(() => {
    mockSmSend.mockReset();
    mockS3Send.mockReset();
    mockFetch.mockReset();
    mockS3Send.mockResolvedValue({});
    mockSmSend.mockResolvedValue({ SecretString: "gh-token" });

    process.env.GITHUB_REPO = "diy-accounting-uk/submit.diyaccounting.co.uk";
    process.env.GITHUB_TOKEN_SECRET_ARN = "arn:aws:secretsmanager:eu-west-2:111111111111:secret:test-token";
    process.env.ANALYTICS_LAKE_BUCKET_NAME = "test-lake";
  });

  afterEach(() => {
    delete process.env.GITHUB_REPO;
    delete process.env.GITHUB_TOKEN_SECRET_ARN;
    delete process.env.ANALYTICS_LAKE_BUCKET_NAME;
    delete process.env.OPERATOR_GITHUB_LOGIN;
  });

  test("defaultTargetDate returns yesterday in UTC", () => {
    const now = new Date();
    const expected = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))
      .toISOString()
      .slice(0, 10);
    expect(defaultTargetDate()).toBe(expected);
  });

  test("nextDay rolls a date forward by one", () => {
    expect(nextDay("2026-09-05")).toBe("2026-09-06");
    expect(nextDay("2026-09-30")).toBe("2026-10-01");
  });

  test("parseNextLink extracts the rel=next URL from a Link header", () => {
    const response = {
      headers: {
        get: () => '<https://api.github.com/x?page=2>; rel="next", <https://api.github.com/x?page=5>; rel="last"',
      },
    };
    expect(parseNextLink(response)).toBe("https://api.github.com/x?page=2");
  });

  test("parseNextLink returns null with no Link header", () => {
    expect(parseNextLink({ headers: { get: () => null } })).toBeNull();
  });

  test("fetchAllPages follows nextUrl until null", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ items: [1, 2], nextUrl: "page2" })
      .mockResolvedValueOnce({ items: [3], nextUrl: null });

    const items = await fetchAllPages(fetchPage, "page1");
    expect(items).toEqual([1, 2, 3]);
    expect(fetchPage).toHaveBeenNthCalledWith(1, "page1");
    expect(fetchPage).toHaveBeenNthCalledWith(2, "page2");
  });

  test("toNdjson renders one JSON object per line and an empty body for no records", () => {
    expect(toNdjson([])).toBe("");
    expect(toNdjson([{ a: 1 }, { a: 2 }])).toBe('{"a":1}\n{"a":2}\n');
  });

  test("pullWorkflowRuns projects the run fields the Glue table carries", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        workflow_runs: [
          {
            id: 42,
            name: "deploy",
            event: "workflow_dispatch",
            actor: { login: "antonycc" },
            status: "completed",
            conclusion: "success",
            created_at: "2026-09-05T10:00:00Z",
            updated_at: "2026-09-05T10:05:00Z",
            html_url: "https://github.com/x/y/actions/runs/42",
          },
        ],
      }),
    );

    const runs = await pullWorkflowRuns({ githubRepo: "x/y", token: "t", dateStr: "2026-09-05" });
    expect(runs).toEqual([
      {
        run_id: "42",
        workflow_name: "deploy",
        event: "workflow_dispatch",
        actor: "antonycc",
        status: "completed",
        conclusion: "success",
        created_at: "2026-09-05T10:00:00Z",
        updated_at: "2026-09-05T10:05:00Z",
        html_url: "https://github.com/x/y/actions/runs/42",
      },
    ]);
    expect(mockFetch.mock.calls[0][0]).toContain("created=2026-09-05..2026-09-06");
  });

  test("pullIssueEvents flags the operator's own actor and stops once events fall before the day", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse([
        { issue: { number: 7 }, event: "commented", actor: { login: "antonycc" }, created_at: "2026-09-05T12:00:00Z" },
        { issue: { number: 7 }, event: "commented", actor: { login: "github-actions[bot]" }, created_at: "2026-09-05T09:00:00Z" },
        { issue: { number: 6 }, event: "closed", actor: { login: "antonycc" }, created_at: "2026-09-04T23:00:00Z" },
      ]),
    );

    const events = await pullIssueEvents({
      githubRepo: "x/y",
      token: "t",
      dateStr: "2026-09-05",
      operatorLogin: "antonycc",
    });

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      issue_number: 7,
      event_type: "commented",
      actor: "antonycc",
      is_operator: true,
      created_at: "2026-09-05T12:00:00Z",
    });
    expect(events[1].is_operator).toBe(false);
    // The older, out-of-window event stopped paging: only one fetch call was made.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("pullCommits flags a Claude Code co-author trailer, case-insensitively", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse([
        {
          sha: "abc123",
          commit: {
            author: { name: "antonycc", date: "2026-09-05T08:00:00Z" },
            message: "Fix the thing\n\nCo-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>",
          },
        },
        {
          sha: "def456",
          commit: { author: { name: "antonycc", date: "2026-09-05T09:00:00Z" }, message: "Plain commit" },
        },
      ]),
    );

    const commits = await pullCommits({ githubRepo: "x/y", token: "t", dateStr: "2026-09-05" });
    expect(commits).toEqual([
      { sha: "abc123", author: "antonycc", authored_at: "2026-09-05T08:00:00Z", has_claude_coauthor: true },
      { sha: "def456", author: "antonycc", authored_at: "2026-09-05T09:00:00Z", has_claude_coauthor: false },
    ]);
  });

  test("handler resolves the token once, pulls all three sources and writes one object each", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ workflow_runs: [] }))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]));

    const result = await handler({ date: "2026-09-05" });

    expect(result).toEqual({
      date: "2026-09-05",
      keys: {
        workflow_runs: "curated/operator/workflow-runs/dt=2026-09-05/workflow_runs.json",
        issue_events: "curated/operator/issue-events/dt=2026-09-05/issue_events.json",
        commits: "curated/operator/commits/dt=2026-09-05/commits.json",
      },
      counts: { workflow_runs: 0, issue_events: 0, commits: 0 },
    });
    expect(mockSmSend).toHaveBeenCalledTimes(1);
    expect(mockS3Send).toHaveBeenCalledTimes(3);
  });

  test("handler throws when GITHUB_REPO is missing", async () => {
    delete process.env.GITHUB_REPO;
    await expect(handler({ date: "2026-09-05" })).rejects.toThrow("GITHUB_REPO");
  });
});
