// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/actions/waitForMainDeploy.test.js

import { describe, test, expect, vi } from "vitest";

import { runStillGatesProbes, decidePollOutcome, jobsForRun } from "../../../.github/actions/wait-for-main-deploy/wait-for-main-deploy.mjs";

function job(name, status) {
  return { name, status };
}

describe("runStillGatesProbes", () => {
  test("does not gate once 'set origins' is completed and no rollback job exists", () => {
    const run = { id: 1, status: "in_progress" };
    const jobs = [job("set origins", "completed")];

    expect(runStillGatesProbes(run, jobs).gates).toBe(false);
  });

  test("does not gate once 'set origins' is completed and the rollback job is completed (skipped)", () => {
    const run = { id: 2, status: "in_progress" };
    const jobs = [job("set origins", "completed"), job("roll back apex to previous deployment", "completed")];

    expect(runStillGatesProbes(run, jobs).gates).toBe(false);
  });

  test("gates while 'set origins' is still in progress", () => {
    const run = { id: 3, status: "in_progress" };
    const jobs = [job("set origins", "in_progress")];

    const result = runStillGatesProbes(run, jobs);
    expect(result.gates).toBe(true);
    expect(result.reason).toContain("set origins");
  });

  test("gates while 'set origins' has not started yet", () => {
    const run = { id: 4, status: "in_progress" };
    const jobs = [job("mvn-package", "in_progress")];

    const result = runStillGatesProbes(run, jobs);
    expect(result.gates).toBe(true);
    expect(result.reason).toContain("set origins");
  });

  test("gates a queued run with no jobs yet", () => {
    const run = { id: 5, status: "queued" };

    const result = runStillGatesProbes(run, []);
    expect(result.gates).toBe(true);
    expect(result.reason).toContain("queued");
  });

  test("gates while the rollback job is in progress even though 'set origins' completed", () => {
    const run = { id: 6, status: "in_progress" };
    const jobs = [job("set origins", "completed"), job("roll back apex to previous deployment", "in_progress")];

    const result = runStillGatesProbes(run, jobs);
    expect(result.gates).toBe(true);
    expect(result.reason).toContain("roll back apex to previous deployment");
  });

  test("gates a waiting run (environment protection rules) with no jobs yet", () => {
    const run = { id: 7, status: "waiting" };

    const result = runStillGatesProbes(run, []);
    expect(result.gates).toBe(true);
    expect(result.reason).toContain("waiting");
  });
});

describe("decidePollOutcome", () => {
  test("stops with nothing gating when gatingCount is 0, even with time left to wait", () => {
    const result = decidePollOutcome(0, 0, 40 * 60);
    expect(result.stop).toBe(true);
    expect(result.deployInProgress).toBe(false);
  });

  test("keeps polling while something gates and time remains", () => {
    const result = decidePollOutcome(1, 0, 40 * 60);
    expect(result.stop).toBe(false);
    expect(result.deployInProgress).toBe(true);
  });

  test("a zero max-wait gives up on the first check instead of polling, when something gates", () => {
    const result = decidePollOutcome(1, 0, 0);
    expect(result.stop).toBe(true);
    expect(result.deployInProgress).toBe(true);
  });

  test("a zero max-wait still reports nothing in progress when nothing gates", () => {
    const result = decidePollOutcome(0, 0, 0);
    expect(result.stop).toBe(true);
    expect(result.deployInProgress).toBe(false);
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

describe("jobsForRun", () => {
  test("reads every page of a 205-job run and finds job 190", async () => {
    const fetchMock = pagedJobsFetch();
    vi.stubGlobal("fetch", fetchMock);
    const jobs = await jobsForRun(7);
    vi.unstubAllGlobals();
    expect(jobs).toHaveLength(205);
    expect(jobs.find((job) => job.name === "job 190")).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test("'set origins' on page 2 is seen, so a run past it does not gate", async () => {
    const jobs = Array.from({ length: 205 }, (_, i) => ({ name: i === 105 ? "set origins" : `job ${i + 1}`, status: "completed" }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        const page = Number(new URL(url).searchParams.get("page") || 1);
        return { ok: true, status: 200, json: async () => ({ jobs: jobs.slice((page - 1) * 100, page * 100) }) };
      }),
    );
    const allJobs = await jobsForRun(7);
    vi.unstubAllGlobals();
    expect(runStillGatesProbes({ id: 7, status: "in_progress" }, allJobs).gates).toBe(false);
  });
});
