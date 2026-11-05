// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-185 Open private GitHub issues from trusted AWS and Companies House events
// - **Use when:** a fact from a source we trust (AWS Health, ACM, Route 53 Domains, Companies House, AWS Budgets, Cost Anomaly Detection) must reach the maintainer as an issue that only the ops App could have opened, and a later check must prove the issue still matches its source.
// - **Does:** trustedEventToGithubIssue.js is the Lambda for those facts. It turns an EventBridge event, an SNS record or a scheduled read into one fact, writes it to the private repository as an issue or a comment through a ledger so a repeat opens nothing, and in verify mode runs the fail-closed source check on an issue. Code writes every body line from the source record; no model reads it.
// - **Run:** no command; see Does and Entry
// - **Entry:** `app/functions/ops/trustedEventToGithubIssue.js:handler`; `app/lib/trustedEvents/issueWriter.js:writeFact`; `app/lib/trustedEvents/origin.js:evaluateTrustedEventIssue`
// - **Files:** app/functions/ops/trustedEventToGithubIssue.js, app/lib/trustedEvents/healthFact.js, app/lib/trustedEvents/acmFact.js, app/lib/trustedEvents/costFact.js, app/lib/trustedEvents/deadlineFacts.js, app/lib/trustedEvents/issueFormat.js, app/lib/trustedEvents/issueWriter.js, app/lib/trustedEvents/origin.js, app/lib/trustedEvents/companiesHouseProfile.js, app/data/dynamoDbTrustedEventLedgerRepository.js, app/lib/githubIssueApi.js, app/unit-tests/functions/trustedEventToGithubIssue.test.js
// - **Keywords:** trusted event, aws health, acm certificate expiry, domain renewal, companies house deadline, budget alert, cost anomaly, private issue, ledger, source check, fail closed, maintainer-review
// - **Related:** OPS-71, OPS-85
// @end-capability

// app/functions/ops/trustedEventToGithubIssue.js
//
// Env-level Lambda that opens issues in the private repository for facts from trusted sources.
// It picks one mode from the shape of the event and throws on any other shape.

import { createLogger } from "../../lib/logger.js";
import { getInstallationAccessToken } from "../../lib/githubAppToken.js";
import { withSecretRetry } from "../../lib/cachedSecret.js";
import { getGitHubIssue } from "../../lib/githubIssueApi.js";
import { getLedgerItem } from "../../data/dynamoDbTrustedEventLedgerRepository.js";
import { healthFactFromEvent } from "../../lib/trustedEvents/healthFact.js";
import { acmFactFromEvent } from "../../lib/trustedEvents/acmFact.js";
import { costFactFromSnsRecord } from "../../lib/trustedEvents/costFact.js";
import { domainFacts, companiesHouseFacts } from "../../lib/trustedEvents/deadlineFacts.js";
import { writeFact } from "../../lib/trustedEvents/issueWriter.js";
import { parseBody } from "../../lib/trustedEvents/issueFormat.js";
import { defaultSourceReaders, evaluateTrustedEventIssue, readSourceRecord, rootAccountId } from "../../lib/trustedEvents/origin.js";

const logger = createLogger({ source: "app/functions/ops/trustedEventToGithubIssue.js" });

