// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/email/customerEmailSend.js

import { CognitoIdentityProviderClient, ListUsersCommand } from "@aws-sdk/client-cognito-identity-provider";
import { createLogger } from "../../lib/logger.js";
import { processSqsRecords } from "../../lib/sqsWorkerHelper.js";
import { classifyActor, publishActivityEvent, publishActivityFailureEvent } from "../../lib/activityAlert.js";
import { warmOperators } from "../../lib/operators.js";
import { emitMetric } from "../../lib/emfMetrics.js";
import { hashSub } from "../../services/subHasher.js";
import { getReceipt } from "../../data/dynamoDbReceiptRepository.js";
import { loadCatalogFromRoot } from "../../services/productCatalog.js";
import { buildCustomerEmail, buildOperatorCopy, buildPassAttachments } from "../../lib/customerEmailTemplates.js";
import { classifyAwsError, isRecipientAllowed, sendCustomerEmail } from "../../services/customerEmailSender.js";

const logger = createLogger({ source: "app/functions/email/customerEmailSend.js" });

const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || "eu-west-2" });

const OPERATOR_COPY_KINDS = new Set(["subscription-started", "pass-redeemed"]);
const SUB_PATTERN = /^[A-Za-z0-9-]+$/;
const REQUIRED_ENV = [
  "ENVIRONMENT_NAME",
  "ACTIVITY_BUS_NAME",
  "RECEIPTS_DYNAMODB_TABLE_NAME",
  "COGNITO_USER_POOL_ID",
  "DIY_SUBMIT_BASE_URL",
  "CUSTOMER_EMAIL_FROM",
  "CUSTOMER_EMAIL_CONFIGURATION_SET",
];

async function findAddress(userSub) {
  if (!userSub || !SUB_PATTERN.test(userSub)) return null;
  try {
    const result = await cognito.send(
      new ListUsersCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        Filter: `sub = "${userSub}"`,
        AttributesToGet: ["email"],
        Limit: 1,
      }),
    );
    return result.Users?.[0]?.Attributes?.find((attribute) => attribute.Name === "email")?.Value || null;
  } catch (err) {
    throw classifyAwsError(err);
  }
}

function recordOutcome({ outcome, kind, actor, hashedSub, receiptKind, failure }) {
  const detail = { kind, sendOutcome: outcome, ...(receiptKind ? { receiptKind } : {}), ...(hashedSub ? { hashedSub } : {}) };
  logger.info({ message: "Customer email outcome", kind, actor, outcome, failure });
  const dimensions = { Actor: actor };
  if (outcome === "sent") {
    emitMetric({ namespace: "Submit/Business", metricName: "CustomerEmailSent", dimensions });
    return publishActivityEvent({ event: "customer-email-sent", summary: `Customer email sent: ${kind}`, actor, detail });
  }
  if (outcome === "failed" || (outcome === "no-address" && actor === "customer")) {
    emitMetric({ namespace: "Submit/Business", metricName: "CustomerEmailFailure", dimensions });
    return publishActivityFailureEvent({
      event: "customer-email-failed",
      summary: `Customer email failed: ${kind}`,
      failure: failure || outcome,
      actor,
      detail,
    });
  }
  emitMetric({ namespace: "Submit/Business", metricName: "CustomerEmailSuppressed", dimensions });
  return publishActivityEvent({ event: "customer-email-suppressed", summary: `Customer email suppressed: ${kind}`, actor, detail });
}

async function processEmailRequest(payload, state) {
  const { kind, userSub, synthetic } = payload;
  const hashedSub = payload.hashedSub || (userSub ? hashSub(userSub) : undefined);
  const receiptKind = payload.data?.receiptKind;
  const outcomeBase = { kind, hashedSub, receiptKind };
  Object.assign(state, outcomeBase, { actor: "customer" });

  const address = payload.to || (await findAddress(userSub));
  if (!address) {
    await recordOutcome({ ...outcomeBase, outcome: "no-address", actor: "customer" });
    return;
  }

  await warmOperators();
  const actor = classifyActor(address);
  state.actor = actor;
  const isTest = actor === "test-user" || actor === "probe" || synthetic === true;
  let recipient = address;
  if (isTest) {
    const sink = process.env.CUSTOMER_EMAIL_TEST_SINK;
    if (!sink) {
      await recordOutcome({ ...outcomeBase, outcome: "suppressed-test", actor });
      return;
    }
    recipient = sink;
  }

  if (!(await isRecipientAllowed(recipient))) {
    await recordOutcome({ ...outcomeBase, outcome: "suppressed-sandbox", actor });
    return;
  }

  const catalog = loadCatalogFromRoot();
  let receipt;
  if (kind === "submission-receipt") {
    receipt = userSub ? await getReceipt(userSub, payload.data?.receiptId) : null;
    if (!receipt) throw classifyAwsError({ name: "ReceiptNotFound" });
  }
  const message = buildCustomerEmail({
    kind,
    data: payload.data,
    baseUrl: process.env.DIY_SUBMIT_BASE_URL,
    catalog,
    receipt,
  });
  const attachments = message.passQr ? await buildPassAttachments(message.passQr) : [];
  const from = process.env.CUSTOMER_EMAIL_FROM;
  const configurationSet = process.env.CUSTOMER_EMAIL_CONFIGURATION_SET;
  await sendCustomerEmail({
    from,
    configurationSet,
    to: recipient,
    kind,
    actor,
    hashedSub,
    subject: message.subject,
    text: message.text,
    html: message.html,
    attachments,
  });

  const operatorAddress = process.env.CUSTOMER_EMAIL_OPERATOR_COPY_TO;
  if (OPERATOR_COPY_KINDS.has(kind) && operatorAddress && !isTest) {
    try {
      const copy = buildOperatorCopy({
        kind,
        data: payload.data,
        address,
        environmentName: process.env.ENVIRONMENT_NAME,
        catalog,
      });
      await sendCustomerEmail({
        from,
        configurationSet,
        to: operatorAddress,
        kind,
        actor: "operator",
        hashedSub,
        subject: copy.subject,
        text: copy.text,
        html: copy.html,
      });
    } catch (err) {
      await recordOutcome({ ...outcomeBase, outcome: "failed", actor: "operator", failure: err.message });
    }
  }

  await recordOutcome({ ...outcomeBase, outcome: "sent", actor });
}

/**
 * SQS worker: send one customer email per record. A retryable SES error goes back to the queue;
 * any other error records a failed outcome. A rethrown error holds an error name only, because
 * the Lambda runtime log does not redact.
 */
export async function handler(event) {
  return processSqsRecords(event, {
    requiredEnv: REQUIRED_ENV,
    logger,
    errorPolicy: "classify",
    userContextKey: "userId",
    processRecord: async (payload) => {
      const state = {};
      try {
        await processEmailRequest(payload, state);
      } catch (err) {
        const safe = err.retryable === undefined ? classifyAwsError(err) : err;
        safe.emailContext = state;
        throw safe;
      }
    },
    onTerminalError: async (error) => {
      const { kind = "unknown", actor = "customer", hashedSub, receiptKind } = error.emailContext || {};
      await recordOutcome({ kind, actor, hashedSub, receiptKind, outcome: "failed", failure: error.message });
    },
  });
}
