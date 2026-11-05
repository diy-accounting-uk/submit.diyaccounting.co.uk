// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/trustedEvents/origin.js
//
// The source check for a trusted-event issue. evaluateTrustedEventIssue is pure: it takes the
// issue, the two ledger items and the source record, and runs checks 2 to 7 in order; the first
// check that fails ends it with verified false. readSourceRecord reads the source again for
// check 7, and defaultSourceReaders holds the AWS and Companies House calls behind it.

import { ACMClient, DescribeCertificateCommand } from "@aws-sdk/client-acm";
import { Route53DomainsClient, ListDomainsCommand } from "@aws-sdk/client-route-53-domains";
import { BudgetsClient, DescribeBudgetCommand } from "@aws-sdk/client-budgets";
import { CostExplorerClient, GetAnomaliesCommand } from "@aws-sdk/client-cost-explorer";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { fetchCompanyProfile } from "./companiesHouseProfile.js";
import { hashOfParsed, lineValue, parseBody } from "./issueFormat.js";
import { COMPANY_NUMBER } from "./deadlineFacts.js";

export const OPS_APP_LOGIN = "diyaccounting-ops[bot]";

const DAY_MS = 24 * 60 * 60 * 1000;
const SOURCE_GONE = "the source no longer shows this fact";

const fail = (reason) => ({ verified: false, strength: "none", reason });
const isoDay = (value) => new Date(value).toISOString().slice(0, 10);

function evaluateAcm(parsed, { certificate }) {
  if (!certificate) return fail(SOURCE_GONE);
  const keyDate = parsed.key.slice(-10);
  if (parsed.version.startsWith("days:")) {
    return isoDay(certificate.NotAfter) === keyDate ? null : fail(SOURCE_GONE);
  }
  if (parsed.version.startsWith("renewal:")) {
    return ["PENDING_VALIDATION", "FAILED"].includes(certificate.RenewalSummary?.RenewalStatus) ? null : fail(SOURCE_GONE);
  }
  if (parsed.version === "expired") return certificate.Status === "EXPIRED" ? null : fail(SOURCE_GONE);
  if (parsed.version === "revoked") return certificate.Status === "REVOKED" ? null : fail(SOURCE_GONE);
  return fail(`unknown ACM version ${parsed.version}`);
}

function evaluateDomain(parsed, { domains }) {
  const [, name, keyDate] = parsed.key.split(":");
  const domain = (domains || []).find((candidate) => candidate.DomainName === name);
  return domain && isoDay(domain.Expiry) === keyDate ? null : fail(SOURCE_GONE);
}

function evaluateCompaniesHouse(parsed, { profile }) {
  const [, , deadline, keyDate] = parsed.key.split(":");
  const due = deadline === "accounts" ? profile?.accounts?.next_accounts?.due_on : profile?.confirmation_statement?.next_due;
  return due === keyDate ? null : fail(SOURCE_GONE);
}

function evaluateBudget(parsed, { budget }, now) {
  const parts = parsed.key.split(":");
  const month = parts.pop();
  const threshold = parts.pop();
  const alertType = parts.pop();
  if (!budget) return fail(SOURCE_GONE);
  if (month !== now.toISOString().slice(0, 7)) return fail("the budget month is not the current month");
  const limit = Number(budget.BudgetLimit?.Amount);
  const amount = threshold.endsWith("%") ? (limit * Number(threshold.slice(0, -1))) / 100 : Number(threshold.replace(/[^0-9.]/g, ""));
  const spend = Number(
    alertType === "FORECASTED" ? budget.CalculatedSpend?.ForecastedSpend?.Amount : budget.CalculatedSpend?.ActualSpend?.Amount,
  );
  return spend > amount ? null : fail(SOURCE_GONE);
}

function evaluateAnomaly(parsed, { anomalies }) {
  const anomalyId = parsed.key.slice("anomaly:".length);
  return (anomalies || []).some((anomaly) => anomaly.AnomalyId === anomalyId) ? null : fail(SOURCE_GONE);
}

const SOURCE_EVALUATORS = {
  "aws.acm": evaluateAcm,
  "route53domains": evaluateDomain,
  "companies-house": evaluateCompaniesHouse,
  "aws.budgets": evaluateBudget,
  "aws.ce": evaluateAnomaly,
};

/**
 * @param {Object} params
 * @param {Object|null} params.issue - the GitHub issue, or null when it was not found
 * @param {Object|null} params.ledgerKeyItem - ledger item "<key>"
 * @param {Object|null} params.ledgerVersionItem - ledger item "<key>#<version>"
 * @param {Object|null} params.sourceRecord - what readSourceRecord returned, null for aws.health
 * @param {Date} [params.now]
 * @returns {{verified: boolean, strength: "source"|"ledger"|"none", reason: string}}
 */
