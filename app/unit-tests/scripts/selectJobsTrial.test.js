// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/selectJobsTrial.test.js

import { describe, test, expect } from "vitest";
import {
  jobDisplayNames,
  jobDurationSeconds,
  tallyAdvisedSkips,
  renderMarkdownTable,
  artifactLabelForCatalogue,
  runSourcesForCatalogue,
  correlationNames,
  MIN_ADVISED_SKIPS_TO_MEET_BAR,
} from "../../../scripts/ci/select-jobs-trial.mjs";

const FIXTURE_WORKFLOW_YAML = `
jobs:
  mvn-test:
    name: 'run the Java unit tests'
    runs-on: ubuntu-24.04
  lint-js:
    runs-on: ubuntu-24.04
`;

describe("jobDisplayNames", () => {
  test("reads a job's explicit name from the workflow YAML", () => {
    const names = jobDisplayNames(FIXTURE_WORKFLOW_YAML, ["mvn-test"]);
    expect(names).toEqual({ "mvn-test": "run the Java unit tests" });
  });

  test("falls back to the job's own id when it has no name", () => {
    const names = jobDisplayNames(FIXTURE_WORKFLOW_YAML, ["lint-js"]);
    expect(names).toEqual({ "lint-js": "lint-js" });
  });

  test("falls back to the job's own id when the job is missing from the workflow entirely", () => {
    const names = jobDisplayNames(FIXTURE_WORKFLOW_YAML, ["some-removed-job"]);
    expect(names).toEqual({ "some-removed-job": "some-removed-job" });
  });
});

describe("artifactLabelForCatalogue", () => {
  test("labels test.yml's own artifact 'test'", () => {
    expect(artifactLabelForCatalogue("test.yml")).toBe("test");
  });

  test("labels deploy.yml's own artifact 'deploy'", () => {
    expect(artifactLabelForCatalogue("deploy.yml")).toBe("deploy");
  });

  test("throws on a catalogue it does not recognise, rather than guessing a label", () => {
    expect(() => artifactLabelForCatalogue("probe-test.yml")).toThrow();
  });
});

describe("runSourcesForCatalogue", () => {
  test("test.yml gathers from its own runs and from deploy.yml's, prefixed by the caller job id", () => {
    expect(runSourcesForCatalogue("test.yml")).toEqual([
      { workflowFile: "test.yml", jobNamePrefix: "" },
      { workflowFile: "deploy.yml", jobNamePrefix: "test / " },
    ]);
  });

  test("deploy.yml gathers only from its own runs, since nothing calls it", () => {
    expect(runSourcesForCatalogue("deploy.yml")).toEqual([{ workflowFile: "deploy.yml", jobNamePrefix: "" }]);
  });

  test("throws on a catalogue it does not recognise", () => {
    expect(() => runSourcesForCatalogue("probe-test.yml")).toThrow();
  });
});

describe("correlationNames", () => {
  test("leaves names unprefixed for a workflow's own standalone runs", () => {
    expect(correlationNames({ "mvn-test": "run the Java unit tests" }, "")).toEqual({
      "mvn-test": "run the Java unit tests",
    });
  });

  test("prefixes every name with the caller job id for a called-workflow run", () => {
    expect(correlationNames({ "mvn-test": "run the Java unit tests" }, "test / ")).toEqual({
      "mvn-test": "test / run the Java unit tests",
    });
  });
});

describe("jobDurationSeconds", () => {
  test("computes the duration between start and completion", () => {
    const seconds = jobDurationSeconds({ started_at: "2026-09-01T00:00:00Z", completed_at: "2026-09-01T00:02:00Z" });
    expect(seconds).toBe(120);
  });

  test("returns null for a job with no completion timestamp", () => {
    expect(jobDurationSeconds({ started_at: "2026-09-01T00:00:00Z", completed_at: null })).toBeNull();
  });

  test("returns null for a job argument of null", () => {
    expect(jobDurationSeconds(null)).toBeNull();
  });

  test("returns null when completion precedes the start (a clock anomaly)", () => {
    const seconds = jobDurationSeconds({ started_at: "2026-09-01T00:02:00Z", completed_at: "2026-09-01T00:00:00Z" });
    expect(seconds).toBeNull();
  });
});

describe("tallyAdvisedSkips", () => {
  test("counts advised skips, misses, and minutes saved per job", () => {
    const rows = [
      { job: "mvn-test", advisedSkip: true, conclusion: "success", durationSeconds: 120 },
      { job: "mvn-test", advisedSkip: true, conclusion: "success", durationSeconds: 180 },
      { job: "mvn-test", advisedSkip: true, conclusion: "failure", durationSeconds: 60 },
      { job: "lint-js", advisedSkip: false, conclusion: "success", durationSeconds: 30 },
    ];
    const tally = tallyAdvisedSkips(rows);
    expect(tally).toEqual([{ job: "mvn-test", advisedSkips: 3, misses: 1, minutesSaved: 6, meetsBar: false }]);
  });

  test("a row with no advised skip is never counted", () => {
    const rows = [{ job: "mvn-test", advisedSkip: false, conclusion: "failure", durationSeconds: 999 }];
    expect(tallyAdvisedSkips(rows)).toEqual([]);
  });

  test("a row with no duration evidence contributes zero minutes, not a fabricated one", () => {
    const rows = [{ job: "mvn-test", advisedSkip: true, conclusion: "success", durationSeconds: null }];
    const tally = tallyAdvisedSkips(rows);
    expect(tally[0].minutesSaved).toBe(0);
  });

  test("sorts the tally by job id, regardless of the rows' own order", () => {
    const rows = [
      { job: "npm-test", advisedSkip: true, conclusion: "success", durationSeconds: 60 },
      { job: "mvn-test", advisedSkip: true, conclusion: "success", durationSeconds: 60 },
    ];
    const tally = tallyAdvisedSkips(rows);
    expect(tally.map((t) => t.job)).toEqual(["mvn-test", "npm-test"]);
  });

  test("meets the bar once every advised skip that ran actually succeeded, at the threshold count", () => {
    const rows = Array.from({ length: MIN_ADVISED_SKIPS_TO_MEET_BAR }, () => ({
      job: "mvn-test",
      advisedSkip: true,
      conclusion: "success",
      durationSeconds: 60,
    }));
    const tally = tallyAdvisedSkips(rows);
    expect(tally[0].meetsBar).toBe(true);
  });

  test("one miss below the threshold count still fails the bar", () => {
    const rows = Array.from({ length: MIN_ADVISED_SKIPS_TO_MEET_BAR - 1 }, () => ({
      job: "mvn-test",
      advisedSkip: true,
      conclusion: "success",
      durationSeconds: 60,
    }));
    const tally = tallyAdvisedSkips(rows);
    expect(tally[0].meetsBar).toBe(false);
  });
});

describe("renderMarkdownTable", () => {
  test("renders one row per job, in the order given", () => {
    const table = renderMarkdownTable([
      { job: "mvn-test", advisedSkips: 60, misses: 0, minutesSaved: 12, meetsBar: true },
      { job: "npm-test", advisedSkips: 2, misses: 0, minutesSaved: 3, meetsBar: false },
    ]);
    const lines = table.split("\n");
    expect(lines[0]).toContain("Job");
    expect(lines[2]).toContain("mvn-test");
    expect(lines[3]).toContain("npm-test");
  });

  test("says so when there is nothing to report, rather than an empty table", () => {
    expect(renderMarkdownTable([])).toBe("No advised skips recorded in this range.");
  });
});
