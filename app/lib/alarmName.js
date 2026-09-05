// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/lib/alarmName.js
//
// Shared parsing for CloudWatch alarm and CloudFormation stack names used by
// the ops Lambdas. Every name carries an environment prefix (`ci-` or
// `prod-`). Per-deployment resources add a deployment slug between the
// environment and `-app-` (e.g. `prod-a0f41c7-app-api-5xx`); environment-level
// resources have no slug (e.g. `prod-env-salt-secret-unexpected-read`).

const ENV_PREFIX = /^(ci|prod)-/;
const DEPLOYMENT_SCOPED = /^(ci|prod)-[^-]+-app-(.+)$/;

/**
 * Extract the environment (`ci` or `prod`) from a resource name, falling
 * back to the given default when the prefix isn't present.
 */
export function resolveAlarmEnv(name, fallback) {
  const match = (name || "").match(ENV_PREFIX);
  return match ? match[1] : fallback;
}

/**
 * Collapse a deployment-scoped alarm name to its family key by dropping the
 * deployment slug, so the same check across every deployment of an
 * environment shares one key. Environment-scoped names (no slug) are
 * returned unchanged.
 *
 *   prod-a0f41c7-app-api-5xx             -> prod-app-api-5xx
 *   ci-claudeboa-app-hmrc-stack-health    -> ci-app-hmrc-stack-health
 *   prod-env-salt-secret-unexpected-read  -> prod-env-salt-secret-unexpected-read
 */
export function alarmFamilyKey(alarmName) {
  const match = (alarmName || "").match(DEPLOYMENT_SCOPED);
  if (!match) return alarmName;
  const [, env, rest] = match;
  return `${env}-app-${rest}`;
}
