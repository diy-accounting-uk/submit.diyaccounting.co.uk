// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, afterEach } from "vitest";
import { createGitHubIssue, commentOnGitHubIssue, getGitHubIssue } from "@app/lib/githubIssueApi.js";

describe("createGitHubIssue", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("posts title, body, and labels to the issues endpoint", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ number: 99, html_url: "https://github.com/x/y/issues/99" }),
    });

    const issue = await createGitHubIssue("gh-token", "diy-accounting-uk/submit.diyaccounting.co.uk", {
      title: "[ALARM] x",
      body: "body text",
      labels: ["alarm", "ops"],
    });

    expect(issue.number).toBe(99);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe("https://api.github.com/repos/diy-accounting-uk/submit.diyaccounting.co.uk/issues");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body);
    expect(body).toEqual({ title: "[ALARM] x", body: "body text", labels: ["alarm", "ops"] });
  });

  test("throws on a non-ok create response", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 422, text: () => Promise.resolve("validation failed") });
    await expect(
      createGitHubIssue("gh-token", "diy-accounting-uk/submit.diyaccounting.co.uk", { title: "t", body: "b", labels: [] }),
    ).rejects.toThrow("GitHub API error creating issue: 422");
  });
});

describe("commentOnGitHubIssue", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("posts a comment to the issue's comments endpoint", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 1 }) });

    await commentOnGitHubIssue("gh-token", "diy-accounting-uk/submit.diyaccounting.co.uk", 42, "comment text");

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe("https://api.github.com/repos/diy-accounting-uk/submit.diyaccounting.co.uk/issues/42/comments");
    expect(JSON.parse(options.body)).toEqual({ body: "comment text" });
  });

  test("throws on a non-ok comment response", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, text: () => Promise.resolve("not found") });
    await expect(commentOnGitHubIssue("gh-token", "diy-accounting-uk/submit.diyaccounting.co.uk", 42, "comment text")).rejects.toThrow(
      "GitHub API error commenting on issue: 404",
    );
  });
});

describe("getGitHubIssue", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("reads the issue from the issue endpoint with the auth headers", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ number: 7, state: "open" }) });

    const issue = await getGitHubIssue("gh-token", "diy-accounting-uk/example-repo", 7);

    expect(issue).toEqual({ number: 7, state: "open" });
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe("https://api.github.com/repos/diy-accounting-uk/example-repo/issues/7");
    expect(options.headers.Authorization).toBe("Bearer gh-token");
    expect(options.headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
  });

  test("returns null on a 404", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, text: () => Promise.resolve("not found") });
    expect(await getGitHubIssue("gh-token", "diy-accounting-uk/example-repo", 7)).toBeNull();
  });

  test("throws on any other non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve("boom") });
    await expect(getGitHubIssue("gh-token", "diy-accounting-uk/example-repo", 7)).rejects.toThrow(
      "GitHub API error reading issue: 500 boom",
    );
  });
});
