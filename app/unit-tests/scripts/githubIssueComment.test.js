// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect, vi } from "vitest";
import { postIssueComment, githubGetAll } from "../../../scripts/github-issue-comment.mjs";

describe("github issue comment", () => {
  it("sends one POST to the comments endpoint and nothing else", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    await postIssueComment({ repo: "o/r", issue: "12", body: "hello", token: "t", fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.github.com/repos/o/r/issues/12/comments");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ body: "hello" });
  });

  it("rejects a repository or issue number that is not well formed", async () => {
    const fetchImpl = vi.fn();
    await expect(postIssueComment({ repo: "o/r/../x", issue: "1", body: "b", token: "t", fetchImpl })).rejects.toThrow();
    await expect(postIssueComment({ repo: "o/r", issue: "1; rm", body: "b", token: "t", fetchImpl })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not put the response text in its error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "SECRET-BODY" });
    await expect(postIssueComment({ repo: "o/r", issue: "1", body: "b", token: "t", fetchImpl })).rejects.toThrow(/403/);
    await expect(postIssueComment({ repo: "o/r", issue: "1", body: "b", token: "t", fetchImpl })).rejects.not.toThrow(/SECRET-BODY/);
  });

  it("reads every page of a list", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: i }));
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => page1 })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 100 }] });
    const items = await githubGetAll("/repos/o/r/issues", { token: "t", fetchImpl });
    expect(items).toHaveLength(101);
  });
});
