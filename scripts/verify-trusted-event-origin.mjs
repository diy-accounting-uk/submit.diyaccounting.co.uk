#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-186 Verify a trusted-event issue against its source record
// - **Use when:** an issue in the private repository claims to be a trusted event and a workflow must confirm that the ops App opened it, that the ledger holds its body unchanged, and that the source still shows the fact.
// - **Does:** verify-trusted-event-origin.mjs invokes the trusted event function in verify mode for one issue number and writes the answer to the file in `--out`. It prints only `verified=true` or `verified=false`, because the reason can hold a budget figure. It fails closed: a bad argument, an invoke error, a function error or an answer without a boolean `verified` all return verified false, and the exit code is 0 only for verified true.
// - **Run:** `node scripts/verify-trusted-event-origin.mjs --environment prod --issue 123 --out /tmp/verify.json`
// - **Entry:** `scripts/verify-trusted-event-origin.mjs`
// - **Files:** scripts/verify-trusted-event-origin.mjs, app/unit-tests/scripts/verifyTrustedEventOrigin.test.js
// - **Keywords:** trusted event, verify issue, fail closed, source check, lambda invoke, maintainer-review, private issue
// - **Related:** OPS-185, OPS-78, OPS-187
// @end-capability

// scripts/verify-trusted-event-origin.mjs
//
// The caller of the source check that runs inside the trusted event function. The function already
// holds every read the check needs, so this script needs only lambda:InvokeFunction on that one
// function. The repository is public: the reason goes to the --out file and never to stdout.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const ENVIRONMENTS = ["ci", "prod"];
const REGION = "eu-west-2";

export const functionNameFor = (environment) => `${environment}-env-trusted-event-to-github-issue`;

export function parseArgs(argv) {
  const opts = { environment: undefined, issue: undefined, out: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--environment":
        opts.environment = argv[++i];
        break;
      case "--issue":
        opts.issue = argv[++i];
        break;
      case "--out":
        opts.out = argv[++i];
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

const unverified = (reason) => ({ verified: false, strength: "none", reason });

/**
 * Invokes verify mode and returns the function's answer, or an unverified result when the call
 * fails in any way. Never throws.
 */
export async function invokeVerify({ environment, issueNumber, client = new LambdaClient({ region: REGION }) }) {
  try {
    const response = await client.send(
      new InvokeCommand({
        FunctionName: functionNameFor(environment),
        InvocationType: "RequestResponse",
        Payload: JSON.stringify({ verify: { issueNumber } }),
      }),
    );
    if (response.FunctionError) return unverified(`verify call failed: function error ${response.FunctionError}`);
    const answer = JSON.parse(new TextDecoder().decode(response.Payload));
    if (typeof answer?.verified !== "boolean") return unverified("verify call failed: the answer has no boolean verified");
    return {
      verified: answer.verified,
      strength: typeof answer.strength === "string" ? answer.strength : "none",
      reason: String(answer.reason ?? ""),
    };
  } catch (error) {
    return unverified(`verify call failed: ${error.message}`);
  }
}

/**
 * Resolves to `{ verified, strength, reason }` and never throws. Writes the result to --out and
 * prints only `verified=<boolean>`.
 */
export async function main(argv, deps = {}) {
  let result;
  let out;
  try {
    const opts = parseArgs(argv);
    out = opts.out;
    const issueNumber = Number(opts.issue);
    if (!ENVIRONMENTS.includes(opts.environment)) {
      result = unverified("--environment must be ci or prod");
    } else if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
      result = unverified("--issue must be a positive issue number");
    } else {
      result = await invokeVerify({ environment: opts.environment, issueNumber, client: deps.client });
    }
  } catch (error) {
    result = unverified(error.message);
  }

  if (out) {
    try {
      writeFileSync(out, JSON.stringify(result, null, 2));
    } catch (error) {
      result = unverified(`the result file could not be written: ${error.message}`);
    }
  }
  console.log(`verified=${result.verified}`);
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2))
    .then((result) => {
      process.exitCode = result.verified ? 0 : 1;
    })
    .catch(() => {
      console.log("verified=false");
      process.exitCode = 1;
    });
}
