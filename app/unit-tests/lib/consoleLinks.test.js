// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";

import {
  encodeConsoleHashValue,
  buildAlarmConsoleLink,
  buildLogsInsightsLink,
  buildXRayTraceSearchLink,
} from "@app/lib/consoleLinks.js";

const WORKED_EXAMPLE_QUERY = [
  "SOURCE logGroups(namePrefix: ['/aws/lambda/prod-0f68ed8-app-hmrc-vat-return-post'])",
  "| fields @timestamp, @logStream, level, message, requestId",
  "| filter level >= 40 or @message like /(?i)error|fail|exception/",
  "| sort @timestamp desc",
  "| limit 200",
].join("\n");

const WORKED_EXAMPLE_START = "2026-09-03T21:25:00.000Z";
const WORKED_EXAMPLE_END = "2026-09-03T21:50:23.618Z";

describe("encodeConsoleHashValue", () => {
  test("leaves A-Za-z0-9-_. untouched", () => {
    const value = "Aa0-_.Zz9";
    expect(encodeConsoleHashValue(value)).toBe(value);
  });

  test("encodes space, slash, colon, pipe and newline", () => {
    expect(encodeConsoleHashValue(" ")).toBe("*20");
    expect(encodeConsoleHashValue("/")).toBe("*2f");
    expect(encodeConsoleHashValue(":")).toBe("*3a");
    expect(encodeConsoleHashValue("|")).toBe("*7c");
    expect(encodeConsoleHashValue("\n")).toBe("*0a");
    expect(encodeConsoleHashValue("'")).toBe("*27");
  });

  test("encodes a multi-byte character as one *xx per UTF-8 byte", () => {
    // "é" is 2 UTF-8 bytes: 0xc3 0xa9
    expect(encodeConsoleHashValue("é")).toBe("*c3*a9");
  });
});

describe("buildLogsInsightsLink", () => {
  test("reproduces the worked-example URL exactly, byte for byte", () => {
    const link = buildLogsInsightsLink({
      region: "eu-west-2",
      startIso: WORKED_EXAMPLE_START,
      endIso: WORKED_EXAMPLE_END,
      queryString: WORKED_EXAMPLE_QUERY,
    });
    expect(link).toBe(
      "https://eu-west-2.console.aws.amazon.com/cloudwatch/home?region=eu-west-2#logsV2:logs-insights$3FqueryDetail$3D~(end~'2026-09-03T21*3a50*3a23.618Z~start~'2026-09-03T21*3a25*3a00.000Z~timeType~'ABSOLUTE~tz~'UTC~editorString~'SOURCE*20logGroups*28namePrefix*3a*20*5b*27*2faws*2flambda*2fprod-0f68ed8-app-hmrc-vat-return-post*27*5d*29*0a*7c*20fields*20*40timestamp*2c*20*40logStream*2c*20level*2c*20message*2c*20requestId*0a*7c*20filter*20level*20*3e*3d*2040*20or*20*40message*20like*20*2f*28*3fi*29error*7cfail*7cexception*2f*0a*7c*20sort*20*40timestamp*20desc*0a*7c*20limit*20200~source~())",
    );
  });

  test("returns null for an empty query string", () => {
    expect(buildLogsInsightsLink({ region: "eu-west-2", startIso: "a", endIso: "b", queryString: "" })).toBeNull();
    expect(buildLogsInsightsLink({ region: "eu-west-2", startIso: "a", endIso: "b", queryString: null })).toBeNull();
  });

  test("uses the given region in both the host and the region query parameter", () => {
    const link = buildLogsInsightsLink({
      region: "us-east-1",
      startIso: WORKED_EXAMPLE_START,
      endIso: WORKED_EXAMPLE_END,
      queryString: "SOURCE logGroups(namePrefix: ['/aws/lambda/x'])",
    });
    expect(link).toMatch(/^https:\/\/us-east-1\.console\.aws\.amazon\.com/);
    expect(link).toContain("region=us-east-1");
  });
});

describe("buildXRayTraceSearchLink", () => {
  test("reproduces the worked-example URL exactly", () => {
    const link = buildXRayTraceSearchLink({
      region: "eu-west-2",
      startIso: WORKED_EXAMPLE_START,
      endIso: WORKED_EXAMPLE_END,
      filterExpression: 'service("prod-0f68ed8-app-hmrc-vat-return-post-worker") { fault = true OR error = true }',
    });
    expect(link).toBe(
      "https://eu-west-2.console.aws.amazon.com/xray/home?region=eu-west-2#/traces?timeRange=2026-09-03T21%3A25%3A00.000Z~2026-09-03T21%3A50%3A23.618Z&filter=service(%22prod-0f68ed8-app-hmrc-vat-return-post-worker%22)%20%7B%20fault%20%3D%20true%20OR%20error%20%3D%20true%20%7D",
    );
  });

  test("returns null for an empty filter expression", () => {
    expect(
      buildXRayTraceSearchLink({ region: "eu-west-2", startIso: "a", endIso: "b", filterExpression: "" }),
    ).toBeNull();
    expect(
      buildXRayTraceSearchLink({ region: "eu-west-2", startIso: "a", endIso: "b", filterExpression: null }),
    ).toBeNull();
  });
});

describe("buildAlarmConsoleLink", () => {
  test("builds a region-scoped CloudWatch alarm console URL", () => {
    const link = buildAlarmConsoleLink("eu-west-2", "ci-app-health-failed");
    expect(link).toBe(
      "https://eu-west-2.console.aws.amazon.com/cloudwatch/home?region=eu-west-2#alarmsV2:alarm/ci-app-health-failed",
    );
  });

  test("encodes an alarm name containing a slash", () => {
    const link = buildAlarmConsoleLink("eu-west-2", "ci alarm/with special");
    expect(link).toContain(encodeURIComponent("ci alarm/with special"));
  });
});
