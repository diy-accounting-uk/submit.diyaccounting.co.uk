// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, test, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  toJsonLines,
  mapSecurityHubFinding,
  fetchSecurityHubFindings,
  mapGuardDutyFinding,
  fetchGuardDutyFindings,
  aggregateGithubAlertCounts,
  fetchGithubAlertRows,
  computeDaysRemaining,
  readLifecycleToml,
  buildLifecycleRows,
  minDaysRemaining,
  fetchWafBlockRows,
  readRotationToml,
  buildRotationRows,
} from "@app/functions/security/securityLakeNightly.js";

function writeTempToml(contents) {
  const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "security-lake-")), "test.toml");
  fs.writeFileSync(filePath, contents);
  return filePath;
}

describe("toJsonLines", () => {
  test("writes one JSON object per line with a trailing newline", () => {
    const output = toJsonLines([{ a: 1 }, { b: 2 }]);
    expect(output).toBe('{"a":1}\n{"b":2}\n');
  });

  test("an empty list still produces a valid (empty) string", () => {
    expect(toJsonLines([])).toBe("");
  });
});

describe("Security Hub", () => {
  test("mapSecurityHubFinding flattens the fields the lake table expects", () => {
    const row = mapSecurityHubFinding(
      {
        Id: "finding-1",
        Title: "Example",
        Severity: { Label: "HIGH", Normalized: 70 },
        Types: ["Software and Configuration Checks"],
        Resources: [{ Id: "arn:aws:s3:::bucket", Type: "AwsS3Bucket" }],
        RecordState: "ACTIVE",
        Workflow: { Status: "NEW" },
        GeneratorId: "aws-foundational-security-best-practices/v/1.0.0/S3.1",
        FirstObservedAt: "2026-09-01T00:00:00.000Z",
        UpdatedAt: "2026-09-07T00:00:00.000Z",
      },
      "2026-09-08",
    );
    expect(row).toMatchObject({
      dt: "2026-09-08",
      finding_id: "finding-1",
      severity_label: "HIGH",
      severity_normalized: 70,
      resource_id: "arn:aws:s3:::bucket",
      resource_type: "AwsS3Bucket",
      record_state: "ACTIVE",
      workflow_status: "NEW",
    });
  });

  test("fetchSecurityHubFindings pages through NextToken and writes a heartbeat row when empty", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ Findings: [{ Id: "f1" }], NextToken: "page2" })
      .mockResolvedValueOnce({ Findings: [{ Id: "f2" }], NextToken: undefined });
    const rows = await fetchSecurityHubFindings({ send }, "2026-09-08");
    expect(rows).toHaveLength(2);
    expect(send).toHaveBeenCalledTimes(2);

    const emptySend = vi.fn().mockResolvedValueOnce({ Findings: [], NextToken: undefined });
    const emptyRows = await fetchSecurityHubFindings({ send: emptySend }, "2026-09-08");
    expect(emptyRows).toEqual([expect.objectContaining({ dt: "2026-09-08", zero_findings: true })]);
  });
});

describe("GuardDuty", () => {
  test("mapGuardDutyFinding flattens the fields the lake table expects", () => {
    const row = mapGuardDutyFinding(
      {
        Id: "guardduty-1",
        Type: "Recon:EC2/PortProbeUnprotectedPort",
        Severity: 2,
        Resource: { ResourceType: "Instance" },
        Region: "eu-west-2",
        AccountId: "111111111111",
        Title: "Example",
        CreatedAt: "2026-09-07T00:00:00.000Z",
        UpdatedAt: "2026-09-08T00:00:00.000Z",
      },
      "2026-09-08",
    );
    expect(row).toMatchObject({ finding_id: "guardduty-1", type: "Recon:EC2/PortProbeUnprotectedPort", severity: 2 });
  });

  test("fetchGuardDutyFindings walks every detector and writes a heartbeat row when empty", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ DetectorIds: ["detector-1"] })
      .mockResolvedValueOnce({ FindingIds: ["f1"], NextToken: undefined })
      .mockResolvedValueOnce({ Findings: [{ Id: "f1", Type: "T" }] });
    const rows = await fetchGuardDutyFindings({ send }, "2026-09-08");
    expect(rows).toEqual([expect.objectContaining({ finding_id: "f1" })]);

    const emptySend = vi.fn().mockResolvedValueOnce({ DetectorIds: [] });
    const emptyRows = await fetchGuardDutyFindings({ send: emptySend }, "2026-09-08");
    expect(emptyRows).toEqual([expect.objectContaining({ zero_findings: true })]);
  });
});

