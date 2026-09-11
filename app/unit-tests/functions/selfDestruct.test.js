// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/selfDestruct.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Mock CloudFormation client to simulate 'stack does not exist'
const describedStackNames = [];
class MockCFClient {
  async send(cmd) {
    const name = cmd.input?.StackName || "";
    // Always throw for DescribeStacks to simulate non-existent stacks
    if (cmd.constructor.name === "DescribeStacksCommand") {
      describedStackNames.push(name);
      const err = new Error(`Stack with id ${name} does not exist`);
      throw err;
    }
    // DeleteStack should not be called in this scenario, but return ok if it is
    return {};
  }
}

vi.mock("@aws-sdk/client-cloudformation", () => {
  const DescribeStacksCommand = class DescribeStacksCommand {
    constructor(input) {
      this.input = input;
    }
  };
  const DeleteStackCommand = class DeleteStackCommand {
    constructor(input) {
      this.input = input;
    }
  };
  return {
    CloudFormationClient: MockCFClient,
    DescribeStacksCommand,
    DeleteStackCommand,
  };
});

const logGroupCalls = [];
let extraLogGroupsUsEast1 = [];
class MockLogsClient {
  constructor({ region }) {
    this.region = region;
  }
  async send(cmd) {
    logGroupCalls.push({ region: this.region, command: cmd.constructor.name, input: cmd.input });
    if (cmd.constructor.name === "DescribeLogGroupsCommand") {
      if (this.region !== "us-east-1") return { logGroups: [] };
      return {
        logGroups: [
          { logGroupName: `${cmd.input.logGroupNamePrefix}EdgeStack-AwsCustomResourceProvider` },
          ...extraLogGroupsUsEast1.map(({ suffix, retentionInDays }) => ({
            logGroupName: `${cmd.input.logGroupNamePrefix}${suffix}`,
            retentionInDays,
          })),
        ],
      };
    }
    return {};
  }
}

vi.mock("@aws-sdk/client-cloudwatch-logs", () => {
  const DescribeLogGroupsCommand = class DescribeLogGroupsCommand {
    constructor(input) {
      this.input = input;
    }
  };
  const DeleteLogGroupCommand = class DeleteLogGroupCommand {
    constructor(input) {
      this.input = input;
    }
  };
  return { CloudWatchLogsClient: MockLogsClient, DescribeLogGroupsCommand, DeleteLogGroupCommand };
});

// Mock S3 client to simulate the origin bucket not existing yet (EdgeStack still creating it)
class MockS3Client {
  async send(cmd) {
    if (cmd.constructor.name === "ListObjectsV2Command") {
      const err = new Error("The specified bucket does not exist");
      err.name = "NoSuchBucket";
      throw err;
    }
    if (cmd.constructor.name === "GetBucketLocationCommand") {
      return { LocationConstraint: "eu-west-2" };
    }
    return {};
  }
}

vi.mock("@aws-sdk/client-s3", () => {
  const GetBucketLocationCommand = class GetBucketLocationCommand {
    constructor(input) {
      this.input = input;
    }
  };
  const ListObjectsV2Command = class ListObjectsV2Command {
    constructor(input) {
      this.input = input;
    }
  };
  const DeleteObjectsCommand = class DeleteObjectsCommand {
    constructor(input) {
      this.input = input;
    }
  };
  return { S3Client: MockS3Client, GetBucketLocationCommand, ListObjectsV2Command, DeleteObjectsCommand };
});

// Mock SSM and CloudWatch clients for the alarm-silence call at the start of ingestHandler
const mockSsmSend = vi.fn();
class MockSsmClient {
  async send(...args) {
    return mockSsmSend(...args);
  }
}

vi.mock("@aws-sdk/client-ssm", () => {
  const GetParameterCommand = class GetParameterCommand {
    constructor(input) {
      this.input = input;
    }
  };
  const PutParameterCommand = class PutParameterCommand {
    constructor(input) {
      this.input = input;
    }
  };
  return { SSMClient: MockSsmClient, GetParameterCommand, PutParameterCommand };
});

const mockCloudWatchSend = vi.fn();
class MockCloudWatchClient {
  async send(...args) {
    return mockCloudWatchSend(...args);
  }
}

