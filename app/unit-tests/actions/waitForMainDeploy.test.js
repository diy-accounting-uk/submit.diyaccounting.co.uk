// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/actions/waitForMainDeploy.test.js

import { describe, test, expect } from "vitest";

import { runStillGatesProbes, decidePollOutcome } from "../../../.github/actions/wait-for-main-deploy/wait-for-main-deploy.mjs";

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
