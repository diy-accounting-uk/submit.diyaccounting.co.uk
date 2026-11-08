// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// supportNoticeDigestWorkflow.test.js -- support-notice-digest.yml runs in a public repository
// beside a private issue list, so its shape is pinned: the token reads issues only, the email
// address comes from a variable, and a run with no notice or a dry run sends nothing.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const text = readFileSync(resolve(ROOT, ".github/workflows/support-notice-digest.yml"), "utf8");
const workflow = load(text);
const steps = workflow.jobs.digest.steps;
const step = (name) => steps.find((s) => s.name === name);

describe("support-notice-digest.yml", () => {
  it("runs once a day and on dispatch, in the prod environment", () => {
    expect(workflow.on.schedule).toEqual([{ cron: "10 7 * * *" }]);
    expect(workflow.on.workflow_dispatch.inputs["dry-run"]).toMatchObject({ type: "boolean", default: false });
    expect(workflow.jobs.digest.environment).toBe("prod");
    expect(workflow.permissions).toEqual({});
  });

  it("mints a token that reads issues in the private repository and nothing more", () => {
    const token = step("Generate a token that reads issues in the private repository");
    expect(token.with["permission-issues"]).toBe("read");
    expect(token.with.repositories).toBe("private.diyaccounting.co.uk");
    expect(Object.keys(token.with).filter((key) => key.startsWith("permission-"))).toEqual(["permission-issues"]);
  });

  it("gives the token to the count step only", () => {
    const holders = steps.filter((s) => JSON.stringify(s.env ?? {}).includes("private-token"));
    expect(holders.map((s) => s.name)).toEqual(["Count the notices that wait"]);
  });

  it("assumes the AWS roles only when a notice waits and the run is not a dry run", () => {
    for (const name of ["Assume the AWS actions and deploy roles", "Put the notice digest request on the activity bus"]) {
      expect(step(name).if).toBe("steps.digest.outputs.count != '0' && !inputs.dry-run");
    }
  });

  it("takes the address from the operator notification variable, never from text", () => {
    expect(step("Put the notice digest request on the activity bus").env.OPERATOR_ADDRESS).toBe("${{ vars.SUBMIT_OPERATOR_NOTIFY_EMAIL }}");
    expect(text).not.toMatch(/[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/);
  });

  it("requests the notice-digest kind with no account reference", () => {
    const run = step("Put the notice digest request on the activity bus").run;
    expect(run).toContain('kind: "notice-digest"');
    expect(run).not.toMatch(/userId|userSub|hashedSub/);
  });

  it("uploads no artifact and writes no step summary", () => {
    expect(text).not.toMatch(/upload-artifact|GITHUB_STEP_SUMMARY/);
  });
});
