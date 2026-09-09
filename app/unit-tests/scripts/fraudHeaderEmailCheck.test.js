// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/fraudHeaderEmailCheck.test.js

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";

const mockPublishActivityEvent = vi.fn().mockResolvedValue(undefined);
vi.mock("../../lib/activityAlert.js", () => ({
  publishActivityEvent: (...args) => mockPublishActivityEvent(...args),
}));

const {
  parseIndexLine,
  readIndexRows,
  isFraudPreventionHeaderRow,
  findLatestRow,
  decodeQuotedPrintable,
  extractTextPlainBody,
  computeExpectedReportMonth,
  classifyParsedReport,
  resolveDecision,
  checkFraudPreventionHeaders,
  buildAlertLines,
  buildAlertPayload,
  buildRecord,
  parseArgs,
  main,
} = await import("../../../scripts/fraud-header-email-check.js");

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "fraudHeaderEmailCheck");
const mailDir = path.join(fixturesDir, "mail");
const mailDirMissing = path.join(fixturesDir, "mail-missing");
const mailDirAdvisories = path.join(fixturesDir, "mail-advisories");

function readFixtureEml(relativePath) {
  return readFileSync(path.join(mailDir, relativePath), "utf8");
}

beforeEach(() => {
  mockPublishActivityEvent.mockClear();
});

describe("parseIndexLine", () => {
  it("parses a tab-separated INDEX.tsv row into its fields", () => {
    const row = parseIndexLine(
      "2026-08-05 10:30\tantony@diyaccounting.co.uk\tHMRC fraud prevention <noreply@tax.service.gov.uk>\tantony@diyaccounting.co.uk\tFraud prevention headers for Example App\t\tantony@diyaccounting.co.uk/2026/8/5/correct.eml",
    );

    expect(row).toEqual({
      date: "2026-08-05 10:30",
      mailbox: "antony@diyaccounting.co.uk",
      from: "HMRC fraud prevention <noreply@tax.service.gov.uk>",
      to: "antony@diyaccounting.co.uk",
      subject: "Fraud prevention headers for Example App",
      attachments: "",
      path: "antony@diyaccounting.co.uk/2026/8/5/correct.eml",
    });
  });

  it("returns null for the header row", () => {
    expect(parseIndexLine("date\tmailbox\tfrom\tto\tsubject\tattachments\tpath")).toBeNull();
  });

  it("returns null for a blank line", () => {
    expect(parseIndexLine("")).toBeNull();
  });
});

describe("isFraudPreventionHeaderRow", () => {
  it("matches HMRC's fraud prevention header report regardless of the correct/advisories/zero-traffic subject variant", () => {
    const base = { from: "HMRC fraud prevention <noreply@tax.service.gov.uk>", mailbox: "antony@diyaccounting.co.uk" };
    expect(isFraudPreventionHeaderRow({ ...base, subject: "Fraud prevention headers for DIY Accounting Submit" })).toBe(true);
    expect(isFraudPreventionHeaderRow({ ...base, subject: "Improve fraud prevention headers for DIY Accounting Submit" })).toBe(true);
    expect(isFraudPreventionHeaderRow({ ...base, subject: "Check fraud prevention headers for DIY Accounting Submit" })).toBe(true);
  });

  it("rejects an unrelated email even from the same address", () => {
    expect(
      isFraudPreventionHeaderRow({
        from: "HMRC fraud prevention <noreply@tax.service.gov.uk>",
        subject: "Your Developer Hub password is changing",
      }),
    ).toBe(false);
  });

  it("rejects a fraud-prevention-shaped subject from a different sender", () => {
    expect(
      isFraudPreventionHeaderRow({
        from: "Some Sender <someone@example.com>",
        subject: "Fraud prevention headers for DIY Accounting Submit",
      }),
    ).toBe(false);
  });
});

describe("findLatestRow", () => {
  it("returns the row with the newest date", () => {
    const rows = [{ date: "2026-05-06 10:30" }, { date: "2026-08-05 10:30" }, { date: "2026-07-01 10:30" }];
    expect(findLatestRow(rows)).toEqual({ date: "2026-08-05 10:30" });
  });

  it("returns null for an empty list", () => {
    expect(findLatestRow([])).toBeNull();
  });
});

describe("decodeQuotedPrintable", () => {
  it("decodes hex escapes as UTF-8 bytes", () => {
    expect(decodeQuotedPrintable("application=E2=80=99s headers")).toBe("application’s headers");
  });

  it("removes a soft line break", () => {
    expect(decodeQuotedPrintable("meets the fraud prevention spe=\ncification.")).toBe("meets the fraud prevention specification.");
  });
});

describe("readIndexRows + isFraudPreventionHeaderRow against the fixture mirror", () => {
  it("finds exactly the three fraud prevention header rows, not the unrelated one", () => {
    const rows = readIndexRows(path.join(mailDir, "INDEX.tsv")).filter(isFraudPreventionHeaderRow);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.path).sort()).toEqual(
      [
        "antony@diyaccounting.co.uk/2026/5/6/advisories.eml",
        "antony@diyaccounting.co.uk/2026/7/1/zero-traffic.eml",
        "antony@diyaccounting.co.uk/2026/8/5/correct.eml",
      ].sort(),
    );
  });
});

