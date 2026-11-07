// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { acmFactFromEvent, bucketFor } from "@app/lib/trustedEvents/acmFact.js";

const ARN = "arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-0000-0000-000000000000";

const acmEvent = (detailType, detail = {}) => ({
  "id": "evt-1",
  "detail-type": detailType,
  "source": "aws.acm",
  "account": "123456789012",
  "time": "2026-11-01T00:00:00Z",
  "region": "us-east-1",
  "resources": [ARN],
  "detail": { DaysToExpiry: 20, CommonName: "example.com", ...detail },
});

const certificate = (overrides = {}) => ({
  DomainName: "example.com",
  NotAfter: new Date("2026-11-21T00:00:00Z"),
  Status: "ISSUED",
  InUseBy: ["arn:aws:cloudfront::123456789012:distribution/EXAMPLE"],
  RenewalSummary: { RenewalStatus: "PENDING_VALIDATION", RenewalStatusReason: "PCA_LIMIT_EXCEEDED" },
  ...overrides,
});

describe("bucketFor", () => {
  const buckets = [30, 15, 7, 3, 1, 0];
  test.each([
    [31, null],
    [30, 30],
    [29, 30],
    [16, 30],
    [15, 15],
    [1, 1],
    [0, 0],
    [-2, 0],
  ])("%s gives %s", (days, expected) => {
    expect(bucketFor(days, buckets)).toBe(expected);
  });
});

describe("acmFactFromEvent", () => {
  test("approaching expiration keys on the certificate and its expiry date", () => {
    const fact = acmFactFromEvent(acmEvent("ACM Certificate Approaching Expiration"), certificate());
    expect(fact.key).toBe(`acm:${ARN}:2026-11-21`);
    expect(fact.version).toBe("days:30");
    expect(fact.region).toBe("us-east-1");
    expect(fact.subject).toBe("example.com certificate expires in 20 days");
    expect(fact.sourceLabel).toBe("acm");
    expect(fact.lines.map(([name]) => name)).toEqual([
      "Detail type",
      "Certificate ARN",
      "Common name",
      "Not after",
      "Days to expiry",
      "Renewal status",
      "In use by",
    ]);
  });

  test("a lower day count moves to a lower bucket", () => {
    const fact = acmFactFromEvent(acmEvent("ACM Certificate Approaching Expiration", { DaysToExpiry: 6 }), certificate());
    expect(fact.version).toBe("days:7");
  });

  test("days above the first bucket skip", () => {
    const fact = acmFactFromEvent(acmEvent("ACM Certificate Approaching Expiration", { DaysToExpiry: 31 }), certificate());
    expect(fact.skip).toBe(true);
  });

  test("renewal action required carries the reason and the bucket", () => {
    const fact = acmFactFromEvent(acmEvent("ACM Certificate Renewal Action Required", { DaysToExpiry: 10 }), certificate());
    expect(fact.version).toBe("renewal:PCA_LIMIT_EXCEEDED:15");
    expect(fact.subject).toBe("example.com certificate needs renewal action");
    expect(fact.lines.map(([name]) => name)).toContain("Renewal reason");
  });

  test("expired and revoked have fixed versions", () => {
    expect(acmFactFromEvent(acmEvent("ACM Certificate Expired"), certificate()).version).toBe("expired");
    expect(acmFactFromEvent(acmEvent("ACM Certificate Revoked"), certificate()).version).toBe("revoked");
  });

  test("a certificate that is not found skips", () => {
    expect(acmFactFromEvent(acmEvent("ACM Certificate Expired"), null)).toEqual({ skip: true, reason: "certificate not found" });
  });

  test("a certificate that nothing uses skips", () => {
    expect(acmFactFromEvent(acmEvent("ACM Certificate Expired"), certificate({ InUseBy: [] }))).toEqual({
      skip: true,
      reason: "certificate not in use",
    });
  });

  test("computes the days from the expiry date when the event does not carry them", () => {
    const fact = acmFactFromEvent(acmEvent("ACM Certificate Expired", { DaysToExpiry: undefined }), certificate());
    expect(fact.lines.find(([name]) => name === "Days to expiry")[1]).toBe(20);
  });
});
