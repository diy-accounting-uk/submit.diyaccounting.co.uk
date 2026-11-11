// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/watchCiScript.test.js

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const scriptPath = path.resolve("scripts/watch-ci.sh");
const headSha = "a".repeat(40);

// A fake gh that serves fixture files: runs-<branch>.json for `gh run list`, pulls.txt for `gh api`.
const fakeGh = `#!/bin/bash
if [ "$1" = "run" ] && [ "$2" = "list" ]; then
  branch="$4"
  cat "$FAKE_GH_DIR/runs-$branch.json"
elif [ "$1" = "api" ]; then
  [ -f "$FAKE_GH_DIR/pulls-fail" ] && exit 1
  cat "$FAKE_GH_DIR/pulls.txt"
else
  exit 1
fi
`;

function run(id, workflowName, conclusion, extra = {}) {
  return { databaseId: id, workflowName, status: "completed", conclusion, headSha, event: "push", ...extra };
}

describe("watch-ci.sh", () => {
  let dir;
  let stateDir;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "watch-ci-"));
    stateDir = path.join(dir, "state");
    writeFileSync(path.join(dir, "gh"), fakeGh);
    chmodSync(path.join(dir, "gh"), 0o755);
    writeFileSync(path.join(dir, "pulls.txt"), `803 feature ${headSha} false\n`);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function serve(branch, runs) {
    writeFileSync(path.join(dir, `runs-${branch}.json`), JSON.stringify(runs));
  }

  function watch({ timeout = 20000 } = {}) {
    const result = spawnSync("bash", [scriptPath, stateDir], {
      encoding: "utf8",
      timeout,
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, FAKE_GH_DIR: dir, WATCH_CI_SLEEP: "0.05" },
    });
    return `${result.stdout ?? ""}`;
  }

  it("counts a cancelled run with no later success and withholds MERGEABLE", () => {
    serve("main", [run(1, "test", "success")]);
    serve("feature", [run(10, "test", "cancelled"), run(11, "build", "success")]);
    const out = watch();
    expect(out).toContain("SEEDED: 3 latest runs in scope, 0 in flight, 0 red already, 1 cancelled already");
    expect(out).toContain("TALLY: all terminal, 3 latest runs, 0 red, 1 cancelled");
    expect(out).not.toContain("MERGEABLE");
  });

  it("stays quiet about a cancelled run that a later success supersedes", () => {
    serve("main", [run(1, "test", "success")]);
    serve("feature", [run(10, "test", "cancelled"), run(12, "test", "success"), run(11, "build", "success")]);
    const out = watch();
    expect(out).toContain("TALLY: all terminal, 3 latest runs, 0 red, 0 cancelled");
    expect(out).toContain(`MERGEABLE #803 feature (${headSha})`);
    expect(out).not.toContain("CANCELLED");
  });

  it("reports a run that ends cancelled after the first pass as its own event", () => {
    serve("main", [run(1, "test", "success")]);
    serve("feature", [run(11, "build", "success"), run(10, "test", "", { status: "in_progress" })]);
    const cancelledRuns = JSON.stringify([run(11, "build", "success"), run(10, "test", "cancelled")]);
    const fixture = path.join(dir, "runs-feature.json");
    const result = spawnSync("bash", ["-c", `(sleep 0.5; printf '%s' "$CANCELLED_RUNS" > "${fixture}") & "${scriptPath}" "${stateDir}"`], {
      encoding: "utf8",
      timeout: 20000,
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        FAKE_GH_DIR: dir,
        WATCH_CI_SLEEP: "0.05",
        CANCELLED_RUNS: cancelledRuns,
      },
    });
    expect(result.stdout).toContain("CANCELLED feature test run 10");
    expect(result.stdout).toContain("TALLY: all terminal, 3 latest runs, 0 red, 1 cancelled");
  });

  it("makes a failed pull request listing a loud event and never ends the watch", () => {
    serve("main", [run(1, "test", "success")]);
    writeFileSync(path.join(dir, "pulls-fail"), "");
    const out = watch({ timeout: 1500 });
    expect(out).toContain("PR LIST FAILED");
    expect(out).not.toContain("TALLY");
  });
});
