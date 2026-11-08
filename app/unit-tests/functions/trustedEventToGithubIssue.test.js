// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach } from "vitest";

const mockWriteFact = vi.fn();
vi.mock("@app/lib/trustedEvents/issueWriter.js", () => ({ writeFact: (...args) => mockWriteFact(...args) }));

const mockGetInstallationAccessToken = vi.fn();
vi.mock("@app/lib/githubAppToken.js", () => ({ getInstallationAccessToken: (...args) => mockGetInstallationAccessToken(...args) }));

vi.mock("@app/lib/cachedSecret.js", () => ({ withSecretRetry: (secretId, call) => call("private-key-value") }));

const mockGetGitHubIssue = vi.fn();
vi.mock("@app/lib/githubIssueApi.js", () => ({ getGitHubIssue: (...args) => mockGetGitHubIssue(...args) }));

const mockGetLedgerItem = vi.fn();
vi.mock("@app/data/dynamoDbTrustedEventLedgerRepository.js", () => ({ getLedgerItem: (...args) => mockGetLedgerItem(...args) }));

const readers = vi.hoisted(() => ({
  describeCertificate: vi.fn(),
  listDomains: vi.fn(),
  getCompanyProfile: vi.fn(),
  describeBudget: vi.fn(),
  getAnomalies: vi.fn(),
}));
vi.mock("@app/lib/trustedEvents/origin.js", async (importOriginal) => ({
  ...(await importOriginal()),
  defaultSourceReaders: readers,
  rootAccountId: () => "210987654321",
}));

import { handler } from "@app/functions/ops/trustedEventToGithubIssue.js";
import { buildBody, parseBody, hashOfParsed } from "@app/lib/trustedEvents/issueFormat.js";

const LAMBDA_CONTEXT = { invokedFunctionArn: "arn:aws:lambda:eu-west-2:123456789012:function:prod-env-trusted-event-to-github-issue" };
const HEALTH_EVENT = {
  "id": "evt-health",
  "source": "aws.health",
  "detail-type": "AWS Health Event",
  "account": "123456789012",
  "region": "eu-west-2",
  "detail": {
    eventArn: "arn:aws:health:eu-west-2::event/EC2/X/Y",
    service: "EC2",
    eventTypeCode: "X",
    eventTypeCategory: "issue",
    eventScopeCode: "ACCOUNT_SPECIFIC",
    statusCode: "open",
    startTime: "t0",
    lastUpdatedTime: "t1",
    eventRegion: "eu-west-2",
    affectedAccount: "123456789012",
    page: "1",
    backupEvent: "false",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ENVIRONMENT_NAME = "prod";
  process.env.TRUSTED_EVENT_GITHUB_REPO = "diy-accounting-uk/example-private";
  process.env.GITHUB_APP_ID = "1";
  process.env.GITHUB_APP_INSTALLATION_ID = "2";
  process.env.GITHUB_APP_PRIVATE_KEY_SECRET_ID = "prod/submit/github/ops_app_private_key";
  mockGetInstallationAccessToken.mockResolvedValue("gh-token");
  mockWriteFact.mockImplementation(async ({ fact }) => ({ action: "opened", key: fact.key, issueNumber: 5 }));
});