describe("extractTextPlainBody", () => {
  it("decodes a quoted-printable text/plain part nested inside multipart/mixed > multipart/alternative", () => {
    const text = extractTextPlainBody(readFixtureEml("antony@diyaccounting.co.uk/2026/8/5/correct.eml"));
    expect(text).toContain("Your application’s fraud prevention headers are correct.");
    expect(text).toContain("In production, in August 2026, DIY Accounting Submit meets the fraud prevention specification.");
  });

  it("skips a text/html alternative that is listed before the text/plain part", () => {
    const text = extractTextPlainBody(readFixtureEml("antony@diyaccounting.co.uk/2026/5/6/advisories.eml"));
    expect(text).not.toContain("<html>");
    expect(text).toContain("has advisories that you need to review");
  });

  it("decodes a non-multipart quoted-printable message", () => {
    const text = extractTextPlainBody(readFixtureEml("antony@diyaccounting.co.uk/2026/7/1/zero-traffic.eml"));
    expect(text).toContain("has not sent any requests in June 2026");
  });
});

describe("computeExpectedReportMonth", () => {
  it("is the calendar month before now", () => {
    expect(computeExpectedReportMonth(new Date("2026-09-15T00:00:00Z"))).toEqual({ label: "August 2026", key: "2026-08" });
  });

  it("rolls back across a year boundary", () => {
    expect(computeExpectedReportMonth(new Date("2026-01-15T00:00:00Z"))).toEqual({ label: "December 2025", key: "2025-12" });
  });
});

describe("classifyParsedReport", () => {
  it("classifies errors over advisories when both are present", () => {
    expect(classifyParsedReport({ errors: ["e"], advisories: ["a"], trafficCount: null })).toBe("errors");
  });

  it("classifies advisories when there are no errors", () => {
    expect(classifyParsedReport({ errors: [], advisories: ["a"], trafficCount: null })).toBe("advisories");
  });

  it("classifies zero traffic when there is nothing to review but no traffic either", () => {
    expect(classifyParsedReport({ errors: [], advisories: [], trafficCount: 0 })).toBe("zero-traffic");
  });

  it("classifies correct when there is nothing to flag", () => {
    expect(classifyParsedReport({ errors: [], advisories: [], trafficCount: null })).toBe("correct");
  });
});

describe("resolveDecision", () => {
  const expectedMonth = { label: "August 2026", key: "2026-08" };

  it("is pending, not an alert, when no email has arrived on or before the 10th", () => {
    const decision = resolveDecision({ latestEmail: null, expectedMonth, now: new Date("2026-09-05T00:00:00Z") });
    expect(decision.status).toBe("pending");
    expect(decision.needsAction).toBe(false);
  });

  it("is missing, and an alert, when no email has arrived past the 10th", () => {
    const decision = resolveDecision({ latestEmail: null, expectedMonth, now: new Date("2026-09-15T00:00:00Z") });
    expect(decision.status).toBe("missing");
    expect(decision.needsAction).toBe(true);
    expect(decision.month).toBe("August 2026");
  });

  it("carries the parsed report's own fields through for a matched email", () => {
    const decision = resolveDecision({
      latestEmail: {
        row: { date: "2026-09-05 10:30", subject: "Fraud prevention headers for DIY Accounting Submit" },
        parsed: { month: "August 2026", trafficCount: null, advisories: [], errors: [], needsAction: false },
      },
      expectedMonth,
      now: new Date("2026-09-15T00:00:00Z"),
    });
    expect(decision).toEqual({
      status: "correct",
      needsAction: false,
      month: "August 2026",
      trafficCount: null,
      advisories: [],
      errors: [],
      emailDate: "2026-09-05 10:30",
      subject: "Fraud prevention headers for DIY Accounting Submit",
    });
  });
});

describe("checkFraudPreventionHeaders against the fixture mirror", () => {
  it("finds and parses the correct-month email when it matches the expected month", () => {
    const { decision, expectedMonth } = checkFraudPreventionHeaders({ mailDir, now: new Date("2026-09-15T00:00:00Z") });
    expect(expectedMonth).toEqual({ label: "August 2026", key: "2026-08" });
    expect(decision.status).toBe("correct");
    expect(decision.needsAction).toBe(false);
  });

  it("treats a stale newest email (an earlier month than expected) the same as no email", () => {
    // The fixture mirror's newest fraud prevention row is August 2026's report; asking what
    // September 2026 looked like finds nothing that matches, so it falls back to missing/pending.
    const { decision } = checkFraudPreventionHeaders({ mailDir, now: new Date("2026-10-15T00:00:00Z") });
    expect(decision.status).toBe("missing");
  });

  it("is pending when the mirror has no fraud prevention rows at all and the month isn't overdue", () => {
    const { decision } = checkFraudPreventionHeaders({ mailDir: mailDirMissing, now: new Date("2026-09-05T00:00:00Z") });
    expect(decision.status).toBe("pending");
  });

  it("is missing when the mirror has no fraud prevention rows at all and the month is overdue", () => {
    const { decision } = checkFraudPreventionHeaders({ mailDir: mailDirMissing, now: new Date("2026-09-15T00:00:00Z") });
    expect(decision.status).toBe("missing");
  });
});

