// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/actions/waitForCiDeploys.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";

// wait-for-ci-deploys.mjs reads these from process.env once, at import time.
process.env.GH_TOKEN = "test-token";
process.env.GITHUB_REPOSITORY = "diy-accounting-uk/submit.diyaccounting.co.uk";
process.env.CURRENT_RUN_ID = "1";

const { blockedOnlyByDestroyCiCallerJobs, olderUnfinishedRuns, github, fetchJobs, namedJobsCompleted, environmentGatingRuns } =
  await import("../../../.github/actions/wait-for-ci-deploys/wait-for-ci-deploys.mjs");

function run(overrides) {
  return {
    id: 1,
    name: "deploy.yml",
    head_branch: "claude/example",
    status: "in_progress",
    created_at: "2026-09-27T06:53:00Z",
    ...overrides,
  };
}

describe("blockedOnlyByDestroyCiCallerJobs", () => {
  test("is false with no jobs", () => {
    expect(blockedOnlyByDestroyCiCallerJobs([])).toBe(false);
  });

  test("is false when a real job is still unfinished alongside the sweep call", () => {
    expect(
      blockedOnlyByDestroyCiCallerJobs([
        { name: "mvn-package", status: "in_progress" },
        { name: "sweep ci for a stale set", status: "queued" },
      ]),
    ).toBe(false);
  });

  test("is true when the only unfinished job is the destroy-ci caller", () => {
    expect(
      blockedOnlyByDestroyCiCallerJobs([
        { name: "mvn-package", status: "completed" },
        { name: "sweep ci for a stale set", status: "queued" },
      ]),
    ).toBe(true);
  });

  test("is true when the only unfinished jobs are the called workflow's, listed as caller / called", () => {
    expect(
      blockedOnlyByDestroyCiCallerJobs([
        { name: "mvn-package", status: "completed" },
        { name: "sweep ci for a stale set / params", status: "pending" },
        { name: "sweep ci for a stale set / destroy", status: "pending" },
      ]),
    ).toBe(true);
  });

  test("ignores an unrelated job name even when it is the only unfinished one", () => {
    expect(blockedOnlyByDestroyCiCallerJobs([{ name: "some-other-job", status: "queued" }])).toBe(false);
  });

  test("is false once every job has completed", () => {
    expect(
      blockedOnlyByDestroyCiCallerJobs([
        { name: "mvn-package", status: "completed" },
        { name: "sweep ci for a stale set", status: "completed" },
      ]),
    ).toBe(false);
  });
});

