// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability SITE-26 Check that an API request came through CloudFront
// - **Use when:** a request can reach an API route without CloudFront, or the CloudFront origin secret must roll or start to refuse.
// - **Does:** originVerifiedEntry.js is the image command of every API Lambda. It compares the x-diya-origin-verify header that CloudFront adds with the current and previous values in the <env>/submit/origin/verify secret, removes the header from the event, and calls the handler that ORIGIN_VERIFY_TARGET_HANDLER names. A failed check writes a Submit/OriginVerify metric. With ORIGIN_VERIFY_ENFORCE=true (.env.ci, .env.prod) a failed check also refuses the request with a JSON response. Only API Gateway events are checked, so a queue, a schedule and the local Express server are not affected. To roll the value, set ORIGIN_VERIFY_SECRET_PREVIOUS to the old value and ORIGIN_VERIFY_SECRET to the new value, run deploy-environment.yml, deploy, then clear ORIGIN_VERIFY_SECRET_PREVIOUS and run deploy-environment.yml.
// - **Run:** no command; see Does and Entry
// - **Entry:** `app/lib/originVerifiedEntry.js:ingestHandler`; `infra/main/java/co/uk/diyaccounting/submit/utils/OriginVerifyHelper.java`
// - **Files:** app/lib/originVerifiedEntry.js, app/unit-tests/lib/originVerifiedEntry.test.js, infra/main/java/co/uk/diyaccounting/submit/utils/OriginVerifyHelper.java, infra/main/java/co/uk/diyaccounting/submit/stacks/EdgeStack.java, .github/workflows/deploy-env-secrets.yml, .github/workflows/deploy-cdk-stack.yml
// - **Keywords:** origin verify, cloudfront bypass, direct api gateway, execute-api, secret origin header, origin secret rotation
// - **Related:** SITE-02, SITE-07
// @end-capability

// app/lib/originVerifiedEntry.js

import { createHash, timingSafeEqual } from "node:crypto";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { createLogger } from "./logger.js";
import { emitMetric } from "./emfMetrics.js";

const logger = createLogger({ source: "app/lib/originVerifiedEntry.js" });

const ORIGIN_VERIFY_HEADER = "x-diya-origin-verify";
const METRICS_NAMESPACE = "Submit/OriginVerify";
const SECRET_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const FAILED_SECRET_READ_RETRY_MS = 30 * 1000;
const REPOSITORY_ROOT = new URL("../../", import.meta.url);

const secretsClient = new SecretsManagerClient({});
let acceptedDigests = [];
let nextSecretReadAtMs = 0;

function sha256(value) {
  return createHash("sha256").update(value).digest();
}

/**
 * The digests of the accepted header values. A failed read keeps the last values that were read,
 * because they stay valid proof of origin. The log carries the error name only: a JSON parse
 * message can quote the secret.
 */
async function readAcceptedDigests() {
  if (Date.now() < nextSecretReadAtMs) return acceptedDigests;
  try {
    const result = await secretsClient.send(new GetSecretValueCommand({ SecretId: process.env.ORIGIN_VERIFY_SECRET_NAME }));
    const { current, previous } = JSON.parse(result.SecretString);
    if (!current) throw new TypeError("The secret has no current value");
    acceptedDigests = [current, previous].filter(Boolean).map(sha256);
    nextSecretReadAtMs = Date.now() + SECRET_REFRESH_INTERVAL_MS;
  } catch (error) {
    logger.warn({ message: "Could not read the origin verify secret", errorName: error.name });
    nextSecretReadAtMs = Date.now() + FAILED_SECRET_READ_RETRY_MS;
  }
  return acceptedDigests;
}

function jsonRefusal(statusCode, message) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify({ message }),
  };
}

/**
 * Check an API Gateway event for the header that CloudFront adds, and remove the header so that
 * no handler can log it or pass it on. API Gateway sends header names in lower case.
 *
 * @returns {Promise<object|null>} the response that refuses the request, or null to continue
 */
export async function refusalForUnverifiedOrigin(event) {
  if (!event?.requestContext?.http) return null;

  const headers = event.headers ?? {};
  const presentedValue = headers[ORIGIN_VERIFY_HEADER];
  delete headers[ORIGIN_VERIFY_HEADER];

  const accepted = await readAcceptedDigests();
  if (presentedValue) {
    const presentedDigest = sha256(presentedValue);
    if (accepted.some((digest) => timingSafeEqual(digest, presentedDigest))) return null;
  }

  let metricName = "OriginHeaderMissing";
  if (accepted.length === 0) metricName = "OriginSecretUnavailable";
  else if (presentedValue) metricName = "OriginHeaderInvalid";
  emitMetric({ namespace: METRICS_NAMESPACE, metricName });
  logger.warn({ message: "Origin check failed", reason: metricName, path: event.rawPath });

  if (process.env.ORIGIN_VERIFY_ENFORCE !== "true") return null;
  if (accepted.length === 0) return jsonRefusal(503, "Service unavailable");
  return jsonRefusal(403, "Forbidden");
}

async function loadTargetHandler(handlerCommand) {
  const exportSeparator = handlerCommand.lastIndexOf(".");
  const moduleUrl = new URL(`${handlerCommand.slice(0, exportSeparator)}.js`, REPOSITORY_ROOT);
  const handlerModule = await import(moduleUrl.href);
  return handlerModule[handlerCommand.slice(exportSeparator + 1)];
}

const targetHandler = await loadTargetHandler(process.env.ORIGIN_VERIFY_TARGET_HANDLER);

export async function ingestHandler(event, lambdaContext) {
  const refusal = await refusalForUnverifiedOrigin(event);
  if (refusal) return refusal;
  return targetHandler(event, lambdaContext);
}
