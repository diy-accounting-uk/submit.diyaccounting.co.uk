#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// scripts/silence-deployment-alarms.mjs
//
// Writes the alarm-silence marker for one deployment and disables actions
// on its alarms, the same call a teardown's Lambda path makes for itself.
// The two destroy workflows call this before they delete anything, so the
// alarm-to-GitHub-issue and Telegram-forwarder routers stay quiet for a
// normal teardown. See app/lib/alarmSilence.js for the marker and its TTL.
//
//   node scripts/silence-deployment-alarms.mjs --env ci --deployment ci-claudeboa

import { fileURLToPath } from "node:url";
import { SSMClient } from "@aws-sdk/client-ssm";
import { CloudWatchClient } from "@aws-sdk/client-cloudwatch";

import { resolveAlarmEnv } from "../app/lib/alarmName.js";
import { silenceDeployment } from "../app/lib/alarmSilence.js";

export function parseArgs(argv) {
  const opts = { env: undefined, deployment: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--env":
        opts.env = argv[++i];
        break;
      case "--deployment":
        opts.deployment = argv[++i];
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!opts.env) throw new Error("--env is required");
  if (!opts.deployment) throw new Error("--deployment is required");
  return opts;
}

/**
 * A deployment name carries its env prefix (e.g. "prod-a0f41c7"); an
 * alarm's own name carries only the slug after it, so the prefix is
 * stripped here to match what the routers look up.
 */
export function stripEnvPrefix(deploymentName) {
  const env = resolveAlarmEnv(deploymentName, null);
  return env ? deploymentName.slice(env.length + 1) : deploymentName;
}

export async function main(argv) {
  const opts = parseArgs(argv);
  const region = process.env.AWS_REGION || "eu-west-2";
  const ssmClient = new SSMClient({ region });
  const cloudWatchClient = new CloudWatchClient({ region });

  const result = await silenceDeployment({
    ssmClient,
    cloudWatchClient,
    env: opts.env,
    deployment: stripEnvPrefix(opts.deployment),
    now: new Date(),
  });

  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
