// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi } from "vitest";

vi.mock("@app/lib/trustedEvents/companiesHouseProfile.js", () => ({ fetchCompanyProfile: vi.fn() }));

import { evaluateTrustedEventIssue, readSourceRecord, OPS_APP_LOGIN } from "@app/lib/trustedEvents/origin.js";
import { buildBody, parseBody, hashOfParsed } from "@app/lib/trustedEvents/issueFormat.js";

const NOW = new Date("2026-11-15T10:00:00Z");
const context = { env: "prod", account: "123456789012", observed: "2026-11-05T07:00:00.000Z", sourceId: "evt-1" };
const ARN = "arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-0000-0000-000000000000";

const acmFact = (version = "days:30") => ({
  source: "aws.acm",
  sourceLabel: "acm",
  key: `acm:${ARN}:2026-11-21`,
  version,
  subject: "x",
  region: "us-east-1",
  lines: [["Certificate ARN", ARN]],
});
const domainFact = () => ({
  source: "route53domains",
  sourceLabel: "domain",
  key: "domain:example.com:2027-01-04",
  version: "days:60",
  subject: "x",
  region: "us-east-1",
  lines: [["Domain", "example.com"]],
});
const chFact = (slug = "accounts") => ({
  source: "companies-house",
  sourceLabel: "companies-house",
  key: `ch:06846849:${slug}:2027-01-04`,
  version: "days:60",
  subject: "x",
  region: "eu-west-2",
  lines: [["Company", "06846849 EXAMPLE LIMITED"]],
});
const budgetFact = (type = "ACTUAL", threshold = "$10.00", month = "2026-11") => ({
  source: "aws.budgets",
  sourceLabel: "budget",
  key: `budget:example-budget:${type}:${threshold}:${month}`,
  version: "1",
  subject: "x",
  region: "us-east-1",
  lines: [["Budget", "example-budget"]],
});
const anomalyFact = () => ({
  source: "aws.ce",
  sourceLabel: "anomaly",
  key: "anomaly:anomaly-1",
  version: "1",
  subject: "x",
  region: "us-east-1",
  lines: [
    ["Anomaly id", "anomaly-1"],
    ["Monitor", "arn:aws:ce::123456789012:anomalymonitor/monitor-1"],
  ],
});
const healthFact = () => ({
  source: "aws.health",
  sourceLabel: "health",
  key: "health:123456789012:arn-1",
  version: "open|t",
  subject: "x",
  region: "eu-west-2",
  lines: [["Service", "EC2"]],
});
const unparsedFact = () => ({
  source: "aws.budgets",
  sourceLabel: "budget",
  key: "budget:unparsed:msg-1",
  version: "1",
  subject: "x",
  region: "us-east-1",
  lines: [["SNS subject", "s"]],
});

function issueFor(fact, overrides = {}) {
  const body = buildBody(fact, context);
  const parsed = parseBody(body);
  return {
    issue: { number: 12, user: { login: OPS_APP_LOGIN }, labels: [{ name: "trusted-event" }], body, ...overrides },
    ledgerKeyItem: { issueNumber: 12 },
    ledgerVersionItem: { issueNumber: 12, factHash: hashOfParsed(parsed) },
  };
}

const certificate = (overrides = {}) => ({
  NotAfter: new Date("2026-11-21T00:00:00Z"),
  Status: "ISSUED",
  RenewalSummary: { RenewalStatus: "PENDING_VALIDATION" },
  ...overrides,
});

const check = (fact, sourceRecord, overrides = {}) => evaluateTrustedEventIssue({ ...issueFor(fact, overrides), sourceRecord, now: NOW });