describe("handler mode choice", () => {
  test("throws on an event of no known shape", async () => {
    await expect(handler({ hello: "world" }, LAMBDA_CONTEXT)).rejects.toThrow("Unrecognised event");
    await expect(handler(undefined, LAMBDA_CONTEXT)).rejects.toThrow("Unrecognised event");
    await expect(handler({ Records: [{ s3: {} }] }, LAMBDA_CONTEXT)).rejects.toThrow("Unrecognised event");
  });

  test("a Health event opens through the writer for one repository with issues write", async () => {
    const result = await handler(HEALTH_EVENT, LAMBDA_CONTEXT);
    expect(result).toEqual({ action: "opened", key: expect.stringContaining("health:123456789012:"), issueNumber: 5 });
    expect(mockGetInstallationAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ repositories: ["example-private"], permissions: { issues: "write" } }),
    );
    const call = mockWriteFact.mock.calls[0][0];
    expect(call.repo).toBe("diy-accounting-uk/example-private");
    expect(call.context).toMatchObject({ env: "prod", account: "123456789012", sourceId: "evt-health" });
  });

  test("a public Health event is skipped and calls no writer", async () => {
    const event = { ...HEALTH_EVENT, detail: { ...HEALTH_EVENT.detail, eventScopeCode: "PUBLIC" } };
    expect(await handler(event, LAMBDA_CONTEXT)).toEqual({ action: "skipped", reason: "public service event" });
    expect(mockWriteFact).not.toHaveBeenCalled();
  });

  test("an ACM event for a certificate that is gone is skipped", async () => {
    readers.describeCertificate.mockResolvedValue(null);
    const event = {
      "id": "evt-acm",
      "source": "aws.acm",
      "detail-type": "ACM Certificate Expired",
      "account": "123456789012",
      "resources": ["arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-0000-0000-000000000000"],
      "detail": {},
    };
    expect(await handler(event, LAMBDA_CONTEXT)).toEqual({ action: "skipped", reason: "certificate not found" });
  });

  test("an ACM error other than not found throws", async () => {
    readers.describeCertificate.mockRejectedValue(new Error("throttled"));
    const event = { id: "e", source: "aws.acm", account: "1", resources: ["arn:aws:acm:us-east-1:1:certificate/x"], detail: {} };
    await expect(handler(event, LAMBDA_CONTEXT)).rejects.toThrow("throttled");
  });

  test("an SNS event writes one fact per record, with the function's account", async () => {
    const message = [
      "AWS Account: 210987654321",
      "AWS Budget Name: example-budget",
      "Alert Type: ACTUAL",
      "Alert Threshold: > $10.00",
    ].join("\n");
    const record = (id) => ({ Sns: { MessageId: id, Subject: "s", Message: message, Timestamp: "2026-11-05T01:00:00.000Z" } });
    const result = await handler({ Records: [record("m1"), record("m2")] }, LAMBDA_CONTEXT);
    expect(result).toHaveLength(2);
    expect(mockWriteFact.mock.calls[1][0].context).toMatchObject({ account: "123456789012", sourceId: "m2" });
  });

  test("a deadline read writes domain and Companies House facts and counts them", async () => {
    const day = (offset) => new Date(Date.now() + offset * 86400000);
    readers.listDomains.mockResolvedValue([{ DomainName: "example.com", AutoRenew: true, TransferLock: true, Expiry: day(10) }]);
    readers.getCompanyProfile.mockResolvedValue({
      company_name: "EXAMPLE LIMITED",
      accounts: { next_accounts: { due_on: day(400).toISOString().slice(0, 10) }, overdue: false },
      confirmation_statement: { next_due: day(20).toISOString().slice(0, 10), overdue: false },
    });
    mockWriteFact.mockImplementationOnce(async ({ fact }) => ({ action: "opened", key: fact.key, issueNumber: 1 }));
    mockWriteFact.mockImplementationOnce(async ({ fact }) => ({ action: "unchanged", key: fact.key, issueNumber: 2 }));
    const result = await handler({ read: "deadlines" }, LAMBDA_CONTEXT);
    expect(result.opened).toBe(1);
    expect(result.unchanged).toBe(1);
    expect(result.commented).toBe(0);
    expect(result.facts.map((fact) => fact.key.split(":")[0])).toEqual(["domain", "ch"]);
    expect(mockWriteFact.mock.calls[0][0].fact.account).toBe("210987654321");
  });

  test("a failed Companies House read throws", async () => {
    readers.listDomains.mockResolvedValue([]);
    readers.getCompanyProfile.mockRejectedValue(new Error("Companies House answered 500"));
    await expect(handler({ read: "deadlines" }, LAMBDA_CONTEXT)).rejects.toThrow("500");
  });

  test("a GitHub error in event mode throws so EventBridge retries", async () => {
    mockWriteFact.mockRejectedValue(new Error("GitHub API error creating issue: 500"));
    await expect(handler(HEALTH_EVENT, LAMBDA_CONTEXT)).rejects.toThrow("500");
  });
});

describe("handler verify mode", () => {
  const context = { env: "prod", account: "123456789012", observed: "o", sourceId: "evt" };
  const healthFact = {
    source: "aws.health",
    sourceLabel: "health",
    key: "health:123456789012:arn-1",
    version: "open|t",
    subject: "x",
    region: "eu-west-2",
    lines: [["Service", "EC2"]],
  };

  test("answers verified with ledger strength for a matching Health issue", async () => {
    const body = buildBody(healthFact, context);
    mockGetGitHubIssue.mockResolvedValue({
      number: 3,
      user: { login: "diyaccounting-ops[bot]" },
      labels: [{ name: "trusted-event" }],
      body,
    });
    mockGetLedgerItem.mockImplementation(async (dedupeKey) =>
      dedupeKey.includes("#") ? { issueNumber: 3, factHash: hashOfParsed(parseBody(body)) } : { issueNumber: 3 },
    );
    expect(await handler({ verify: { issueNumber: 3 } }, LAMBDA_CONTEXT)).toMatchObject({ verified: true, strength: "ledger" });
  });

  test("an issue that is not found answers false", async () => {
    mockGetGitHubIssue.mockResolvedValue(null);
    expect(await handler({ verify: { issueNumber: 3 } }, LAMBDA_CONTEXT)).toMatchObject({ verified: false, reason: "issue not found" });
  });

  test("never throws: a failure answers false with the reason", async () => {
    mockGetGitHubIssue.mockRejectedValue(new Error("boom"));
    expect(await handler({ verify: { issueNumber: 3 } }, LAMBDA_CONTEXT)).toEqual({
      verified: false,
      strength: "none",
      reason: "check error: boom",
    });
  });

  test("never throws: a missing environment variable answers false", async () => {
    delete process.env.TRUSTED_EVENT_GITHUB_REPO;
    const result = await handler({ verify: { issueNumber: 3 } }, LAMBDA_CONTEXT);
    expect(result.verified).toBe(false);
  });
});