export function evaluateTrustedEventIssue({ issue, ledgerKeyItem, ledgerVersionItem, sourceRecord, now = new Date() }) {
  if (!issue) return fail("issue not found");
  if (issue.user?.login !== OPS_APP_LOGIN) return fail("the issue was not opened by the ops App");
  if (!(issue.labels || []).some((label) => (typeof label === "string" ? label : label.name) === "trusted-event")) {
    return fail("the issue has no trusted-event label");
  }
  const parsed = parseBody(issue.body);
  if (!parsed) return fail("the issue body has no valid Source, Key and Version lines");

  const keyMatches = ledgerKeyItem?.issueNumber === issue.number;
  const versionMatches = ledgerVersionItem?.issueNumber === issue.number;
  if (!keyMatches && !versionMatches) return fail("the ledger does not name this issue for this key");
  if (!ledgerVersionItem) return fail("the ledger has no item for this version");
  if (ledgerVersionItem.factHash !== hashOfParsed(parsed)) return fail("the issue body differs from the body that was written");

  if (parsed.key.startsWith("budget:unparsed:")) return fail("the notification could not be parsed");
  if (parsed.source === "aws.health")
    return { verified: true, strength: "ledger", reason: "ledger match; AWS Health cannot be read again" };

  if (!sourceRecord) return fail("the source could not be read");
  const outcome = SOURCE_EVALUATORS[parsed.source](parsed, sourceRecord, now);
  return outcome || { verified: true, strength: "source", reason: "the source shows this fact" };
}

const certificateRegion = (arn) => arn.split(":")[3];

let cachedRootCredentials = null;

async function rootCredentials() {
  const roleArn = process.env.TRUSTED_EVENT_ROOT_READ_ROLE_ARN;
  if (!roleArn) throw new Error("TRUSTED_EVENT_ROOT_READ_ROLE_ARN environment variable is required");
  if (cachedRootCredentials && cachedRootCredentials.expiration.getTime() - Date.now() > 5 * 60 * 1000)
    return cachedRootCredentials.credentials;
  const sts = new STSClient({ region: process.env.AWS_REGION || "eu-west-2" });
  const result = await sts.send(new AssumeRoleCommand({ RoleArn: roleArn, RoleSessionName: "trusted-event-read", DurationSeconds: 900 }));
  const credentials = {
    accessKeyId: result.Credentials.AccessKeyId,
    secretAccessKey: result.Credentials.SecretAccessKey,
    sessionToken: result.Credentials.SessionToken,
  };
  cachedRootCredentials = { credentials, expiration: result.Credentials.Expiration };
  return credentials;
}

/** The management account id, taken from the ARN of the read role. */
export function rootAccountId() {
  return (process.env.TRUSTED_EVENT_ROOT_READ_ROLE_ARN || "").split(":")[4];
}

export const defaultSourceReaders = {
  async describeCertificate(arn) {
    const client = new ACMClient({ region: certificateRegion(arn) });
    try {
      const result = await client.send(new DescribeCertificateCommand({ CertificateArn: arn }));
      return result.Certificate;
    } catch (error) {
      if (error.name === "ResourceNotFoundException") return null;
      throw error;
    }
  },

  async listDomains() {
    const client = new Route53DomainsClient({ region: "us-east-1", credentials: await rootCredentials() });
    const domains = [];
    let marker;
    do {
      const result = await client.send(new ListDomainsCommand({ Marker: marker }));
      domains.push(...(result.Domains || []));
      marker = result.NextPageMarker;
    } while (marker);
    return domains;
  },

  getCompanyProfile() {
    return fetchCompanyProfile(COMPANY_NUMBER);
  },

  async describeBudget(name) {
    const client = new BudgetsClient({ region: "us-east-1", credentials: await rootCredentials() });
    try {
      const result = await client.send(new DescribeBudgetCommand({ AccountId: rootAccountId(), BudgetName: name }));
      return result.Budget;
    } catch (error) {
      if (error.name === "NotFoundException") return null;
      throw error;
    }
  },

  async getAnomalies(monitorArn, now) {
    const client = new CostExplorerClient({ region: "us-east-1", credentials: await rootCredentials() });
    const result = await client.send(
      new GetAnomaliesCommand({
        MonitorArn: monitorArn,
        DateInterval: { StartDate: isoDay(now.getTime() - 90 * DAY_MS), EndDate: isoDay(now) },
      }),
    );
    return result.Anomalies || [];
  },
};

/**
 * The record check 7 compares with the issue, or null for a source with no re-read.
 */
export async function readSourceRecord(parsed, readers = defaultSourceReaders, now = new Date()) {
  if (parsed.key.startsWith("budget:unparsed:")) return null;
  switch (parsed.source) {
    case "aws.acm":
      return { certificate: await readers.describeCertificate(lineValue(parsed, "Certificate ARN")) };
    case "route53domains":
      return { domains: await readers.listDomains() };
    case "companies-house":
      return { profile: await readers.getCompanyProfile() };
    case "aws.budgets":
      return { budget: await readers.describeBudget(lineValue(parsed, "Budget")) };
    case "aws.ce":
      return { anomalies: await readers.getAnomalies(lineValue(parsed, "Monitor"), now) };
    default:
      return null;
  }
}
