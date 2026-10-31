#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-136 Retrieve CloudFormation stack outputs
// - **Use when:** a script or test needs a named stack's output values, such as a URL, table name or ARN.
// - **Does:** stack-output.js queries a named CloudFormation stack and extracts its output values, such as URLs, table names and ARNs, for scripts and tests to consume.
// - **Run:** `node scripts/stack-output.js <stack-name> <output-key>`
// - **Entry:** `scripts/stack-output.js`
// - **Files:** scripts/stack-output.js
// - **Keywords:** stack output, cloudformation, output value, arn lookup, table name lookup
// @end-capability

//
// Print one CloudFormation stack output's value, for workflow jobs that run inside the
// Playwright container where the aws CLI is not installed but the SDK is.
//
// Usage: node scripts/stack-output.js <stack-name> <output-key>

import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";

const [stackName, outputKey] = process.argv.slice(2);
if (!stackName || !outputKey) {
  console.error("Usage: node scripts/stack-output.js <stack-name> <output-key>");
  process.exit(1);
}

const response = await new CloudFormationClient({}).send(new DescribeStacksCommand({ StackName: stackName }));
const stack = response.Stacks?.[0];
if (!stack) {
  console.error(`Stack ${stackName} not found`);
  process.exit(1);
}
const output = stack.Outputs?.find((o) => o.OutputKey === outputKey);
if (!output?.OutputValue) {
  console.error(`Stack ${stackName} has no ${outputKey} output`);
  process.exit(1);
}
process.stdout.write(`${output.OutputValue}\n`);
