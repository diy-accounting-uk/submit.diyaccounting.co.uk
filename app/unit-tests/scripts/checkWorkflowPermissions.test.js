// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/checkWorkflowPermissions.test.js

import { describe, test, expect } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { parseWorkflow, findViolations, loadWorkflows, run } from "../../../scripts/check-workflow-permissions.mjs";

const CALLED_WORKFLOW = `
name: probe-test
on:
  workflow_dispatch:
  workflow_call:
    inputs:
      environment-name:
        type: string
permissions:
  id-token: write
  contents: read

jobs:
  behaviour-test:
    name: 'behaviour test'
    runs-on: ubuntu-24.04
    steps:
      - run: |
          echo "uses: ./.github/workflows/not-a-real-call.yml"
          echo "permissions: pretend"
`;

const CALLED_WORKFLOW_WITH_OVERRIDE = `
name: probe-test
on:
  workflow_call:
permissions:
  id-token: write
  contents: read

jobs:
  behaviour-test:
    permissions:
      contents: read
      issues: write
    runs-on: ubuntu-24.04
    steps:
      - run: echo hi
`;

const CALLER_WORKFLOW_INSUFFICIENT = `
name: deploy
on:
  push:
permissions:
  id-token: write
  contents: read

jobs:
  web-test:
    needs:
      - names
    uses: ./.github/workflows/probe-test.yml
    permissions:
      contents: read
      packages: read
      id-token: write
    with:
      environment-name: ci
`;

const CALLER_WORKFLOW_SUFFICIENT = `
name: deploy
on:
  push:

jobs:
  web-test:
    uses: ./.github/workflows/probe-test.yml
    permissions:
      contents: read
      issues: write
`;

const NON_CALLABLE_WORKFLOW = `
name: some-tool
on:
  push:
jobs:
  build:
    runs-on: ubuntu-24.04
    steps:
      - run: echo hi
`;

describe("parseWorkflow", () => {
  test("detects the workflow_call trigger", () => {
    expect(parseWorkflow(CALLED_WORKFLOW).hasWorkflowCall).toBe(true);
    expect(parseWorkflow(NON_CALLABLE_WORKFLOW).hasWorkflowCall).toBe(false);
  });

  test("reads the workflow-level permissions default", () => {
    const parsed = parseWorkflow(CALLED_WORKFLOW);
    expect(parsed.workflowPermissions).toBeInstanceOf(Map);
    expect(Object.fromEntries(parsed.workflowPermissions)).toEqual({ "id-token": "write", "contents": "read" });
  });

  test("reads a job's own permissions override, distinct from the workflow default", () => {
    const parsed = parseWorkflow(CALLED_WORKFLOW_WITH_OVERRIDE);
    expect(parsed.jobs["behaviour-test"].permissions).toBeInstanceOf(Map);
    expect(Object.fromEntries(parsed.jobs["behaviour-test"].permissions)).toEqual({ contents: "read", issues: "write" });
  });

  test("a job with no override carries a null permissions value, not the workflow default", () => {
    const parsed = parseWorkflow(CALLED_WORKFLOW);
    expect(parsed.jobs["behaviour-test"].permissions).toBeNull();
  });

  test("does not mistake run-block text for a 'uses:' or 'permissions:' key", () => {
    const parsed = parseWorkflow(CALLED_WORKFLOW);
    expect(parsed.jobs["behaviour-test"].usesCalls).toEqual([]);
  });

  test("reads a job-level 'uses:' call to a local reusable workflow", () => {
    const parsed = parseWorkflow(CALLER_WORKFLOW_INSUFFICIENT);
    expect(parsed.jobs["web-test"].usesCalls).toEqual([expect.objectContaining({ target: "./.github/workflows/probe-test.yml" })]);
  });
});

