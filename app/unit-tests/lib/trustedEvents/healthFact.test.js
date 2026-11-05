// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { healthFactFromEvent } from "@app/lib/trustedEvents/healthFact.js";

const healthEvent = (detailOverrides = {}) => ({
  "version": "0",
  "id": "7bf73129-1428-4cd3-a780-95db273d1602",
  "detail-type": "AWS Health Event",
  "source": "aws.health",
  "account": "123456789012",
  "time": "2023-01-26T01:43:21Z",
  "region": "eu-west-2",
  "resources": [],
  "detail": {
    eventArn: "arn:aws:health:eu-west-2::event/EC2/AWS_EC2_INSTANCE_STOP_SCHEDULED/AWS_EC2_INSTANCE_STOP_SCHEDULED_ABC123",
    service: "EC2",
    eventTypeCode: "AWS_EC2_INSTANCE_STOP_SCHEDULED",
    eventTypeCategory: "scheduledChange",
    eventScopeCode: "ACCOUNT_SPECIFIC",
    communicationId: "01234567890123456789",
    startTime: "Thu, 26 Jan 2023 01:43:21 GMT",
    endTime: "Thu, 26 Jan 2023 03:43:21 GMT",
    lastUpdatedTime: "Thu, 26 Jan 2023 01:43:21 GMT",
    statusCode: "open",
    eventRegion: "eu-west-2",
    eventDescription: [{ language: "en_US", latestDescription: "A description of the event." }],
    affectedEntities: [{ entityValue: "i-1234567890abcdef0" }],
    affectedAccount: "123456789012",
    page: "1",
    totalPages: "1",
    backupEvent: "false",
    ...detailOverrides,
  },
});

describe("healthFactFromEvent", () => {
  test("builds the key, version and lines", () => {
    const fact = healthFactFromEvent(healthEvent());
    expect(fact.key).toBe(
      "health:123456789012:arn:aws:health:eu-west-2::event/EC2/AWS_EC2_INSTANCE_STOP_SCHEDULED/AWS_EC2_INSTANCE_STOP_SCHEDULED_ABC123",
    );
    expect(fact.version).toBe("open|Thu, 26 Jan 2023 01:43:21 GMT");
    expect(fact.sourceLabel).toBe("health");
    expect(fact.subject).toBe("AWS_EC2_INSTANCE_STOP_SCHEDULED");
    expect(fact.scopeInTitle).toBe(true);
    expect(fact.lines.map(([name]) => name)).toEqual([
      "Service",
      "Event type",
      "Category",
      "Status",
      "Start",
      "End",
      "Event ARN",
      "Affected entities",
    ]);
    expect(fact.description).toBe("A description of the event.");
  });

  test("a new status gives a new version of the same key", () => {
    const open = healthFactFromEvent(healthEvent());
    const closed = healthFactFromEvent(healthEvent({ statusCode: "closed", lastUpdatedTime: "Fri, 27 Jan 2023 01:00:00 GMT" }));
    expect(closed.key).toBe(open.key);
    expect(closed.version).not.toBe(open.version);
  });

  test("skips a public service event", () => {
    expect(healthFactFromEvent(healthEvent({ eventScopeCode: "PUBLIC" }))).toEqual({ skip: true, reason: "public service event" });
  });

  test.each([[true], ["true"]])("skips a backup event %s", (backupEvent) => {
    expect(healthFactFromEvent(healthEvent({ backupEvent })).skip).toBe(true);
  });

  test("skips a page after the first", () => {
    expect(healthFactFromEvent(healthEvent({ page: "2" })).skip).toBe(true);
  });

  test("lists the first 20 affected entities and counts the rest", () => {
    const affectedEntities = Array.from({ length: 23 }, (_, index) => ({ entityValue: `e${index}` }));
    const fact = healthFactFromEvent(healthEvent({ affectedEntities }));
    const value = fact.lines.find(([name]) => name === "Affected entities")[1];
    expect(value.endsWith("e19 and 3 more")).toBe(true);
  });

  test("cuts the description to 4000 characters", () => {
    const fact = healthFactFromEvent(healthEvent({ eventDescription: [{ latestDescription: "x".repeat(5000) }] }));
    expect(fact.description).toHaveLength(4000);
  });

  test("leaves out End and Actionability when absent", () => {
    const fact = healthFactFromEvent(healthEvent({ endTime: undefined }));
    expect(fact.lines.map(([name]) => name)).not.toContain("End");
    expect(fact.lines.map(([name]) => name)).not.toContain("Actionability");
  });

  test("throws on a missing event ARN", () => {
    expect(() => healthFactFromEvent(healthEvent({ eventArn: undefined }))).toThrow("no eventArn");
  });
});
