// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/stackHoldings.test.js

import { describe, test, expect } from "vitest";
import { deploymentNameOfRun, heldStackJobs, readGreenRun, STACK_JOB_STACKS } from "../../../scripts/ci/stack-holdings.mjs";

const SHA = "acc4f353b89129621ed31f6d1ac34d60a875beef";
const GREEN = { headSha: SHA, deploymentName: "ci-set1", completedAt: "2026-10-26T02:15:24Z" };

function standing(stack, { status = "UPDATE_COMPLETE", updated = "2026-10-26T01:56:41.915000+00:00" } = {}) {
  return {
    StackName: `ci-set1-app-${stack}`,
    StackStatus: status,
    CreationTime: "2026-10-24T00:40:08.538000+00:00",
    LastUpdatedTime: updated,
  };
}

function allStanding(overrides = {}) {
  const byRegion = { "eu-west-2": [], "us-east-1": [] };
  for (const stacks of Object.values(STACK_JOB_STACKS)) {
    for (const { stack, region } of stacks) byRegion[region].push(standing(stack, overrides[stack]));
  }
  return byRegion;
}

describe("deploymentNameOfRun", () => {
  test("reads the deployment name from the run's reusable stack jobs", () => {
    const jobs = [
      { name: "names", conclusion: "success" },
      { name: "deploy SelfDestructStack via deploy-cdk-stack.yml / deploy ci-set1-app-SelfDestructStack", conclusion: "success" },
      { name: "deploy AuthStack via deploy-cdk-stack.yml / deploy ci-set1-app-AuthStack", conclusion: "success" },
    ];
    expect(deploymentNameOfRun(jobs)).toBe("ci-set1");
  });

  test("reads the deployment name from a 3-segment job name under the stack phase caller", () => {
    const jobs = [
      {
        name: "deploy stacks / deploy SelfDestructStack via deploy-cdk-stack.yml / deploy ci-set1-app-SelfDestructStack",
        conclusion: "success",
      },
      { name: "deploy stacks / deploy AuthStack via deploy-cdk-stack.yml / deploy ci-set1-app-AuthStack", conclusion: "success" },
      { name: "deploy stacks / deploy api", conclusion: "success" },
    ];
    expect(deploymentNameOfRun(jobs)).toBe("ci-set1");
  });

  test("gives no name when the run deployed nothing", () => {
    expect(deploymentNameOfRun([{ name: "deploy AuthStack via deploy-cdk-stack.yml / params", conclusion: "success" }])).toBe("");
  });

  test("gives no name when the jobs name two deployments", () => {
    const jobs = [
      { name: "deploy AuthStack via deploy-cdk-stack.yml / deploy ci-set1-app-AuthStack", conclusion: "success" },
      { name: "deploy HmrcStack via deploy-cdk-stack.yml / deploy ci-set2-app-HmrcStack", conclusion: "success" },
    ];
    expect(deploymentNameOfRun(jobs)).toBe("");
  });
});

describe("heldStackJobs", () => {
  const base = { deploymentName: "ci-set1", comparedFrom: SHA, greenRun: GREEN };

  test("skips an advised stack job whose stacks the green run left in this deployment", () => {
    const result = heldStackJobs({ ...base, advised: ["deploy-auth", "deploy-api", "web-test-auth"], stacksByRegion: allStanding() });
    expect(result.skip).toEqual(["deploy-auth", "deploy-api"]);
  });

  test("never skips a job outside the stack catalogue", () => {
    const result = heldStackJobs({ ...base, advised: ["deploy-mcp", "deploy-publish"], stacksByRegion: allStanding() });
    expect(result.skip).toEqual([]);
  });

  test("runs a job whose stack is missing", () => {
    const stacks = allStanding();
    stacks["us-east-1"] = [];
    const result = heldStackJobs({ ...base, advised: ["deploy-edge"], stacksByRegion: stacks });
    expect(result.skip).toEqual([]);
  });

  test("runs a job whose stack rolled back", () => {
    const result = heldStackJobs({
      ...base,
      advised: ["deploy-hmrc"],
      stacksByRegion: allStanding({ HmrcStack: { status: "UPDATE_ROLLBACK_COMPLETE" } }),
    });
    expect(result.skip).toEqual([]);
  });

  test("runs a job when one of its stacks changed after the green run ended", () => {
    const result = heldStackJobs({
      ...base,
      advised: ["deploy-api"],
      stacksByRegion: allStanding({ ApiRoutesStack: { updated: "2026-10-26T03:00:00Z" } }),
    });
    expect(result.skip).toEqual([]);
  });

  test("runs every job when the green run deployed to another slot", () => {
    const result = heldStackJobs({
      ...base,
      greenRun: { ...GREEN, deploymentName: "ci-set2" },
      advised: ["deploy-auth"],
      stacksByRegion: allStanding(),
    });
    expect(result.skip).toEqual([]);
  });

  test("runs every job when the advice compared from main", () => {
    const result = heldStackJobs({ ...base, comparedFrom: "", advised: ["deploy-auth"], stacksByRegion: allStanding() });
    expect(result.skip).toEqual([]);
  });

  test("runs every job when the green run's head is not the compared commit", () => {
    const result = heldStackJobs({
      ...base,
      greenRun: { ...GREEN, headSha: "b1b27b7cd8b6ea8a2691550794db5762a1e2755d" },
      advised: ["deploy-auth"],
      stacksByRegion: allStanding(),
    });
    expect(result.skip).toEqual([]);
  });

  test("runs every job when no green run is found", () => {
    const result = heldStackJobs({ ...base, greenRun: null, advised: ["deploy-auth"], stacksByRegion: {} });
    expect(result.skip).toEqual([]);
  });
});

describe("readGreenRun", () => {
  // A 205-job run read through gh api --paginate: the stand-in answers one page without the flag
  // and every page with it. The inner stack job that names the deployment is job 190.
  const jobs = Array.from({ length: 205 }, (_, i) => ({
    name: i === 189 ? "stacks / deploy ci-set1-app-AuthStack" : `job ${i + 1}`,
    conclusion: "success",
  }));

  function fakeGh(command, args) {
    if (args.some((arg) => arg.includes("/workflows/deploy.yml/runs"))) {
      return JSON.stringify([{ id: 9, headSha: SHA, completedAt: "2026-10-26T02:15:24Z" }]);
    }
    const lines = args.includes("--paginate") ? jobs : jobs.slice(0, 100);
    return lines.map((job) => JSON.stringify(job)).join("\n");
  }

  test("finds the deployment name on job 190 of a 205-job run", () => {
    const green = readGreenRun({ repo: "o/r", branch: "claude/x", comparedFrom: SHA }, fakeGh);
    expect(green.deploymentName).toBe("ci-set1");
  });
});