describe("GitHub alert counts", () => {
  test("aggregateGithubAlertCounts groups by severity and finds the oldest alert", () => {
    const alerts = [
      { created_at: "2026-09-01T00:00:00Z", rule: { severity: "high" } },
      { created_at: "2026-08-01T00:00:00Z", rule: { severity: "high" } },
      { created_at: "2026-09-05T00:00:00Z", rule: { severity: "low" } },
    ];
    const rows = aggregateGithubAlertCounts("code_scanning", alerts, (a) => a.rule.severity, "2026-09-08");
    expect(rows).toEqual(
      expect.arrayContaining([
        { dt: "2026-09-08", alert_type: "code_scanning", severity: "high", count: 2, oldest_created_at: "2026-08-01T00:00:00Z" },
        { dt: "2026-09-08", alert_type: "code_scanning", severity: "low", count: 1, oldest_created_at: "2026-09-05T00:00:00Z" },
      ]),
    );
  });

  test("aggregateGithubAlertCounts writes a zero row when there are no open alerts", () => {
    const rows = aggregateGithubAlertCounts("secret_scanning", [], () => "n/a", "2026-09-08");
    expect(rows).toEqual([{ dt: "2026-09-08", alert_type: "secret_scanning", severity: null, count: 0, oldest_created_at: null }]);
  });

  test("fetchGithubAlertRows calls all three GitHub alert endpoints", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    const rows = await fetchGithubAlertRows(fetchImpl, "test-token", "diy-accounting-uk/submit.diyaccounting.co.uk", "2026-09-08");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(rows).toHaveLength(3);
    expect(fetchImpl.mock.calls[0][0]).toContain("code-scanning/alerts");
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe("Bearer test-token");
  });

  test("fetchGithubAlertRows throws on a non-ok response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "forbidden" });
    await expect(fetchGithubAlertRows(fetchImpl, "t", "r", "2026-09-08")).rejects.toThrow(/GitHub API error/);
  });
});

describe("lifecycle calendar", () => {
  test("computeDaysRemaining rounds to the nearest day", () => {
    const now = new Date("2026-09-08T00:00:00Z");
    expect(computeDaysRemaining("2026-09-18", now)).toBe(10);
    expect(computeDaysRemaining("2026-09-01", now)).toBe(-7);
    expect(computeDaysRemaining("", now)).toBeNull();
    expect(computeDaysRemaining(null, now)).toBeNull();
  });

  test("readLifecycleToml parses the [[lifecycle]] array", () => {
    const tomlPath = writeTempToml(`
[[lifecycle]]
name = "Widget"
kind = "dependency"
current = "1.0"
end_date = "2026-12-01"
source = "https://example.test"
`);
    const entries = readLifecycleToml(tomlPath);
    expect(entries).toEqual([
      { name: "Widget", kind: "dependency", current: "1.0", end_date: "2026-12-01", source: "https://example.test" },
    ]);
  });

  test("buildLifecycleRows uses the toml's own end_date when no live product slug matches", async () => {
    const tomlPath = writeTempToml(`
[[lifecycle]]
name = "ACM Certificate"
kind = "certificate"
current = "arn:aws:acm:..."
end_date = "2027-02-06"
source = "aws acm describe-certificate"
`);
    const fetchImpl = vi.fn();
    const rows = await buildLifecycleRows(fetchImpl, tomlPath, "2026-09-08", new Date("2026-09-08T00:00:00Z"));
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(rows).toEqual([
      expect.objectContaining({ name: "ACM Certificate", end_date: "2027-02-06", days_remaining: 151 }),
    ]);
  });

  test("buildLifecycleRows fetches a live end date for a known product slug and derives the Lambda deprecation date", async () => {
    const tomlPath = writeTempToml(`
[[lifecycle]]
name = "Lambda Node.js Runtime"
kind = "runtime"
current = "24.0"
end_date = ""
source = "https://nodejs.org/about/releases/"
`);
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ cycle: "24", eol: "2028-04-30" }],
    });
    const rows = await buildLifecycleRows(fetchImpl, tomlPath, "2026-09-08", new Date("2026-09-08T00:00:00Z"));
    expect(fetchImpl).toHaveBeenCalledWith("https://endoflife.date/api/nodejs.json");
    // 30-day grace period applied on top of the upstream EOL date.
    expect(rows[0].end_date).toBe("2028-05-30");
  });

  test("buildLifecycleRows leaves end_date unfilled when endoflife.date 404s", async () => {
    const tomlPath = writeTempToml(`
[[lifecycle]]
name = "AWS CDK"
kind = "dependency"
current = "2.266.0"
end_date = ""
source = "pom.xml"
`);
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const rows = await buildLifecycleRows(fetchImpl, tomlPath, "2026-09-08");
    expect(rows[0].end_date).toBeNull();
    expect(rows[0].days_remaining).toBeNull();
  });

  test("minDaysRemaining ignores rows with no known end date", () => {
    expect(minDaysRemaining([{ days_remaining: 90 }, { days_remaining: null }, { days_remaining: 10 }])).toBe(10);
    expect(minDaysRemaining([{ days_remaining: null }])).toBeNull();
    expect(minDaysRemaining([])).toBeNull();
  });
});