describe("findViolations", () => {
  test("flags a called job's permissions override that the caller does not grant", () => {
    const workflowsByFile = {
      "probe-test.yml": parseWorkflow(CALLED_WORKFLOW_WITH_OVERRIDE),
      "deploy.yml": parseWorkflow(CALLER_WORKFLOW_INSUFFICIENT),
    };
    const findings = findViolations(workflowsByFile);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      callerFile: "deploy.yml",
      callerJobId: "web-test",
      calledFile: "probe-test.yml",
      calledJobId: "behaviour-test",
      scope: "issues",
      neededLevel: "write",
      grantedLevel: "none",
    });
  });

  test("passes when the caller grants everything the called job's override needs", () => {
    const workflowsByFile = {
      "probe-test.yml": parseWorkflow(CALLED_WORKFLOW_WITH_OVERRIDE),
      "deploy.yml": parseWorkflow(CALLER_WORKFLOW_SUFFICIENT),
    };
    expect(findViolations(workflowsByFile)).toEqual([]);
  });

  test("does not flag a called job with no permissions override, regardless of the called workflow's own default", () => {
    // CALLED_WORKFLOW's top-level permissions ask for id-token: write, which
    // CALLER_WORKFLOW_INSUFFICIENT's job does not grant — but no job in
    // CALLED_WORKFLOW overrides permissions, so there is no independent request
    // to check: the job simply inherits whatever the caller grants.
    const workflowsByFile = {
      "probe-test.yml": parseWorkflow(CALLED_WORKFLOW),
      "deploy.yml": parseWorkflow(CALLER_WORKFLOW_INSUFFICIENT),
    };
    expect(findViolations(workflowsByFile)).toEqual([]);
  });

  test("ignores a 'uses:' call to a file with no workflow_call trigger", () => {
    const workflowsByFile = {
      "some-tool.yml": parseWorkflow(NON_CALLABLE_WORKFLOW),
      "deploy.yml": parseWorkflow(CALLER_WORKFLOW_INSUFFICIENT.replace("probe-test.yml", "some-tool.yml")),
    };
    expect(findViolations(workflowsByFile)).toEqual([]);
  });

  test("resolves a caller's effective permissions from its own workflow-level default when the job does not override", () => {
    const callerNoJobOverride = `
name: deploy
on:
  push:
permissions:
  contents: read
  issues: write

jobs:
  web-test:
    uses: ./.github/workflows/probe-test.yml
`;
    const workflowsByFile = {
      "probe-test.yml": parseWorkflow(CALLED_WORKFLOW_WITH_OVERRIDE),
      "deploy.yml": parseWorkflow(callerNoJobOverride),
    };
    expect(findViolations(workflowsByFile)).toEqual([]);
  });

  test("falls back to GitHub's default (contents: read only) when neither the caller job nor its workflow declare permissions", () => {
    const callerNoPermissionsAtAll = `
name: deploy
on:
  push:

jobs:
  web-test:
    uses: ./.github/workflows/probe-test.yml
`;
    const workflowsByFile = {
      "probe-test.yml": parseWorkflow(CALLED_WORKFLOW_WITH_OVERRIDE),
      "deploy.yml": parseWorkflow(callerNoPermissionsAtAll),
    };
    const findings = findViolations(workflowsByFile);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ scope: "issues", neededLevel: "write", grantedLevel: "none" });
  });

  test("treats 'permissions: write-all' as covering every scope the called job needs", () => {
    const callerWriteAll = `
name: deploy
on:
  push:

jobs:
  web-test:
    uses: ./.github/workflows/probe-test.yml
    permissions: write-all
`;
    const workflowsByFile = {
      "probe-test.yml": parseWorkflow(CALLED_WORKFLOW_WITH_OVERRIDE),
      "deploy.yml": parseWorkflow(callerWriteAll),
    };
    expect(findViolations(workflowsByFile)).toEqual([]);
  });

  test("treats 'permissions: read-all' as insufficient for a called job that needs a write scope", () => {
    const callerReadAll = `
name: deploy
on:
  push:

jobs:
  web-test:
    uses: ./.github/workflows/probe-test.yml
    permissions: read-all
`;
    const workflowsByFile = {
      "probe-test.yml": parseWorkflow(CALLED_WORKFLOW_WITH_OVERRIDE),
      "deploy.yml": parseWorkflow(callerReadAll),
    };
    const findings = findViolations(workflowsByFile);
    expect(findings).toHaveLength(1);
    expect(findings[0].scope).toBe("issues");
  });

  test("walks a nested caller: A calls B, B calls C, C's override must trace back through B's grant", () => {
    const workflowC = CALLED_WORKFLOW_WITH_OVERRIDE; // needs issues: write
    const workflowB = `
name: middle
on:
  workflow_call:

jobs:
  relay:
    uses: ./.github/workflows/c.yml
    permissions:
      contents: read
`;
    const workflowA = `
name: top
on:
  push:

jobs:
  entry:
    uses: ./.github/workflows/b.yml
    permissions:
      contents: read
      issues: write
`;
    const workflowsByFile = {
      "c.yml": parseWorkflow(workflowC),
      "b.yml": parseWorkflow(workflowB),
      "a.yml": parseWorkflow(workflowA),
    };
    const findings = findViolations(workflowsByFile);
    // b.yml's 'relay' job grants c.yml's job only contents: read, regardless of what
    // a.yml grants b.yml's own entry job — the shortfall is on the B -> C edge.
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ callerFile: "b.yml", callerJobId: "relay", calledFile: "c.yml", scope: "issues" });
  });
});

describe("loadWorkflows and run, against the repository's real workflows", () => {
  const workflowsDir = join(process.cwd(), ".github", "workflows");

  test("parses every real workflow file without throwing", () => {
    const workflowsByFile = loadWorkflows(workflowsDir);
    const filesOnDisk = readdirSync(workflowsDir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
    expect(Object.keys(workflowsByFile).sort()).toEqual(filesOnDisk.sort());
  });

  test("finds no nested-permission violations in the current tree", () => {
    const workflowsByFile = loadWorkflows(workflowsDir);
    expect(findViolations(workflowsByFile)).toEqual([]);
  });

  test("run() returns 0 against the current tree", () => {
    expect(run(workflowsDir)).toBe(0);
  });
});
