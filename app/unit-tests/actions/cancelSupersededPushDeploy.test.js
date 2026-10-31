// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/actions/cancelSupersededPushDeploy.test.js

import { describe, test, expect, vi } from "vitest";

import {
  cancelableSupersededRuns,
  hasStartedStackJob,
  jobsForRun,
} from "../../../.github/actions/cancel-superseded-push-deploy/cancel-superseded-push-deploy.mjs";

describe("cancelableSupersededRuns", () => {
  test("keeps unfinished runs other than the current one", () => {
    const runs = [
      { id: 1, status: "in_progress" },
      { id: 2, status: "queued" },
      { id: 3, status: "completed" },
    ];
    expect(cancelableSupersededRuns(runs, 1).map((run) => run.id)).toEqual([2]);
  });
});

describe("hasStartedStackJob", () => {
  test("is true for an in-progress stack job and false while stack jobs are queued", () => {
    expect(hasStartedStackJob([{ name: "deploy AuthStack", status: "in_progress" }])).toBe(true);
    expect(hasStartedStackJob([{ name: "deploy AuthStack", status: "queued" }])).toBe(false);
  });

  test("finds a stack job under the stack phase caller, in a 2- or 3-segment name", () => {
    expect(hasStartedStackJob([{ name: "deploy stacks / deploy api", status: "in_progress" }])).toBe(true);
    expect(
      hasStartedStackJob([
        { name: "deploy stacks / deploy AuthStack via deploy-cdk-stack.yml / deploy ci-set1-app-AuthStack", status: "in_progress" },
      ]),
    ).toBe(true);
  });

  test("ignores the stack phase caller itself and its wait job", () => {
    expect(hasStartedStackJob([{ name: "deploy stacks", status: "in_progress" }])).toBe(false);
    expect(hasStartedStackJob([{ name: "deploy stacks / wait for environment edge inputs", status: "in_progress" }])).toBe(false);
  });
});

describe("jobsForRun", () => {
  // A deploy.yml run has 205 jobs: pages of 100, 100 and 5. Job 190 is on page 2.
  test("reads every page of a 205-job run and finds job 190", async () => {
    const jobs = Array.from({ length: 205 }, (_, i) => ({ name: i === 189 ? "deploy AuthStack" : `job ${i + 1}`, status: "in_progress" }));
    const fetchMock = vi.fn(async (url) => {
      const page = Number(new URL(url).searchParams.get("page") || 1);
      return { ok: true, status: 200, json: async () => ({ jobs: jobs.slice((page - 1) * 100, page * 100) }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const all = await jobsForRun(7);
    vi.unstubAllGlobals();
    expect(all).toHaveLength(205);
    expect(all.find((job) => job.name === "deploy AuthStack")).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(hasStartedStackJob(all)).toBe(true);
  });
});
