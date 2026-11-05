// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/workflowTeePipefail.test.js

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { load } from "js-yaml";

const workflowDirectory = ".github/workflows";

// Steps whose pipe into tee may pass when the piped command fails, keyed "<file>::<step name>".
const allowedToPass = {};

const pipefailLine = /^\s*set\s+(-[a-z]+\s+)*-[a-z]*o\s+pipefail\b|^\s*set\s+-[a-z]*o\s+pipefail\b/;
const pipesIntoTee = /\|\s*tee\b/;

function runsUnderBash(workflow, job, step) {
  const shell = step.shell ?? job.defaults?.run?.shell ?? workflow.defaults?.run?.shell;
  return typeof shell === "string" && /^bash\b/.test(shell);
}

// An echo or printf cannot fail, so pipefail changes nothing for it.
function producerIsEcho(line) {
  const producer = line.slice(0, line.search(pipesIntoTee));
  const lastCommand = producer.split(";").pop().trim();
  return /^(echo|printf)\b/.test(lastCommand);
}

function unsafePipes(workflow, job, step) {
  if (!step.run || runsUnderBash(workflow, job, step)) return [];
  const unsafe = [];
  let pipefailSet = false;
  for (const line of step.run.split("\n")) {
    if (pipefailLine.test(line)) pipefailSet = true;
    if (pipesIntoTee.test(line) && !pipefailSet && !producerIsEcho(line)) unsafe.push(line.trim());
  }
  return unsafe;
}

function findUnsafeSteps() {
  const found = [];
  for (const file of readdirSync(workflowDirectory).filter((name) => /\.ya?ml$/.test(name))) {
    const workflow = load(readFileSync(`${workflowDirectory}/${file}`, "utf8"));
    for (const job of Object.values(workflow.jobs ?? {})) {
      for (const step of job.steps ?? []) {
        const key = `${file}::${step.name ?? step.id ?? "(unnamed)"}`;
        if (unsafePipes(workflow, job, step).length > 0 && !(key in allowedToPass)) found.push(key);
      }
    }
  }
  return found;
}

describe("workflow steps that pipe into tee", () => {
  it("fail the step when the piped command fails", () => {
    expect(findUnsafeSteps()).toEqual([]);
  });

  it("recognises an unsafe block", () => {
    const workflow = {};
    const job = {};
    expect(unsafePipes(workflow, job, { run: "node a.js 2>&1 | tee a.log" })).toHaveLength(1);
    expect(unsafePipes(workflow, job, { run: "set -o pipefail\nnode a.js | tee a.log" })).toHaveLength(0);
    expect(unsafePipes(workflow, job, { run: "set -euo pipefail\nnode a.js | tee a.log" })).toHaveLength(0);
    expect(unsafePipes(workflow, job, { run: "node a.js | tee a.log", shell: "bash" })).toHaveLength(0);
    expect(unsafePipes({ defaults: { run: { shell: "bash" } } }, job, { run: "node a.js | tee a.log" })).toHaveLength(0);
    expect(unsafePipes(workflow, job, { run: 'echo "a=b" | tee -a "$GITHUB_OUTPUT"' })).toHaveLength(0);
    expect(unsafePipes(workflow, job, { run: "node a.js | tee a.log\nset -o pipefail" })).toHaveLength(1);
  });

  it("lists only steps that exist in a workflow", () => {
    for (const key of Object.keys(allowedToPass)) {
      const [file, name] = key.split("::");
      const workflow = load(readFileSync(`${workflowDirectory}/${file}`, "utf8"));
      const names = Object.values(workflow.jobs).flatMap((job) => (job.steps ?? []).map((step) => step.name));
      expect(names, key).toContain(name);
      expect(allowedToPass[key], key).toBeTruthy();
    }
  });

  it("pipes the blob key rotation script from exactly two steps", () => {
    const workflow = load(readFileSync(`${workflowDirectory}/mcp-blob-key-rotate.yml`, "utf8"));
    const steps = Object.values(workflow.jobs).flatMap((job) => job.steps ?? []);
    const piped = steps.filter((step) => /mcp-blob-key-rotate\.js[^\n]*\|\s*tee/.test(step.run ?? ""));
    expect(piped.length).toBe(2);
  });
});
