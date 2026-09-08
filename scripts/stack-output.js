#!/usr/bin/env node
// SPDX-FileCopyrightText: 2025-2026 DIY Accounting Limited
// SPDX-License-Identifier: AGPL-3.0-or-later
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
