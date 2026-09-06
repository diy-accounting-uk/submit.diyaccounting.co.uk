// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/lib/alarmSilence.js
//
// A deployment's teardown writes one SSM parameter before it deletes
// anything; the alarm-to-GitHub-issue and Telegram-forwarder routers read it
// per event and drop an ALARM state change for a silenced deployment. This
// stops a normal teardown's alarm noise without touching an alarm's own
// ActionsEnabled - CloudWatch still emits the state-change event on every
// teardown, so the suppression has to live where the event is consumed. See
// app/lib/alarmName.js for the deployment slug an alarm name carries.

import { PutParameterCommand, GetParameterCommand } from "@aws-sdk/client-ssm";
import { DescribeAlarmsCommand, DisableAlarmActionsCommand } from "@aws-sdk/client-cloudwatch";
import { createLogger } from "./logger.js";

const logger = createLogger({ source: "app/lib/alarmSilence.js" });

export const SILENCE_TTL_HOURS = 2;
export const SILENCE_MAX_HOURS = 12;

const HOUR_MS = 60 * 60 * 1000;
const DESCRIBE_ALARMS_BATCH_SIZE = 100;

export function silenceParameterName({ env, deployment }) {
  return `/submit/${env}/alarm-silence/${deployment}`;
}

async function describeAlarmNamesByPrefix(cloudWatchClient, prefix) {
  const alarmNames = [];
  let nextToken;
  do {
    const page = await cloudWatchClient.send(
      new DescribeAlarmsCommand({ AlarmNamePrefix: prefix, NextToken: nextToken }),
    );
    for (const alarm of page.MetricAlarms ?? []) alarmNames.push(alarm.AlarmName);
    for (const alarm of page.CompositeAlarms ?? []) alarmNames.push(alarm.AlarmName);
    nextToken = page.NextToken;
  } while (nextToken);
  return alarmNames;
}

function batch(items, size) {
  const batches = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}

/**
 * Write (or extend) the silence marker for a deployment, then disable
 * actions on every alarm and composite alarm carrying that deployment's
 * slug. Never throws: teardown must go on when silencing fails, so any
 * error is logged and swallowed.
 */
export async function silenceDeployment({ ssmClient, cloudWatchClient, env, deployment, now }) {
  try {
    const parameterName = silenceParameterName({ env, deployment });
    const nowMs = now.getTime();

    let firstSilencedAt = now;
    try {
      const existing = await ssmClient.send(new GetParameterCommand({ Name: parameterName }));
      const existingValue = JSON.parse(existing.Parameter?.Value ?? "null");
      if (existingValue?.firstSilencedAt) firstSilencedAt = new Date(existingValue.firstSilencedAt);
    } catch (error) {
      if (error.name !== "ParameterNotFound") {
        logger.warn({ message: "Could not read existing alarm-silence parameter, treating as unset", parameterName, error: error.message });
      }
    }

    const maxExpiresAtMs = firstSilencedAt.getTime() + SILENCE_MAX_HOURS * HOUR_MS;
    if (nowMs >= maxExpiresAtMs) {
      logger.warn({ message: "Deployment already silenced for the maximum window, not extending", parameterName });
      return { silenced: false, reason: "max-window-reached" };
    }

    const expiresAtMs = Math.min(nowMs + SILENCE_TTL_HOURS * HOUR_MS, maxExpiresAtMs);
    const expiresAt = new Date(expiresAtMs).toISOString();

    await ssmClient.send(
      new PutParameterCommand({
        Name: parameterName,
        Type: "String",
        Overwrite: true,
        Value: JSON.stringify({ firstSilencedAt: firstSilencedAt.toISOString(), expiresAt }),
      }),
    );

    for (const prefix of [`${deployment}-`, `check-${deployment}-`]) {
      const alarmNames = await describeAlarmNamesByPrefix(cloudWatchClient, prefix);
      for (const namesBatch of batch(alarmNames, DESCRIBE_ALARMS_BATCH_SIZE)) {
        if (namesBatch.length === 0) continue;
        await cloudWatchClient.send(new DisableAlarmActionsCommand({ AlarmNames: namesBatch }));
      }
    }

    logger.info({ message: "Silenced deployment's alarms", parameterName, expiresAt });
    return { silenced: true, expiresAt };
  } catch (error) {
    logger.warn({ message: "Failed to silence deployment's alarms, continuing teardown", env, deployment, error: error.message });
    return { silenced: false, reason: error.message };
  }
}

/**
 * Whether a deployment's alarms are currently silenced. False for a null
 * deployment (an environment-scoped alarm carries no slug and is never
 * silenced), false when no marker exists or it has expired or fails to
 * parse, and false rather than a thrown error when SSM itself fails.
 */
export async function isDeploymentSilenced({ ssmClient, env, deployment, now }) {
  if (!deployment) return false;

  const parameterName = silenceParameterName({ env, deployment });
  try {
    const result = await ssmClient.send(new GetParameterCommand({ Name: parameterName }));
    const value = JSON.parse(result.Parameter?.Value ?? "null");
    if (!value?.expiresAt) return false;
    return new Date(value.expiresAt).getTime() > now.getTime();
  } catch (error) {
    if (error.name !== "ParameterNotFound") {
      logger.warn({ message: "Could not read alarm-silence parameter, treating as not silenced", parameterName, error: error.message });
    }
    return false;
  }
}
