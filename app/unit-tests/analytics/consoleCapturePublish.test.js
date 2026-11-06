// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// Each client class records its constructor config and answers from a per-command handler the
// test sets, so no real SDK call is made.
const cloudWatchHandler = vi.fn();
const logsHandler = vi.fn();
const xrayHandler = vi.fn();
const constructed = [];

vi.mock("@aws-sdk/client-cloudwatch", () => ({
  CloudWatchClient: class {
    constructor(config) {
      constructed.push({ service: "cloudwatch", config });
    }
    send(command) {
      return cloudWatchHandler(command);
    }
  },
  GetMetricWidgetImageCommand: class {
    constructor(input) {
      this.input = input;
      this.name = "GetMetricWidgetImage";
    }
  },
  GetMetricDataCommand: class {
    constructor(input) {
      this.input = input;
      this.name = "GetMetricData";
    }
  },
  DescribeAlarmsCommand: class {
    constructor(input) {
      this.input = input;
      this.name = "DescribeAlarms";
    }
  },
}));
vi.mock("@aws-sdk/client-cloudwatch-logs", () => ({
  CloudWatchLogsClient: class {
    send(command) {
      return logsHandler(command);
    }
  },
  StartQueryCommand: class {
    constructor(input) {
      this.input = input;
      this.name = "StartQuery";
    }
  },
  GetQueryResultsCommand: class {
    constructor(input) {
      this.input = input;
      this.name = "GetQueryResults";
    }
  },
}));
vi.mock("@aws-sdk/client-xray", () => ({
  XRayClient: class {
    send(command) {
      return xrayHandler(command);
    }
  },
  GetServiceGraphCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));
vi.mock("@aws-sdk/client-sts", () => ({
  STSClient: class {},
  AssumeRoleCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {},
  PutObjectCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

import { runConsoleCapture } from "@app/functions/analytics/consoleCapturePublish.js";

const PNG = new Uint8Array([137, 80, 78, 71]);
const NOW = new Date("2026-11-02T02:20:00.000Z");

function widgetAnswer() {
  return { MetricWidgetImage: PNG };
}

function defaultCloudWatch(command) {
  if (command.name === "GetMetricWidgetImage") return widgetAnswer();
  if (command.name === "GetMetricData") return { MetricDataResults: [{ Id: "e1", Values: [1] }] };
  return {
    MetricAlarms: [
      { AlarmName: "ci-env-b", StateValue: "OK", StateReason: "fine", StateUpdatedTimestamp: new Date("2026-11-01T00:00:00Z") },
      {
        AlarmName: "ci-env-a",
        StateValue: "ALARM",
        StateReason: "Threshold crossed",
        StateUpdatedTimestamp: new Date("2026-11-02T01:00:00Z"),
      },
    ],
  };
}

function setLogsComplete() {
  logsHandler.mockImplementation(async (command) => {
    if (command.name === "StartQuery") return { queryId: "q1" };
    return {
      status: "Complete",
      results: [
        [
          { field: "bin(1h)", value: "2026-11-02 01:00:00.000" },
          { field: "modelId", value: "model-a" },
          { field: "invocations", value: "3" },
          { field: "inputTokens", value: "30" },
          { field: "outputTokens", value: "9" },
        ],
      ],
    };
  });
}

function setXray() {
  xrayHandler.mockResolvedValue({
    Services: [
      {
        Name: "quiet",
        Type: "AWS::Lambda",
        SummaryStatistics: {
          TotalCount: 10,
          TotalResponseTime: 2,
          ErrorStatistics: { TotalCount: 0, ThrottleCount: 0 },
          FaultStatistics: { TotalCount: 0 },
        },
      },
      {
        Name: "broken",
        Type: "AWS::Lambda",
        SummaryStatistics: {
          TotalCount: 4,
          TotalResponseTime: 1,
          ErrorStatistics: { TotalCount: 1, ThrottleCount: 1 },
          FaultStatistics: { TotalCount: 2 },
        },
      },
    ],
  });
}

function makeDependencies() {
  const puts = [];
  return {
    puts,
    dependencies: {
      now: NOW,
      sleep: async () => {},
      s3Client: { send: async (command) => puts.push(command.input) },
    },
  };
}

function indexFrom(puts) {
  const put = puts.find((input) => input.Key.endsWith("console/index.json"));
  return JSON.parse(put.Body);
}

describe("consoleCapturePublish", () => {
  beforeEach(() => {
    cloudWatchHandler.mockReset();
    logsHandler.mockReset();
    xrayHandler.mockReset();
    constructed.length = 0;
    cloudWatchHandler.mockImplementation(async (command) => defaultCloudWatch(command));
    setLogsComplete();
    setXray();
    process.env.ENVIRONMENT_NAME = "ci";
    process.env.ANALYTICS_LAKE_BUCKET_NAME = "ci-env-analytics-lake";
    delete process.env.CONSOLE_CAPTURE_ROLE_ARNS;
    delete process.env.CONSOLE_CAPTURE_EXTERNAL_ID;
  });

  afterEach(() => {
    delete process.env.ENVIRONMENT_NAME;
    delete process.env.ANALYTICS_LAKE_BUCKET_NAME;
    delete process.env.CONSOLE_CAPTURE_ROLE_ARNS;
    delete process.env.CONSOLE_CAPTURE_EXTERNAL_ID;
  });

  test("requires its environment variables", async () => {
    delete process.env.ANALYTICS_LAKE_BUCKET_NAME;
    await expect(runConsoleCapture(makeDependencies().dependencies)).rejects.toThrow(/ANALYTICS_LAKE_BUCKET_NAME/);
  });

  test("a ci run renders every ci item and writes one PNG per graph and one index", async () => {
    const { puts, dependencies } = makeDependencies();

    const result = await runConsoleCapture(dependencies);

    const index = indexFrom(puts);
    expect(result).toEqual({ items: 22, failed: 0 });
    expect(Object.keys(index.items)).toHaveLength(22);
    expect(index.environment).toBe("ci");
    expect(index.items["ci-lambda-errors"]).toMatchObject({ kind: "image", imageKey: "snapshots/ci/console/ci/ci-lambda-errors.png" });
    expect(puts.filter((input) => input.Key.endsWith(".png"))).toHaveLength(19);
    expect(puts.find((input) => input.Key.endsWith("ci-lambda-errors.png")).ContentType).toBe("image/png");
  });

  test("a ci run calls GetMetricWidgetImage with a SORTed search widget in the local region", async () => {
    await runConsoleCapture(makeDependencies().dependencies);

    const widgetCall = cloudWatchHandler.mock.calls.map((call) => call[0]).find((command) => command.name === "GetMetricWidgetImage");
    const widget = JSON.parse(widgetCall.input.MetricWidget);
    expect(widget.region).toBe("eu-west-2");
    expect(widget.metrics[0][0].expression).toMatch(/^SORT\(SEARCH\(/);
  });

  test("an image entry records whether its graph holds data in the range", async () => {
    cloudWatchHandler.mockImplementation(async (command) => {
      if (command.name === "GetMetricData") {
        const empty = command.input.MetricDataQueries[0].Expression?.includes("HmrcAuthentications");
        return { MetricDataResults: [{ Id: "e1", Values: empty ? [] : [2] }] };
      }
      return defaultCloudWatch(command);
    });
    const { puts, dependencies } = makeDependencies();

    await runConsoleCapture(dependencies);

    const items = indexFrom(puts).items;
    expect(items["ci-hmrc-authentications"].hasData).toBe(false);
    expect(items["ci-lambda-errors"].hasData).toBe(true);
    const call = cloudWatchHandler.mock.calls.map((entry) => entry[0]).find((command) => command.name === "GetMetricData");
    expect(call.input.EndTime).toEqual(NOW);
    expect(call.input.StartTime).toEqual(new Date(NOW.getTime() - 30 * 86400 * 1000));
  });

  test("a failed data check keeps the image and records no answer", async () => {
    cloudWatchHandler.mockImplementation(async (command) => {
      if (command.name === "GetMetricData") throw new Error("denied");
      return defaultCloudWatch(command);
    });
    const { puts, dependencies } = makeDependencies();

    const result = await runConsoleCapture(dependencies);

    expect(result.failed).toBe(0);
    expect(indexFrom(puts).items["ci-lambda-errors"]).toMatchObject({ kind: "image", hasData: null });
  });

  test("the alarms table puts ALARM rows first", async () => {
    const { puts, dependencies } = makeDependencies();
    await runConsoleCapture(dependencies);
    const rows = indexFrom(puts).items["ci-alarms"].rows;
    expect(rows.map((row) => row.name)).toEqual(["ci-env-a", "ci-env-b"]);
    expect(rows[0].state).toBe("ALARM");
  });

  test("the Bedrock item stores counts from the fixed query and no log line", async () => {
    const { puts, dependencies } = makeDependencies();
    await runConsoleCapture(dependencies);
    const startQuery = logsHandler.mock.calls.map((call) => call[0]).find((command) => command.name === "StartQuery");
    expect(startQuery.input.logGroupName).toBe("/ci/bedrock/invocations");
    expect(startQuery.input.queryString).toMatch(/^filter ispresent\(modelId\) \| stats count\(\*\) as invocations/);
    expect(indexFrom(puts).items["ci-bedrock"].rows).toEqual([
      { bin: "2026-11-02 01:00:00.000", modelId: "model-a", invocations: 3, inputTokens: 30, outputTokens: 9 },
    ]);
  });

  test("the X-Ray item sorts services by faults and computes the average response time", async () => {
    const { puts, dependencies } = makeDependencies();
    await runConsoleCapture(dependencies);
    const rows = indexFrom(puts).items["ci-xray"].rows;
    expect(rows.map((row) => row.name)).toEqual(["broken", "quiet"]);
    expect(rows[0]).toMatchObject({ requests: 4, errors: 1, faults: 2, throttles: 1, averageResponseMilliseconds: 250 });
  });

  test("one failed item records its error and the others continue", async () => {
    cloudWatchHandler.mockImplementation(async (command) => {
      if (command.name === "GetMetricWidgetImage" && command.input.MetricWidget.includes("Throttles")) {
        const error = new Error("not authorised");
        error.name = "AccessDenied";
        throw error;
      }
      return defaultCloudWatch(command);
    });
    const { puts, dependencies } = makeDependencies();

    const result = await runConsoleCapture(dependencies);

    const index = indexFrom(puts);
    expect(result).toEqual({ items: 22, failed: 1 });
    expect(index.items["ci-lambda-throttles"].error).toBe("AccessDenied: not authorised");
    expect(index.items["ci-lambda-throttles"].imageKey).toBeUndefined();
    expect(index.items["ci-lambda-errors"].imageKey).toBeDefined();
    expect(index.items["ci-alarms"].rows).toHaveLength(2);
  });

  test("a Bedrock query that fails is an error entry", async () => {
    logsHandler.mockImplementation(async (command) => (command.name === "StartQuery" ? { queryId: "q1" } : { status: "Failed" }));
    const { puts, dependencies } = makeDependencies();
    await runConsoleCapture(dependencies);
    expect(indexFrom(puts).items["ci-bedrock"].error).toMatch(/ended Failed/);
  });

  test("a prod run reads ci and both sibling accounts through assumed roles with the external id", async () => {
    process.env.ENVIRONMENT_NAME = "prod";
    process.env.ANALYTICS_LAKE_BUCKET_NAME = "prod-env-analytics-lake";
    process.env.CONSOLE_CAPTURE_ROLE_ARNS = JSON.stringify({
      ci: "arn:aws:iam::367191799875:role/ci-env-console-capture-read",
      spreadsheets: "arn:aws:iam::064390746177:role/spreadsheets-console-capture-read",
      gateway: "arn:aws:iam::283165661847:role/gateway-console-capture-read",
    });
    process.env.CONSOLE_CAPTURE_EXTERNAL_ID = "submit-console-capture";
    const assumed = [];
    const { puts, dependencies } = makeDependencies();
    dependencies.stsClient = {
      send: async (command) => {
        assumed.push(command.input);
        return { Credentials: { AccessKeyId: "AK", SecretAccessKey: "SK", SessionToken: "ST" } };
      },
    };

    const result = await runConsoleCapture(dependencies);

    expect(assumed.map((input) => input.RoleArn)).toEqual([
      "arn:aws:iam::367191799875:role/ci-env-console-capture-read",
      "arn:aws:iam::064390746177:role/spreadsheets-console-capture-read",
      "arn:aws:iam::283165661847:role/gateway-console-capture-read",
    ]);
    expect(assumed.every((input) => input.ExternalId === "submit-console-capture" && input.DurationSeconds === 900)).toBe(true);
    expect(result).toEqual({ items: 48, failed: 0 });
    const index = indexFrom(puts);
    expect(index.items["spreadsheets-rum-vitals"].imageKey).toBe("snapshots/prod/console/spreadsheets/spreadsheets-rum-vitals.png");
    const siblingClient = constructed.filter((entry) => entry.config.region === "us-east-1");
    expect(siblingClient).toHaveLength(2);
    expect(siblingClient[0].config.credentials).toEqual({ accessKeyId: "AK", secretAccessKey: "SK", sessionToken: "ST" });
    // prod itself uses the function's own credentials
    expect(constructed[0].config.credentials).toBeUndefined();
  });

  test("a sibling assume failure records its error and the other targets continue", async () => {
    process.env.ENVIRONMENT_NAME = "prod";
    process.env.ANALYTICS_LAKE_BUCKET_NAME = "prod-env-analytics-lake";
    process.env.CONSOLE_CAPTURE_ROLE_ARNS = JSON.stringify({
      ci: "arn:aws:iam::367191799875:role/ci-env-console-capture-read",
      spreadsheets: "arn:aws:iam::064390746177:role/spreadsheets-console-capture-read",
      gateway: "arn:aws:iam::283165661847:role/gateway-console-capture-read",
    });
    process.env.CONSOLE_CAPTURE_EXTERNAL_ID = "submit-console-capture";
    const { puts, dependencies } = makeDependencies();
    dependencies.stsClient = {
      send: async (command) => {
        if (command.input.RoleArn.includes("spreadsheets")) {
          const error = new Error("not authorized to assume");
          error.name = "AccessDenied";
          throw error;
        }
        return { Credentials: { AccessKeyId: "AK", SecretAccessKey: "SK", SessionToken: "ST" } };
      },
    };

    const result = await runConsoleCapture(dependencies);

    const index = indexFrom(puts);
    expect(result.failed).toBe(2);
    expect(index.items["spreadsheets-rum-vitals"].error).toBe("AccessDenied: not authorized to assume");
    expect(index.items["gateway-rum-vitals"].imageKey).toBeDefined();
    expect(index.items["ci-alarms"].rows).toHaveLength(2);
    expect(index.items["prod-alarms"].rows).toHaveLength(2);
  });

  test("a prod run without a configured role marks that target's items as failed", async () => {
    process.env.ENVIRONMENT_NAME = "prod";
    process.env.ANALYTICS_LAKE_BUCKET_NAME = "prod-env-analytics-lake";
    const { puts, dependencies } = makeDependencies();
    dependencies.stsClient = { send: vi.fn() };

    await runConsoleCapture(dependencies);

    expect(indexFrom(puts).items["ci-alarms"].error).toMatch(/No read role is configured for ci/);
    expect(dependencies.stsClient.send).not.toHaveBeenCalled();
  });
});
