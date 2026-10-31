#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability DEV-54 Run a behaviour suite with synthetic account or report
// - **Use when:** a behaviour suite runs with the synthetic HMRC account, or writes and publishes its test report after the run.
// - **Does:** run-behaviour.mjs runs `npm run test:<suite>-<lane>` for any suite, sets HMRC_ACCOUNT=synthetic on `--synthetic`, and on `--report` runs `test-report` for the suite's behaviour-tests file and publishes the result to web-test-local. The lane scripts stay one per suite and lane.
// - **Run:** `npm run test:behaviour -- <suite> <simulator|proxy|proxyRunning|ci|prod> [--synthetic] [--report]`; `npm run test:behaviour -- getVatObligationsBehaviour proxy --synthetic --report`
// - **Entry:** `scripts/run-behaviour.mjs`
// - **Files:** scripts/run-behaviour.mjs
// - **Keywords:** behaviour test, synthetic account, test report, lane, suite
// - **Related:** DEV-19
// @end-capability

// Runs one behaviour suite through its lane script (npm run test:<suite>-<lane>), with two options:
//   --synthetic  sets HMRC_ACCOUNT=synthetic for the run
//   --report     after the run, writes the suite's test report and publishes it to web-test-local
// The exit code is the suite's.
//
//   npm run test:behaviour -- <suite> <lane> [--synthetic] [--report]
//   npm run test:behaviour -- getVatObligationsBehaviour proxy --synthetic --report
//   npm run test:behaviour -- submitVatBehaviour proxyRunning

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const BEHAVIOUR_LANES = ["simulator", "proxy", "proxyRunning", "ci", "prod"];

export function findTestFile(suite, directory = "behaviour-tests") {
  const fileName = `${suite.replace(/Behaviour$/, "")}.behaviour.test.js`;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const found = findTestFile(suite, path);
      if (found) return found;
    } else if (entry.name === fileName) {
      return path;
    }
  }
  return null;
}

export function parseArguments(argv) {
  const flags = argv.filter((argument) => argument.startsWith("--"));
  const [suite, lane] = argv.filter((argument) => !argument.startsWith("--"));
  const unknown = flags.filter((flag) => !["--synthetic", "--report"].includes(flag));
  if (unknown.length) throw new Error(`Unknown option ${unknown.join(", ")}`);
  if (!suite) throw new Error("A suite is required");
  if (!BEHAVIOUR_LANES.includes(lane)) throw new Error(`Lane must be one of ${BEHAVIOUR_LANES.join(", ")}`);
  return { suite, lane, synthetic: flags.includes("--synthetic"), report: flags.includes("--report") };
}

export function main(argv = process.argv.slice(2)) {
  const { suite, lane, synthetic, report } = parseArguments(argv);
  const env = synthetic ? { ...process.env, HMRC_ACCOUNT: "synthetic" } : process.env;
  const run = spawnSync("npm", ["run", `test:${suite}-${lane}`], { stdio: "inherit", env });
  const exitCode = run.status ?? 1;
  if (!report) return exitCode;
  const testFile = findTestFile(suite);
  if (!testFile) throw new Error(`No behaviour-tests file named ${suite.replace(/Behaviour$/, "")}.behaviour.test.js`);
  const reportRun = spawnSync(
    "npm",
    ["run", "test-report", "--", "--testName", suite, "--testFile", testFile, "--envFile", `.env.${lane}`],
    {
      stdio: "inherit",
    },
  );
  if (reportRun.status === 0) {
    spawnSync("./scripts/publish-web-test-local.sh", [`target/behaviour-test-results/test-report-${suite}.json`, "web-test-local"], {
      stdio: "inherit",
    });
  }
  return exitCode;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exit(main());
  } catch (error) {
    console.error(`${error.message}\nUsage: npm run test:behaviour -- <suite> <${BEHAVIOUR_LANES.join("|")}> [--synthetic] [--report]`);
    process.exit(2);
  }
}