const isGitHubUnauthorized = (error) => error.status === 401;

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is required`);
  return value;
}

async function resolveGitHubToken(githubRepo) {
  const appId = requiredEnv("GITHUB_APP_ID");
  const installationId = requiredEnv("GITHUB_APP_INSTALLATION_ID");
  const privateKeySecretId = requiredEnv("GITHUB_APP_PRIVATE_KEY_SECRET_ID");
  return withSecretRetry(
    privateKeySecretId,
    (privateKey) =>
      getInstallationAccessToken({
        appId,
        privateKey,
        installationId,
        repositories: [githubRepo.split("/")[1]],
        permissions: { issues: "write" },
      }),
    isGitHubUnauthorized,
  );
}

const accountOf = (lambdaContext) => String(lambdaContext?.invokedFunctionArn || "").split(":")[4];

function logFact(mode, fact, outcome) {
  logger.info({
    message: "Trusted event fact handled",
    mode,
    source: fact.source,
    key: fact.logKey || fact.key,
    version: fact.version,
    action: outcome.action,
    issueNumber: outcome.issueNumber,
    reason: outcome.reason,
  });
}

async function handleFact({ mode, fact, context }) {
  const outcome = await writeFact({ fact, context, token: context.token, repo: context.repo });
  logFact(mode, fact, outcome);
  return outcome;
}

function skipped(mode, source, reason) {
  logger.info({ message: "Trusted event skipped", mode, source, action: "skipped", reason });
  return { action: "skipped", reason };
}

async function handleHealth(event, base) {
  const fact = healthFactFromEvent(event);
  if (fact.skip) return skipped("health", "aws.health", fact.reason);
  return handleFact({ mode: "health", fact, context: { ...base, sourceId: event.id } });
}

async function handleAcm(event, base) {
  const certificate = await defaultSourceReaders.describeCertificate(event.resources[0]);
  const fact = acmFactFromEvent(event, certificate);
  if (fact.skip) return skipped("acm", "aws.acm", fact.reason);
  return handleFact({ mode: "acm", fact, context: { ...base, sourceId: event.id } });
}

async function handleSns(event, base) {
  const outcomes = [];
  for (const record of event.Records) {
    const fact = costFactFromSnsRecord(record);
    outcomes.push(await handleFact({ mode: "sns", fact, context: { ...base, sourceId: record.Sns.MessageId } }));
  }
  return outcomes;
}

async function handleDeadlineRead(base) {
  const now = new Date();
  const [domains, profile] = await Promise.all([defaultSourceReaders.listDomains(), defaultSourceReaders.getCompanyProfile()]);
  const facts = [...domainFacts(domains, now).map((fact) => ({ ...fact, account: rootAccountId() })), ...companiesHouseFacts(profile, now)];

  const counts = { opened: 0, commented: 0, unchanged: 0 };
  for (const fact of facts) {
    const outcome = await handleFact({ mode: "read", fact, context: { ...base, sourceId: "read" } });
    counts[outcome.action] += 1;
  }
  logger.info({ message: "Trusted event deadline read finished", mode: "read", facts: facts.length, ...counts });
  return { facts: facts.map(({ key, version, days }) => ({ key, version, days })), ...counts };
}

async function verifyIssue(issueNumber, token, repo) {
  const issue = await getGitHubIssue(token, repo, issueNumber);
  const parsed = issue ? parseBody(issue.body) : null;
  const [ledgerKeyItem, ledgerVersionItem] = parsed
    ? await Promise.all([getLedgerItem(parsed.key), getLedgerItem(`${parsed.key}#${parsed.version}`)])
    : [null, null];
  const sourceRecord = parsed ? await readSourceRecord(parsed) : null;
  return evaluateTrustedEventIssue({ issue, ledgerKeyItem, ledgerVersionItem, sourceRecord });
}

async function handleVerify(event) {
  const issueNumber = Number(event.verify.issueNumber);
  try {
    const repo = requiredEnv("TRUSTED_EVENT_GITHUB_REPO");
    const result = await verifyIssue(issueNumber, await resolveGitHubToken(repo), repo);
    logger.info({
      message: "Trusted event issue checked",
      mode: "verify",
      issueNumber,
      verified: result.verified,
      strength: result.strength,
    });
    return result;
  } catch (error) {
    logger.warn({ message: "Trusted event issue check failed", mode: "verify", issueNumber, error: error.message });
    return { verified: false, strength: "none", reason: `check error: ${error.message}` };
  }
}

/**
 * @param {Object} event - an EventBridge event, an SNS event, {read:"deadlines"} or {verify:{issueNumber}}
 * @param {Object} lambdaContext - the Lambda context; its function ARN names the account
 */
export async function handler(event, lambdaContext) {
  if (event?.verify?.issueNumber !== undefined) {
    return handleVerify(event);
  }

  const isEventBridge = event?.source === "aws.health" || event?.source === "aws.acm";
  const isSns = Array.isArray(event?.Records) && event.Records[0]?.Sns;
  const isRead = event?.read === "deadlines";
  if (!isEventBridge && !isSns && !isRead) throw new Error("Unrecognised event");

  const repo = requiredEnv("TRUSTED_EVENT_GITHUB_REPO");
  const token = await resolveGitHubToken(repo);
  const base = {
    env: requiredEnv("ENVIRONMENT_NAME"),
    account: isEventBridge ? event.account : accountOf(lambdaContext),
    observed: new Date().toISOString(),
    token,
    repo,
  };

  if (event.source === "aws.health") return handleHealth(event, base);
  if (event.source === "aws.acm") return handleAcm(event, base);
  if (isSns) return handleSns(event, base);
  return handleDeadlineRead(base);
}
