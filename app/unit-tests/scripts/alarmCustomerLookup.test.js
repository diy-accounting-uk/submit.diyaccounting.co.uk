// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/alarmCustomerLookup.test.js

import { describe, test, expect } from "vitest";

import {
  parseArgs,
  envPrefixOf,
  windowOf,
  activityQuery,
  failureEventsOf,
  cognitoSubOf,
  formatLookupFile,
} from "../../../scripts/alarm-customer-lookup.mjs";

const window = windowOf("2026-09-03T21:50:23.618Z");

const customer = {
  hashedSub: "abc123",
  events: [
    {
      event_ts: "2026-09-03 21:30:01.000",
      event: "vat-return-failed",
      failure: "obligation-lookup-failed",
      hmrc_status: "403",
      request_id: "req-1",
      summary: "a | b",
    },
  ],
  hmrcExchanges: [
    {
      createdAt: "2026-09-03T21:30:00.000Z",
      method: "GET",
      status: 403,
      requestId: "req-1",
      message: "The client and/or agent is not authorised",
    },
  ],
  account: { username: "Google_1", status: "EXTERNAL_PROVIDER", created: "2026-09-03T21:20:00.000Z", email: "n@example.com" },
  bundles: [{ bundleId: "day-guest", tokensConsumed: 0 }],
};

describe("alarm-customer-lookup", () => {
  test("parseArgs requires the alarm name, timestamp and output path", () => {
    expect(() => parseArgs(["--alarm-name", "prod-env-x"])).toThrow(/required/);
    const opts = parseArgs(["--alarm-name", "a", "--timestamp", "t", "--out", "o", "--issue-number", "7"]);
    expect(opts.issueNumber).toBe("7");
  });

  test("envPrefixOf reads the environment from the alarm name", () => {
    expect(envPrefixOf("prod-env-hmrc-submission-failure")).toBe("prod-env");
    expect(() => envPrefixOf("other")).toThrow();
  });

  test("the window runs from an hour before the alarm to five minutes after", () => {
    expect(window.start.toISOString()).toBe("2026-09-03T20:50:23.618Z");
    expect(window.end.toISOString()).toBe("2026-09-03T21:55:23.618Z");
  });

  test("the activity query filters partitions, test users and customers without a hashed sub", () => {
    const sql = activityQuery(window.start, window.end, ["vat-return-failed"]);
    expect(sql).toContain("FROM activity_events_all");
    expect(sql).toContain("dt BETWEEN DATE '2026-09-03' AND DATE '2026-09-03'");
    expect(sql).toContain("actor <> 'test-user'");
    expect(sql).toContain("TIMESTAMP '2026-09-03 20:50:23'");
    expect(sql).toContain("event IN ('vat-return-failed')");
  });

  test("the activity query names both days when the window crosses midnight", () => {
    const crossing = windowOf("2026-09-04T00:10:00.000Z");
    const sql = activityQuery(crossing.start, crossing.end, ["vat-return-failed"]);
    expect(sql).toContain("dt BETWEEN DATE '2026-09-03' AND DATE '2026-09-04'");
  });

  test("each alarm maps to the failure events its writers emit", () => {
    expect(failureEventsOf("prod-env-hmrc-submission-failure")).toEqual(["vat-return-failed"]);
    expect(failureEventsOf("prod-env-itsa-submission-failure")).toContain("itsa-final-declaration-failed");
    expect(() => failureEventsOf("prod-env-other")).toThrow();
  });

  test("cognitoSubOf reads the sub from the fraud header", () => {
    expect(cognitoSubOf([{ httpRequest: { headers: { "Gov-Client-User-IDs": "cognito=sub-9" } } }])).toBe("sub-9");
    expect(cognitoSubOf([{ httpRequest: { headers: {} } }])).toBe("");
  });

  test("formats the customer, HMRC's answer, the entitlement and the support pointer", () => {
    const text = formatLookupFile({
      alarmName: "prod-env-hmrc-submission-failure",
      issueNumber: "301",
      issueUrl: "https://github.com/o/r/issues/301",
      timestamp: "2026-09-03T21:50:23.618Z",
      window,
      customers: [customer],
    });
    expect(text).toContain("# prod-env-hmrc-submission-failure #301");
    expect(text).toContain("## Customer abc123");
    expect(text).toContain("- Email: n@example.com");
    expect(text).toContain("The client and/or agent is not authorised");
    expect(text).toContain("| day-guest | 0 |");
    expect(text).toContain("a \\| b");
    expect(text).toContain("Search both mailboxes for n@example.com");
  });

  test("a lookup that finds nothing still writes a file saying so", () => {
    const text = formatLookupFile({
      alarmName: "prod-env-itsa-submission-failure",
      issueNumber: "302",
      issueUrl: "",
      timestamp: "2026-09-03T21:50:23.618Z",
      window,
      customers: [],
    });
    expect(text).toContain("Customers with a failed submission in the window: 0");
    expect(text).toContain("No non-test activity event with a failure was found");
  });

  test("a customer with no Cognito account says so and has no email to search", () => {
    const text = formatLookupFile({
      alarmName: "prod-env-hmrc-submission-failure",
      issueNumber: "1",
      issueUrl: "",
      timestamp: "2026-09-03T21:50:23.618Z",
      window,
      customers: [{ ...customer, account: undefined }],
    });
    expect(text).toContain("not found in Cognito");
    expect(text).toContain("No email to search for.");
  });
});