describe("olderUnfinishedRuns", () => {
  const currentCreatedAt = "2026-09-27T06:56:00Z";
  const currentId = "999";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // The deadlock this guards against: a destroy-ci.yml run holding the `destroy-ci`
  // concurrency group waits here for an older deploy.yml run whose only remaining job is a
  // queued call into destroy-ci.yml - which cannot start until that same group frees.
  test("excludes an older run whose only unfinished job is the destroy-ci sweep call", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jobs: [
          { name: "mvn-package", status: "completed" },
          { name: "sweep ci for a stale set", status: "queued" },
        ],
      }),
    });

    const runs = [run({ id: 1 })];
    const result = await olderUnfinishedRuns(runs, currentCreatedAt, currentId);
    expect(result).toEqual([]);
  });

  test("still waits for an older run doing real work", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jobs: [{ name: "mvn-package", status: "in_progress" }],
      }),
    });

    const runs = [run({ id: 2 })];
    const result = await olderUnfinishedRuns(runs, currentCreatedAt, currentId);
    expect(result).toEqual(["deploy.yml#2 (claude/example, created 2026-09-27T06:53:00Z)"]);
  });

  test("excludes main, self and newer runs without fetching their jobs", async () => {
    global.fetch = vi.fn();
    const runs = [
      run({ id: currentId, head_branch: "main" }),
      run({ id: currentId }),
      run({ id: 3, created_at: "2026-09-27T07:00:00Z" }),
      run({ id: 4, status: "completed" }),
    ];
    const result = await olderUnfinishedRuns(runs, currentCreatedAt, currentId);
    expect(result).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("github", () => {
  function answer(status, body) {
    return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) };
  }

  test("tries again after a 5xx and returns the next answer", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(answer(502, { message: "Server Error" }))
      .mockResolvedValueOnce(answer(200, { jobs: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(github("/actions/runs/7/jobs", { retrySeconds: 0 })).resolves.toEqual({ jobs: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  test("fails after the last attempt still answers 5xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer(503, { message: "Unavailable" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(github("/actions/runs/7", { attempts: 3, retrySeconds: 0 })).rejects.toThrow("answered 503");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.unstubAllGlobals();
  });

  test("fails at once on a 4xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer(404, { message: "Not Found" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(github("/actions/runs/7", { retrySeconds: 0 })).rejects.toThrow("answered 404");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

// A deploy.yml run has 205 jobs: pages of 100, 100 and 5. Job 190 is on page 2.
function pagedJobsFetch() {
  const jobs = Array.from({ length: 205 }, (_, i) => ({ id: i + 1, name: `job ${i + 1}`, status: "completed" }));
  return vi.fn(async (url) => {
    const page = Number(new URL(url).searchParams.get("page") || 1);
    const body = { total_count: jobs.length, jobs: jobs.slice((page - 1) * 100, page * 100) };
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
  });
}

describe("fetchJobs", () => {
  test("reads every page of a 205-job run and finds job 190", async () => {
    const fetchMock = pagedJobsFetch();
    vi.stubGlobal("fetch", fetchMock);
    const jobs = await fetchJobs(7);
    vi.unstubAllGlobals();
    expect(jobs).toHaveLength(205);
    expect(jobs.find((job) => job.name === "job 190")).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("namedJobsCompleted", () => {
  const jobs = [
    { name: "create secrets", status: "completed" },
    { name: "deploy data / deploy prod-env-DataStack", status: "completed" },
    { name: "deploy data / names", status: "in_progress" },
    { name: "deploy observability us-east-1 / params", status: "queued" },
  ];

  test("is false with no prefixes", () => {
    expect(namedJobsCompleted(jobs, [])).toBe(false);
  });

  test("is true when every prefix matches only completed jobs", () => {
    expect(namedJobsCompleted(jobs, ["create secrets"])).toBe(true);
  });

  test("is false while any job a prefix matches is unfinished", () => {
    expect(namedJobsCompleted(jobs, ["create secrets", "deploy data /"])).toBe(false);
  });

  test("is false when a prefix matches no job, so a renamed job waits for the whole run", () => {
    expect(namedJobsCompleted(jobs, ["create secrets", "deploy identity"])).toBe(false);
  });

  test("'deploy observability /' does not match 'deploy observability us-east-1 /'", () => {
    expect(namedJobsCompleted(jobs, ["deploy observability /"])).toBe(false);
    expect(namedJobsCompleted([{ name: "deploy observability us-east-1 / params", status: "completed" }], ["deploy observability /"])).toBe(
      false,
    );
  });
});

describe("environmentGatingRuns", () => {
  const runs = [
    { id: 11, name: "deploy environment", head_branch: "main", status: "in_progress", created_at: "2026-10-31T00:00:00Z" },
    { id: 12, name: "deploy environment", head_branch: "claude/other", status: "in_progress", created_at: "2026-10-31T00:00:00Z" },
  ];

  test("with no prefixes every unfinished run of the environment gates and no jobs are read", async () => {
    const loadJobs = vi.fn();
    const gating = await environmentGatingRuns(runs, "prod", 1, [], loadJobs);
    expect(gating).toHaveLength(1);
    expect(loadJobs).not.toHaveBeenCalled();
  });

  test("a run whose named jobs are completed does not gate", async () => {
    const loadJobs = vi.fn().mockResolvedValue([{ name: "deploy identity", status: "completed" }]);
    const gating = await environmentGatingRuns(runs, "prod", 1, ["deploy identity"], loadJobs);
    expect(gating).toEqual([]);
  });

  test("a run whose named job has not started still gates", async () => {
    const loadJobs = vi.fn().mockResolvedValue([{ name: "create secrets", status: "completed" }]);
    const gating = await environmentGatingRuns(runs, "prod", 1, ["create secrets", "deploy identity"], loadJobs);
    expect(gating).toHaveLength(1);
  });
});