describe("buildAlertLines / buildAlertPayload", () => {
  it("carries the parser's advisory sentences for an advisories month", () => {
    const decision = {
      status: "advisories",
      month: "April 2026",
      trafficCount: null,
      advisories: ["Fraud prevention headers have advisories to review for April 2026."],
      errors: [],
    };
    expect(buildAlertLines(decision)).toEqual(["Fraud prevention headers have advisories to review for April 2026."]);

    const payload = buildAlertPayload(decision);
    expect(payload.event).toBe("fraud-prevention-header-report");
    expect(payload.flow).toBe("operational");
    expect(payload.summary).toBe("Fraud prevention headers for April 2026: advisories");
    expect(payload.detail.lines).toEqual(decision.advisories);
  });

  it("states plainly when the month had no traffic", () => {
    const decision = { status: "zero-traffic", month: "June 2026", trafficCount: 0, advisories: [], errors: [] };
    expect(buildAlertLines(decision)).toEqual(["DIY Accounting Submit sent no requests in June 2026."]);
  });

  it("states plainly when the report never arrived", () => {
    const decision = { status: "missing", month: "August 2026", trafficCount: null, advisories: [], errors: [] };
    expect(buildAlertLines(decision)).toEqual(["No fraud prevention header email has arrived for August 2026 yet."]);
  });
});

describe("buildRecord", () => {
  it("shapes the JSON record for the compliance panel", () => {
    const decision = {
      status: "correct",
      needsAction: false,
      month: "August 2026",
      trafficCount: null,
      advisories: [],
      errors: [],
      emailDate: "2026-09-05 10:30",
      subject: "Fraud prevention headers for DIY Accounting Submit",
    };
    const record = buildRecord({ decision, expectedMonth: { label: "August 2026", key: "2026-08" }, checkedAt: "2026-09-15T00:00:00.000Z" });
    expect(record).toEqual({
      month: "August 2026",
      status: "correct",
      checkedAt: "2026-09-15T00:00:00.000Z",
      emailDate: "2026-09-05 10:30",
      subject: "Fraud prevention headers for DIY Accounting Submit",
      trafficCount: null,
      advisories: [],
      errors: [],
      needsAction: false,
    });
  });
});

describe("parseArgs", () => {
  it("parses --dry-run, --mail-dir and --now", () => {
    expect(parseArgs(["--dry-run", "--mail-dir", "/tmp/mail", "--now", "2026-09-15T00:00:00Z"])).toEqual({
      dryRun: true,
      mailDir: "/tmp/mail",
      now: "2026-09-15T00:00:00Z",
    });
  });

  it("defaults to no dry run and no overrides", () => {
    expect(parseArgs([])).toEqual({ dryRun: false, mailDir: undefined, now: undefined });
  });

  it("throws on an unknown argument", () => {
    expect(() => parseArgs(["--bogus"])).toThrow(/Unknown argument/);
  });
});

describe("main", () => {
  let resultDir;

  beforeEach(() => {
    resultDir = mkdtempSync(path.join(tmpdir(), "fraud-header-check-"));
    process.env.FRAUD_HEADER_RESULT_DIR = resultDir;
  });

  afterEach(() => {
    delete process.env.FRAUD_HEADER_RESULT_DIR;
    rmSync(resultDir, { recursive: true, force: true });
  });

  it("publishes an activity event for an advisories month and does not for a correct one", async () => {
    await main(["--mail-dir", mailDirAdvisories, "--now", "2026-05-15T00:00:00Z"]);
    expect(mockPublishActivityEvent).toHaveBeenCalledTimes(1);
    const payload = mockPublishActivityEvent.mock.calls[0][0];
    expect(payload.summary).toBe("Fraud prevention headers for April 2026: advisories");
    expect(JSON.parse(readFileSync(path.join(resultDir, "2026-04.json"), "utf8")).status).toBe("advisories");

    mockPublishActivityEvent.mockClear();
    await main(["--mail-dir", mailDir, "--now", "2026-09-15T00:00:00Z"]);
    expect(mockPublishActivityEvent).not.toHaveBeenCalled();
    expect(JSON.parse(readFileSync(path.join(resultDir, "2026-08.json"), "utf8")).status).toBe("correct");
  });

  it("dry-run prints the decision and publishes nothing", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await main(["--dry-run", "--mail-dir", mailDirAdvisories, "--now", "2026-05-15T00:00:00Z"]);
    expect(mockPublishActivityEvent).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[dry-run] would publish activity event"));
    logSpy.mockRestore();
  });

  it("prints a pending message and does nothing else when the report isn't due yet", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const decision = await main(["--mail-dir", mailDirMissing, "--now", "2026-09-05T00:00:00Z"]);
    expect(decision.status).toBe("pending");
    expect(mockPublishActivityEvent).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