describe("WAF blocks", () => {
  test("fetchWafBlockRows writes a heartbeat row when no WAF log group exists for this environment", async () => {
    const send = vi.fn().mockResolvedValueOnce({ logGroups: [] });
    const rows = await fetchWafBlockRows({ send }, "ci", "2026-09-08");
    expect(rows).toEqual([expect.objectContaining({ zero_findings: true, blocks: 0 })]);
  });

  test("fetchWafBlockRows aggregates Logs Insights results per rule", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ logGroups: [{ logGroupName: "aws-waf-logs-ci-abc123-app" }] })
      .mockResolvedValueOnce({ queryId: "query-1" })
      .mockResolvedValueOnce({
        status: "Complete",
        results: [
          [
            { field: "terminatingRuleId", value: "AWS-AWSManagedRulesCommonRuleSet" },
            { field: "blocks", value: "12" },
          ],
        ],
      });
    const rows = await fetchWafBlockRows({ send }, "ci", "2026-09-08");
    expect(rows).toEqual([
      expect.objectContaining({ rule: "AWS-AWSManagedRulesCommonRuleSet", blocks: 12, log_group: "aws-waf-logs-ci-abc123-app" }),
    ]);
  });
});

describe("rotation record", () => {
  test("readRotationToml parses the [[secret]] array", () => {
    const tomlPath = writeTempToml(`
[[secret]]
name = "stripe/secret_key"
console = "Stripe"
last_rotated = ""
`);
    expect(readRotationToml(tomlPath)).toEqual([{ name: "stripe/secret_key", console: "Stripe", last_rotated: "" }]);
  });

  test("buildRotationRows reads the rotated-at tag off each secret", async () => {
    const tomlPath = writeTempToml(`
[[secret]]
name = "stripe/secret_key"
console = "Stripe"
last_rotated = ""

[[secret]]
name = "missing/secret"
console = "Nowhere"
last_rotated = ""
`);
    const send = vi
      .fn()
      .mockResolvedValueOnce({ Tags: [{ Key: "rotated-at", Value: "2026-08-01" }] })
      .mockRejectedValueOnce(Object.assign(new Error("not found"), { name: "ResourceNotFoundException" }));
    const rows = await buildRotationRows({ send }, tomlPath, "ci", "2026-09-08", new Date("2026-09-08T00:00:00Z"));
    expect(rows).toEqual([
      expect.objectContaining({ secret_name: "stripe/secret_key", found: true, rotated_at: "2026-08-01", age_days: 38 }),
      expect.objectContaining({ secret_name: "missing/secret", found: false }),
    ]);
  });
});
