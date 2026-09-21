// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// supportTriageWorkflow.test.js -- support-triage.yml only runs unattended on a freshly opened
// issue when its `issues:` trigger is scoped to `opened`. A trigger widened to include `edited`
// or `labeled` would let anyone who can edit or relabel a support issue re-run the triage agent
// against text they control, so this test pins that one line the same way
// deployEnvironmentWorkflowPaths.test.js pins its own workflow's shape.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const WORKFLOW_PATH = ".github/workflows/support-triage.yml";

function readWorkflow() {
  return readFileSync(resolve(ROOT, WORKFLOW_PATH), "utf8");
}

// Reads the `on.issues.types` value, whether it is written as a flow-style array
// (`types: [opened]`) or a block list.
function issuesTypes(workflowText) {
  const flowMatch = workflowText.match(/\n {2}issues:\n {4}types:\s*\[([^\]]*)\]/);
  if (flowMatch) {
    return flowMatch[1]
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  const blockMatch = workflowText.match(/\n {2}issues:\n {4}types:\n((?: {6}- .*\n)+)/);
  if (!blockMatch) throw new Error(`could not find on.issues.types in ${WORKFLOW_PATH}`);
  return [...blockMatch[1].matchAll(/^ {6}- (.+)$/gm)].map((match) => match[1].trim());
}

describe("support-triage.yml", () => {
  const workflowText = readWorkflow();

  it("parses as a workflow with a jobs: block", () => {
    expect(workflowText).toMatch(/\njobs:\n/);
  });

  it("triggers on issues: types: [opened] only", () => {
    expect(issuesTypes(workflowText)).toEqual(["opened"]);
  });
});