vi.mock("@aws-sdk/client-cloudwatch", () => {
  const DescribeAlarmsCommand = class DescribeAlarmsCommand {
    constructor(input) {
      this.input = input;
    }
  };
  const DisableAlarmActionsCommand = class DisableAlarmActionsCommand {
    constructor(input) {
      this.input = input;
    }
  };
  return { CloudWatchClient: MockCloudWatchClient, DescribeAlarmsCommand, DisableAlarmActionsCommand };
});

function makeEvent() {
  return {
    requestContext: { http: { method: "POST", path: "/ops/self-destruct" } },
    headers: {},
  };
}

describe("functions/infra/selfDestruct", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    logGroupCalls.length = 0;
    extraLogGroupsUsEast1 = [];
    describedStackNames.length = 0;
    mockSsmSend.mockRejectedValue(Object.assign(new Error("Parameter not found"), { name: "ParameterNotFound" }));
    mockCloudWatchSend.mockResolvedValue({ MetricAlarms: [], CompositeAlarms: [] });
    Object.assign(process.env, {
      DEPLOYMENT_NAME: "ci-branch",
      OPS_STACK_NAME: "ops",
      PUBLISH_STACK_NAME: "publish",
      EDGE_STACK_NAME: "edge",
      API_STACK_NAME: "api",
      AUTH_STACK_NAME: "auth",
      HMRC_STACK_NAME: "hmrc",
      HMRC_ITSA_STACK_NAME: "hmrc-itsa",
      COMPANIES_HOUSE_STACK_NAME: "companies-house",
      BILLING_STACK_NAME: "billing",
      DIYA_GL_STACK_NAME: "diya-gl",
      ACCOUNT_STACK_NAME: "account",
      SELF_DESTRUCT_STACK_NAME: "self-destruct",
      AWS_REGION: "eu-west-2",
    });
  });

  it("returns 200 and skips deletions when stacks do not exist", async () => {
    const { ingestHandler } = await import("@app/functions/infra/selfDestruct.js");
    const fakeContext = { getRemainingTimeInMillis: () => 900000 };
    const res = await ingestHandler(makeEvent(), fakeContext);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.message).toMatch(/Self-destruct sequence completed/);
    // Expect at least one result with skipped
    expect(body.results.some((r) => r.status === "skipped")).toBe(true);
  });

  it("deletes the deployment's leftover Lambda log groups in both regions once its stacks are gone", async () => {
    const { ingestHandler } = await import("@app/functions/infra/selfDestruct.js");
    const res = await ingestHandler(makeEvent(), { getRemainingTimeInMillis: () => 900000 });
    expect(res.statusCode).toBe(200);

    const describes = logGroupCalls.filter((c) => c.command === "DescribeLogGroupsCommand");
    expect(describes.map((c) => c.region).sort()).toEqual(["eu-west-2", "us-east-1"]);
    expect(describes.every((c) => c.input.logGroupNamePrefix === "/aws/lambda/ci-branch-")).toBe(true);

    const deletes = logGroupCalls.filter((c) => c.command === "DeleteLogGroupCommand");
    expect(deletes).toEqual([
      {
        region: "us-east-1",
        command: "DeleteLogGroupCommand",
        input: { logGroupName: "/aws/lambda/ci-branch-EdgeStack-AwsCustomResourceProvider" },
      },
    ]);
    const body = JSON.parse(res.body);
    expect(body.results.find((r) => r.logGroups)).toEqual({
      logGroups: ["us-east-1:/aws/lambda/ci-branch-EdgeStack-AwsCustomResourceProvider"],
      status: "deleted",
      error: null,
    });
  });

  it("skips a leftover log group that already carries a retention period", async () => {
    extraLogGroupsUsEast1 = [{ suffix: "ApiStack-hmrcTokenPost", retentionInDays: 30 }];

    const { ingestHandler } = await import("@app/functions/infra/selfDestruct.js");
    const res = await ingestHandler(makeEvent(), { getRemainingTimeInMillis: () => 900000 });
    expect(res.statusCode).toBe(200);

    const deletes = logGroupCalls.filter((c) => c.command === "DeleteLogGroupCommand");
    expect(deletes.map((c) => c.input.logGroupName)).toEqual(["/aws/lambda/ci-branch-EdgeStack-AwsCustomResourceProvider"]);
    expect(deletes.some((c) => c.input.logGroupName.includes("ApiStack-hmrcTokenPost"))).toBe(false);
  });

  it("deletes stacks in dependency order, with the Companies House stack beside the HMRC stack", async () => {
    const { ingestHandler } = await import("@app/functions/infra/selfDestruct.js");
    const res = await ingestHandler(makeEvent(), { getRemainingTimeInMillis: () => 900000 });
    expect(res.statusCode).toBe(200);

    // The API Gateway custom-domain cleanup describes the API stack before the deletion loop
    // starts, so "api" appears once up front; the loop then visits it again in order.
    const orderedStackNames = [...new Set(describedStackNames)];
    expect(orderedStackNames).toEqual([
      "api",
      "ops",
      "publish",
      "edge",
      "auth",
      "hmrc",
      "hmrc-itsa",
      "companies-house",
      "billing",
      "diya-gl",
      "account",
      "self-destruct",
    ]);
  });

  it("calls the silencer before any CloudFormation call, and still deletes stacks when the silencer rejects", async () => {
    let ssmCalledBeforeFirstDescribe = false;
    mockSsmSend.mockImplementation(() => {
      if (describedStackNames.length === 0) ssmCalledBeforeFirstDescribe = true;
      return Promise.reject(new Error("SSM unavailable"));
    });

    const { ingestHandler } = await import("@app/functions/infra/selfDestruct.js");
    const res = await ingestHandler(makeEvent(), { getRemainingTimeInMillis: () => 900000 });

    expect(mockSsmSend).toHaveBeenCalled();
    expect(ssmCalledBeforeFirstDescribe).toBe(true);
    expect(res.statusCode).toBe(200);
    expect([...new Set(describedStackNames)]).toEqual([
      "api",
      "ops",
      "publish",
      "edge",
      "auth",
      "hmrc",
      "hmrc-itsa",
      "companies-house",
      "billing",
      "diya-gl",
      "account",
      "self-destruct",
    ]);
  });

  it("warns, not errors, when the origin bucket does not exist yet on a young deployment", async () => {
    process.env.EDGE_ORIGIN_BUCKET = "ci-branch-origin-bucket";
    const errorSpy = vi.spyOn(console, "error");
    const warnSpy = vi.spyOn(console, "warn");

    const { ingestHandler } = await import("@app/functions/infra/selfDestruct.js");
    const res = await ingestHandler(makeEvent(), { getRemainingTimeInMillis: () => 900000 });

    expect(res.statusCode).toBe(200);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("ci-branch-origin-bucket does not exist yet, nothing to empty"),
    );
    expect(errorSpy).not.toHaveBeenCalled();

    delete process.env.EDGE_ORIGIN_BUCKET;
  });

  it("reads every *_STACK_NAME the CDK stack sets on the Lambda, so a stack added to one side is never missed on the other", () => {
    // The deletion list in selfDestruct.js and the environment variables SelfDestructStack.java
    // configures on the Lambda are two hand-maintained copies of the same set of app stacks. The
    // HmrcItsaStack bug (added to CDK, never added to the deletion list) is exactly a mismatch
    // between these two copies, so compare them directly against each other rather than against a
    // third hardcoded list in this test, which would just be a third copy to fall out of sync.
    const testDir = fileURLToPath(new URL(".", import.meta.url));
    const selfDestructJsSource = readFileSync(`${testDir}/../../functions/infra/selfDestruct.js`, "utf8");
    const selfDestructStackJavaSource = readFileSync(
      `${testDir}/../../../infra/main/java/co/uk/diyaccounting/submit/stacks/SelfDestructStack.java`,
      "utf8",
    );

    const stackNamesReadByLambda = new Set(
      [...selfDestructJsSource.matchAll(/process\.env\.(\w*STACK_NAME)/g)].map((m) => m[1]),
    );
    const stackNamesSetByCdk = new Set(
      [...selfDestructStackJavaSource.matchAll(/putIfNotNull\(selfDestructLambdaEnv, "(\w*STACK_NAME)"/g)].map(
        (m) => m[1],
      ),
    );

    expect(stackNamesReadByLambda.size).toBeGreaterThan(0);
    expect(stackNamesSetByCdk.size).toBeGreaterThan(0);
    expect([...stackNamesReadByLambda].sort()).toEqual([...stackNamesSetByCdk].sort());
  });
});
