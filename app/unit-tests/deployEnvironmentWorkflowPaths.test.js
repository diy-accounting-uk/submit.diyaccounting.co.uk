// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// deployEnvironmentWorkflowPaths.test.js -- deploy-environment.yml only runs on a push that
// touches a path in its own `paths:` filter. That filter lists environment stack source files
// by name, so a stack the workflow deploys but the filter does not list can change and ship only
// when some other watched path happens to change in the same push. This test parses the workflow
// and checks that every `-env-<Name>Stack` the workflow deploys has its Java source watched, so
// the two lists cannot drift apart again without a failing test.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const WORKFLOW_PATH = ".github/workflows/deploy-environment.yml";
const STACKS_DIR = "infra/main/java/co/uk/diyaccounting/submit/stacks/";

// EcrUE1Stack is the same EcrStack construct instantiated a second time for us-east-1 (see
// SubmitEnvironment.java and SubmitSharedNames.java) -- it has no EcrUE1Stack.java of its own, so
// its watched source is EcrStack.java.
const SOURCE_FILE_OVERRIDES = {
  EcrUE1Stack: "EcrStack.java",
};

function readWorkflow() {
  return readFileSync(resolve(ROOT, WORKFLOW_PATH), "utf8");
}

// The stack names the workflow deploys, read from every `-env-<Name>Stack` occurrence (a
// `stackName:` input or a `cdk deploy` argument).
function deployedStackNames(workflowText) {
  const names = new Set();
  for (const match of workflowText.matchAll(/-env-([A-Za-z0-9]+Stack)\b/g)) {
    names.add(match[1]);
  }
  return names;
}

// The paths the push trigger watches, read from the `on.push.paths` block.
function watchedPaths(workflowText) {
  const block = workflowText.match(/\n {4}paths:\n((?: {6}.*\n)+)/);
  if (!block) throw new Error(`could not find paths: block in ${WORKFLOW_PATH}`);
  return [...block[1].matchAll(/^ {6}- '([^']+)'$/gm)].map((match) => match[1]);
}

// Whether a watched path covers a given source file: an exact match, or a `dir/**` glob the file
// sits under.
function covers(watchedPath, sourceFile) {
  if (watchedPath === sourceFile) return true;
  if (watchedPath.endsWith("/**")) return sourceFile.startsWith(watchedPath.slice(0, -2));
  return false;
}

describe("deploy-environment.yml paths filter", () => {
  it("watches the source file for every -env-<Name>Stack the workflow deploys", () => {
    const workflowText = readWorkflow();
    const paths = watchedPaths(workflowText);

    const offenders = [];
    for (const stackName of deployedStackNames(workflowText)) {
      const sourceFile = STACKS_DIR + (SOURCE_FILE_OVERRIDES[stackName] ?? `${stackName}.java`);
      if (!paths.some((watchedPath) => covers(watchedPath, sourceFile))) {
        offenders.push(`${stackName}: ${sourceFile} is not in the paths: filter`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
