// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/customerEmailSender.js

import { SESv2Client, SendEmailCommand, GetAccountCommand } from "@aws-sdk/client-sesv2";

const ses = new SESv2Client({ region: process.env.AWS_REGION || "eu-west-2" });

export const SUPPORT_ADDRESS = "support@diyaccounting.co.uk";

const SANDBOX_DOMAINS = ["@diyaccounting.co.uk", "@simulator.amazonses.com"];
const PRODUCTION_ACCESS_TTL_MS = 15 * 60 * 1000;
const RETRYABLE_ERROR_NAMES = new Set([
  "TooManyRequestsException",
  "LimitExceededException",
  "SendingPausedException",
  "ThrottlingException",
  "InternalFailure",
  "InternalErrorException",
  "ServiceUnavailable",
]);

let productionAccessCache = null;

/** Forget the cached production-access answer (for tests). */
export function resetProductionAccessCache() {
  productionAccessCache = null;
}

/**
 * Turn an AWS error into one that holds the error name only. An SES or Cognito message can hold
 * the recipient, and a rethrown error reaches the Lambda runtime log, which does not redact.
 * The returned error carries `retryable` for the SQS worker helper.
 *
 * @param {Error} err
 * @returns {Error}
 */
export function classifyAwsError(err) {
  const name = err?.name || "UnknownError";
  const status = err?.$metadata?.httpStatusCode;
  const retryable = RETRYABLE_ERROR_NAMES.has(name) || (typeof status === "number" && status >= 500);
  return Object.assign(new Error(name), { retryable });
}

/**
 * True when the SES account may send to any address. While false, only the sandbox domains
 * receive mail. AWS turns this on when it approves production access, with no deploy.
 *
 * @returns {Promise<boolean>}
 */
export async function isProductionAccessEnabled() {
  const now = Date.now();
  if (productionAccessCache && now - productionAccessCache.at < PRODUCTION_ACCESS_TTL_MS) {
    return productionAccessCache.enabled;
  }
  let account;
  try {
    account = await ses.send(new GetAccountCommand({}));
  } catch (err) {
    throw classifyAwsError(err);
  }
  productionAccessCache = { enabled: account.ProductionAccessEnabled === true, at: now };
  return productionAccessCache.enabled;
}

/**
 * @param {string} address
 * @returns {Promise<boolean>} true when SES may deliver to this address now
 */
export async function isRecipientAllowed(address) {
  const lower = String(address).toLowerCase();
  if (SANDBOX_DOMAINS.some((domain) => lower.endsWith(domain))) return true;
  return isProductionAccessEnabled();
}

/**
 * Send one email through SES.
 *
 * @param {Object} params
 * @param {string} params.from - the From header, with a display name
 * @param {string} params.configurationSet
 * @param {string} params.to
 * @param {string} params.kind - tag value
 * @param {string} params.actor - tag value
 * @param {string} [params.hashedSub] - tag value; carries the account into bounce events
 * @param {string} params.subject
 * @param {string} params.text
 * @param {string} params.html
 * @param {Object[]} [params.attachments] - SES attachments
 * @returns {Promise<void>}
 */
export async function sendCustomerEmail({ from, configurationSet, to, kind, actor, hashedSub, subject, text, html, attachments = [] }) {
  const tags = [
    { Name: "kind", Value: kind },
    { Name: "actor", Value: actor },
  ];
  if (hashedSub) tags.push({ Name: "hashedsub", Value: hashedSub });
  try {
    await ses.send(
      new SendEmailCommand({
        FromEmailAddress: from,
        ReplyToAddresses: [SUPPORT_ADDRESS],
        Destination: { ToAddresses: [to] },
        ConfigurationSetName: configurationSet,
        EmailTags: tags,
        Content: {
          Simple: {
            Subject: { Data: subject, Charset: "UTF-8" },
            Body: { Text: { Data: text, Charset: "UTF-8" }, Html: { Data: html, Charset: "UTF-8" } },
            ...(attachments.length ? { Attachments: attachments } : {}),
          },
        },
      }),
    );
  } catch (err) {
    throw classifyAwsError(err);
  }
}