describe("checks 1 to 6", () => {
  test("1: no issue is false", () => {
    expect(evaluateTrustedEventIssue({ issue: null, ledgerKeyItem: null, ledgerVersionItem: null, sourceRecord: null })).toMatchObject({
      verified: false,
      reason: "issue not found",
    });
  });

  test("2: an author other than the ops App is false", () => {
    expect(check(acmFact(), { certificate: certificate() }, { user: { login: "someone" } }).reason).toContain("ops App");
  });

  test("3: no trusted-event label is false", () => {
    expect(check(acmFact(), { certificate: certificate() }, { labels: [{ name: "alarm" }] }).reason).toContain("label");
  });

  test("4: a body without the lines is false", () => {
    expect(check(acmFact(), { certificate: certificate() }, { body: "hello" }).reason).toContain("Source, Key and Version");
  });

  test("5: a ledger key item for another issue is false", () => {
    const parts = issueFor(acmFact());
    const result = evaluateTrustedEventIssue({
      ...parts,
      ledgerKeyItem: { issueNumber: 99 },
      ledgerVersionItem: { ...parts.ledgerVersionItem, issueNumber: 99 },
      sourceRecord: { certificate: certificate() },
      now: NOW,
    });
    expect(result.reason).toContain("ledger does not name this issue");
  });

  test("5: an older issue for the same key passes when the version item names it", () => {
    const parts = issueFor(acmFact());
    const result = evaluateTrustedEventIssue({
      ...parts,
      ledgerKeyItem: { issueNumber: 99 },
      sourceRecord: { certificate: certificate() },
      now: NOW,
    });
    expect(result.verified).toBe(true);
  });

  test("5: a missing key item and version item is false", () => {
    const parts = issueFor(acmFact());
    const result = evaluateTrustedEventIssue({ ...parts, ledgerKeyItem: null, ledgerVersionItem: null, sourceRecord: null, now: NOW });
    expect(result.verified).toBe(false);
  });

  test("6: a missing version item is false", () => {
    const parts = issueFor(acmFact());
    const result = evaluateTrustedEventIssue({ ...parts, ledgerVersionItem: null, sourceRecord: null, now: NOW });
    expect(result.reason).toContain("no item for this version");
  });

  test("6: an edited body fails the hash", () => {
    const edited = issueFor(acmFact()).issue.body.replace("**Region:** us-east-1", "**Region:** eu-west-2");
    expect(check(acmFact(), { certificate: certificate() }, { body: edited }).reason).toContain("differs");
  });
});

describe("check 7", () => {
  test("aws.health holds with ledger strength", () => {
    expect(check(healthFact(), null)).toMatchObject({ verified: true, strength: "ledger" });
  });

  test("an unparsed notification is never verified", () => {
    expect(check(unparsedFact(), null)).toMatchObject({ verified: false, strength: "none" });
  });

  describe("aws.acm", () => {
    test("approaching holds when NotAfter matches the key", () => {
      expect(check(acmFact(), { certificate: certificate() })).toMatchObject({ verified: true, strength: "source" });
    });
    test("approaching fails when the certificate renewed", () => {
      const result = check(acmFact(), { certificate: certificate({ NotAfter: new Date("2027-11-21T00:00:00Z") }) });
      expect(result).toMatchObject({ verified: false, reason: "the source no longer shows this fact" });
    });
    test("a certificate that is gone fails", () => {
      expect(check(acmFact(), { certificate: null }).verified).toBe(false);
    });
    test.each([
      ["PENDING_VALIDATION", true],
      ["FAILED", true],
      ["SUCCESS", false],
    ])("renewal action with status %s is %s", (RenewalStatus, expected) => {
      const result = check(acmFact("renewal:X:15"), { certificate: certificate({ RenewalSummary: { RenewalStatus } }) });
      expect(result.verified).toBe(expected);
    });
    test.each([
      ["expired", "EXPIRED", true],
      ["expired", "ISSUED", false],
      ["revoked", "REVOKED", true],
      ["revoked", "ISSUED", false],
    ])("%s with status %s is %s", (version, Status, expected) => {
      expect(check(acmFact(version), { certificate: certificate({ Status }) }).verified).toBe(expected);
    });
  });

  describe("route53domains", () => {
    test("holds when the domain is listed with the key date", () => {
      const result = check(domainFact(), { domains: [{ DomainName: "example.com", Expiry: new Date("2027-01-04T00:00:00Z") }] });
      expect(result).toMatchObject({ verified: true, strength: "source" });
    });
    test("fails when the expiry moved", () => {
      const result = check(domainFact(), { domains: [{ DomainName: "example.com", Expiry: new Date("2028-01-04T00:00:00Z") }] });
      expect(result.verified).toBe(false);
    });
    test("fails when the domain is not listed", () => {
      expect(check(domainFact(), { domains: [] }).verified).toBe(false);
    });
  });

  describe("companies-house", () => {
    test("accounts hold when the due date equals the key date", () => {
      expect(check(chFact(), { profile: { accounts: { next_accounts: { due_on: "2027-01-04" } } } }).verified).toBe(true);
    });
    test("accounts fail when the company filed and the date moved", () => {
      expect(check(chFact(), { profile: { accounts: { next_accounts: { due_on: "2028-01-04" } } } }).verified).toBe(false);
    });
    test("a confirmation statement reads its own date", () => {
      const profile = { confirmation_statement: { next_due: "2027-01-04" } };
      expect(check(chFact("confirmation-statement"), { profile }).verified).toBe(true);
    });
  });

  describe("aws.budgets", () => {
    const budget = (actual, forecast, limit = "20.00") => ({
      BudgetLimit: { Amount: limit },
      CalculatedSpend: { ActualSpend: { Amount: actual }, ForecastedSpend: { Amount: forecast } },
    });
    test("holds when the actual spend is over the threshold this month", () => {
      expect(check(budgetFact(), { budget: budget("11.00", "30.00") })).toMatchObject({ verified: true, strength: "source" });
    });
    test("fails when the actual spend is at or under the threshold", () => {
      expect(check(budgetFact(), { budget: budget("10.00", "30.00") }).verified).toBe(false);
    });
    test("a forecast alert reads the forecast", () => {
      expect(check(budgetFact("FORECASTED"), { budget: budget("1.00", "30.00") }).verified).toBe(true);
    });
    test("fails when the key month is not the current month", () => {
      const result = check(budgetFact("ACTUAL", "$10.00", "2026-10"), { budget: budget("11.00", "30.00") });
      expect(result.reason).toContain("current month");
    });
    test("fails when the budget does not exist", () => {
      expect(check(budgetFact(), { budget: null }).verified).toBe(false);
    });
    test("a percentage threshold is a share of the budget limit", () => {
      expect(check(budgetFact("ACTUAL", "50.00%"), { budget: budget("11.00", "30.00") }).verified).toBe(true);
      expect(check(budgetFact("ACTUAL", "80.00%"), { budget: budget("11.00", "30.00") }).verified).toBe(false);
    });
  });

  describe("aws.ce", () => {
    test("holds when the anomaly is in the answer", () => {
      expect(check(anomalyFact(), { anomalies: [{ AnomalyId: "anomaly-1" }] }).verified).toBe(true);
    });
    test("fails when it is not", () => {
      expect(check(anomalyFact(), { anomalies: [{ AnomalyId: "other" }] }).verified).toBe(false);
    });
  });

  test("a source with no record is false", () => {
    expect(check(acmFact(), null).reason).toBe("the source could not be read");
  });
});

describe("readSourceRecord", () => {
  const readers = {
    describeCertificate: vi.fn(async () => ({ id: "cert" })),
    listDomains: vi.fn(async () => [{ DomainName: "example.com" }]),
    getCompanyProfile: vi.fn(async () => ({ company_name: "X" })),
    describeBudget: vi.fn(async () => ({ id: "budget" })),
    getAnomalies: vi.fn(async () => [{ AnomalyId: "a" }]),
  };
  const parsedOf = (fact) => parseBody(buildBody(fact, context));

  test("reads each source with the value from the body", async () => {
    expect(await readSourceRecord(parsedOf(acmFact()), readers)).toEqual({ certificate: { id: "cert" } });
    expect(readers.describeCertificate).toHaveBeenCalledWith(ARN);
    expect(await readSourceRecord(parsedOf(domainFact()), readers)).toEqual({ domains: [{ DomainName: "example.com" }] });
    expect(await readSourceRecord(parsedOf(chFact()), readers)).toEqual({ profile: { company_name: "X" } });
    expect(await readSourceRecord(parsedOf(budgetFact()), readers)).toEqual({ budget: { id: "budget" } });
    expect(readers.describeBudget).toHaveBeenCalledWith("example-budget");
    expect(await readSourceRecord(parsedOf(anomalyFact()), readers, NOW)).toEqual({ anomalies: [{ AnomalyId: "a" }] });
    expect(readers.getAnomalies).toHaveBeenCalledWith("arn:aws:ce::123456789012:anomalymonitor/monitor-1", NOW);
  });

  test("health and unparsed have no re-read", async () => {
    expect(await readSourceRecord(parsedOf(healthFact()), readers)).toBeNull();
    expect(await readSourceRecord(parsedOf(unparsedFact()), readers)).toBeNull();
  });
});
