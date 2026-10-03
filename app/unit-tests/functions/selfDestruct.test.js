// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/selfDestruct.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Mock CloudFormation client. A stack with no script does not exist. A scripted stack answers
// each DescribeStacks with the next status in its list, or throws "does not exist" for "gone".
const describedStackNames = [];
const deleteStackCalls = [];
let stackStatusScript = {};
let stackUpdateTimes = {};
class MockCFClient {
  async send(cmd) {
    const name = cmd.input?.StackName || "";
    if (cmd.constructor.name === "DescribeStacksCommand") {
      describedStackNames.push(name);
      const script = stackStatusScript[name];
      const status = script?.length ? script.shift() : "gone";
      if (status === "gone") {
        throw new Error(`Stack with id ${name} does not exist`);
      }
      return { Stacks: [{ StackStatus: status, Outputs: [], LastUpdatedTime: stackUpdateTimes[name] ?? new Date() }] };
    }
    if (cmd.constructor.name === "DeleteStackCommand") {
      deleteStackCalls.push(cmd.input);
    }
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

// Mock S3 client to simulate the origin bucket not existing yet (EdgeStack still creating it).
// Tests that need a different ListObjectsV2Command failure override this before importing the
// handler.
function makeNoSuchBucketError() {
  return Object.assign(new Error("The specified bucket does not exist"), { name: "NoSuchBucket" });
}
let listObjectsV2Error = makeNoSuchBucketError();
class MockS3Client {
  async send(cmd) {
    if (cmd.constructor.name === "ListObjectsV2Command") {
      throw listObjectsV2Error;
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
  const DeleteParameterCommand = class DeleteParameterCommand {
    constructor(input) {
      this.input = input;
    }
  };
  return { SSMClient: MockSsmClient, GetParameterCommand, PutParameterCommand, DeleteParameterCommand };
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

const SLOT_PARAMETER_NAME = "/submit/ci/slots/ci-set1";
// This deployment's fakeContext across every test carries no awsRequestId, so the hold's
// holderId is always this fixed string - deterministic and safe to assert against directly.
const HOLDER_ID = "unknown-request:ci-branch";

// The default SSM double for the ci slot parameter: Get answers whatever the last Put (or an
// explicit Delete) left behind, so a test's hold-then-release round trip behaves the way real
// SSM does without each test tracking state of its own. Every other parameter name still answers
// "not found" unless a test overrides it. Tests that need a specific claim already in place at
// hold time set slotParameterValue directly before calling ingestHandler.
let slotParameterValue = null;
function defaultSsmHandler(cmd) {
  if (cmd.input?.Name === SLOT_PARAMETER_NAME) {
    if (cmd.constructor.name === "GetParameterCommand") {
      if (slotParameterValue === null) {
        return Promise.reject(Object.assign(new Error("Parameter not found"), { name: "ParameterNotFound" }));
      }
      return Promise.resolve({ Parameter: { Value: slotParameterValue } });
    }
    if (cmd.constructor.name === "PutParameterCommand") {
      slotParameterValue = cmd.input.Value;
      return Promise.resolve({});
    }
    if (cmd.constructor.name === "DeleteParameterCommand") {
      slotParameterValue = null;
      return Promise.resolve({});
    }
  }
  return Promise.reject(Object.assign(new Error("Parameter not found"), { name: "ParameterNotFound" }));
}

describe("functions/infra/selfDestruct", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    logGroupCalls.length = 0;
    extraLogGroupsUsEast1 = [];
    describedStackNames.length = 0;
    deleteStackCalls.length = 0;
    stackStatusScript = {};
    stackUpdateTimes = {};
    listObjectsV2Error = makeNoSuchBucketError();
    slotParameterValue = null;
    vi.useRealTimers();
    mockSsmSend.mockImplementation(defaultSsmHandler);
    mockCloudWatchSend.mockResolvedValue({ MetricAlarms: [], CompositeAlarms: [] });
    Object.assign(process.env, {
      DEPLOYMENT_NAME: "ci-branch",
      OPS_STACK_NAME: "ops",
      PUBLISH_STACK_NAME: "publish",
      EDGE_STACK_NAME: "edge",
      API_ROUTES_STACK_NAME: "api-routes",
      API_STACK_NAME: "api",
      AUTH_STACK_NAME: "auth",
      HMRC_STACK_NAME: "hmrc",
      HMRC_ITSA_STACK_NAME: "hmrc-itsa",
      COMPANIES_HOUSE_STACK_NAME: "companies-house",
      BILLING_STACK_NAME: "billing",
      DIYA_GL_STACK_NAME: "diya-gl",
      ACCOUNT_STACK_NAME: "account",
      SELF_DESTRUCT_STACK_NAME: "self-destruct",
      SLOT_PARAMETER_NAME: "/submit/ci/slots/ci-set1",
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

  it("retries a DELETE_FAILED stack once with FORCE_DELETE_STACK and reports it deleted when the forced delete clears it", async () => {
    // The custom-domain cleanup and the existence check each describe the api stack once before
    // the delete; the poll then sees DELETE_FAILED, and the next poll finds the stack gone.
    stackStatusScript = { "api": ["CREATE_COMPLETE", "CREATE_COMPLETE", "DELETE_FAILED", "gone"], "self-destruct": ["CREATE_COMPLETE"] };
    vi.useFakeTimers();
    const { ingestHandler } = await import("@app/functions/infra/selfDestruct.js");
    const pending = ingestHandler(makeEvent(), { getRemainingTimeInMillis: () => 900000 });
    await vi.runAllTimersAsync();
    const res = await pending;

    expect(res.statusCode).toBe(200);
    const apiDeletes = deleteStackCalls.filter((c) => c.StackName === "api");
    expect(apiDeletes).toEqual([{ StackName: "api" }, { StackName: "api", DeletionMode: "FORCE_DELETE_STACK" }]);
    expect(deleteStackCalls.some((c) => c.RetainResources)).toBe(false);
    const body = JSON.parse(res.body);
    expect(body.results.find((r) => r.stackName === "api")).toEqual({ stackName: "api", status: "deleted", error: null });
    expect(body.results.find((r) => r.stackName === "self-destruct")).toEqual({
      stackName: "self-destruct",
      status: "deleted",
      error: null,
    });
  });

  it("records an error and keeps the self-destruct stack when a stack is DELETE_FAILED after the forced delete", async () => {
    stackStatusScript = {
      "api": ["CREATE_COMPLETE", "CREATE_COMPLETE", "DELETE_FAILED", "DELETE_IN_PROGRESS", "DELETE_FAILED"],
      "self-destruct": ["CREATE_COMPLETE"],
    };
    vi.useFakeTimers();
    const { ingestHandler } = await import("@app/functions/infra/selfDestruct.js");
    const pending = ingestHandler(makeEvent(), { getRemainingTimeInMillis: () => 900000 });
    await vi.runAllTimersAsync();
    const res = await pending;

    expect(res.statusCode).toBe(500);
    const apiDeletes = deleteStackCalls.filter((c) => c.StackName === "api");
    expect(apiDeletes).toEqual([{ StackName: "api" }, { StackName: "api", DeletionMode: "FORCE_DELETE_STACK" }]);
    const body = JSON.parse(res.body);
    expect(body.results.find((r) => r.stackName === "api")).toEqual({
      stackName: "api",
      status: "error",
      error: "Stack api was not deleted",
    });
    expect(deleteStackCalls.some((c) => c.StackName === "self-destruct")).toBe(false);
    expect(body.results.find((r) => r.stackName === "self-destruct")).toBeUndefined();
  });

  it("holds the ci slot before tearing anything down, then releases it once every stack deletes cleanly", async () => {
    const { ingestHandler } = await import("@app/functions/infra/selfDestruct.js");
    const res = await ingestHandler(makeEvent(), { getRemainingTimeInMillis: () => 900000 });

    expect(res.statusCode).toBe(200);
    const putParameterCalls = mockSsmSend.mock.calls
      .map(([cmd]) => cmd)
      .filter((cmd) => cmd.constructor.name === "PutParameterCommand" && cmd.input.Name === SLOT_PARAMETER_NAME);
    expect(putParameterCalls).toHaveLength(1);
    expect(putParameterCalls[0].input.Overwrite).toBe(true);
    expect(JSON.parse(putParameterCalls[0].input.Value)).toMatchObject({ ref: "self-destruct", runId: HOLDER_ID });

    const deleteParameterCalls = mockSsmSend.mock.calls
      .map(([cmd]) => cmd)
      .filter((cmd) => cmd.constructor.name === "DeleteParameterCommand");
    expect(deleteParameterCalls).toEqual([{ input: { Name: SLOT_PARAMETER_NAME } }]);
    expect(slotParameterValue).toBeNull();
  });

  it("skips the teardown when a fresh read before the hold finds a different active claim", async () => {
    // findSkipReason's own read (via ACTIVE_CLAIM_WINDOW_MS) sees nothing, but by the time the
    // hold does its own fresh read, a deploy has claimed the slot in the gap between the two.
    let getCalls = 0;
    mockSsmSend.mockImplementation((cmd) => {
      if (cmd.input?.Name === SLOT_PARAMETER_NAME && cmd.constructor.name === "GetParameterCommand") {
        getCalls += 1;
        if (getCalls === 1) {
          return Promise.reject(Object.assign(new Error("Parameter not found"), { name: "ParameterNotFound" }));
        }
        return Promise.resolve({
          Parameter: {
            Value: JSON.stringify({ ref: "refs/heads/claude/other-branch", runId: "99999", claimedAt: new Date().toISOString() }),
          },
        });
      }
      return defaultSsmHandler(cmd);
    });

    const { ingestHandler } = await import("@app/functions/infra/selfDestruct.js");
    const res = await ingestHandler(makeEvent(), { getRemainingTimeInMillis: () => 900000 });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.message).toBe("Self-destruct sequence skipped");
    expect(body.reason).toMatch(new RegExp(SLOT_PARAMETER_NAME.replace(/\//g, "\\/")));
    expect(deleteStackCalls).toEqual([]);
    expect(mockSsmSend.mock.calls.map(([cmd]) => cmd).some((cmd) => cmd.constructor.name === "PutParameterCommand")).toBe(false);
  });

  it("leaves the ci slot claim in place when a different claimant has taken it before release", async () => {
    // findSkipReason's own read and the hold's fresh read (calls 1 and 2) both see the slot free,
    // but by the time release re-reads it (call 3), some other run's own claim is in its place -
    // release must not delete that claim.
    let getCalls = 0;
    mockSsmSend.mockImplementation((cmd) => {
      if (cmd.input?.Name === SLOT_PARAMETER_NAME && cmd.constructor.name === "GetParameterCommand") {
        getCalls += 1;
        if (getCalls <= 2) {
          return Promise.reject(Object.assign(new Error("Parameter not found"), { name: "ParameterNotFound" }));
        }
        return Promise.resolve({
          Parameter: {
            Value: JSON.stringify({ ref: "refs/heads/claude/new-claimant", runId: "77777", claimedAt: new Date().toISOString() }),
          },
        });
      }
      return defaultSsmHandler(cmd);
    });

    const { ingestHandler } = await import("@app/functions/infra/selfDestruct.js");
    const res = await ingestHandler(makeEvent(), { getRemainingTimeInMillis: () => 900000 });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.message).toMatch(/Self-destruct sequence completed/);
    const deleteParameterCalls = mockSsmSend.mock.calls
      .map(([cmd]) => cmd)
      .filter((cmd) => cmd.constructor.name === "DeleteParameterCommand");
    expect(deleteParameterCalls).toEqual([]);
  });

  it("does not release the ci slot when a stack fails to delete", async () => {
    stackStatusScript = {
      "api": ["CREATE_COMPLETE", "CREATE_COMPLETE", "DELETE_FAILED", "DELETE_IN_PROGRESS", "DELETE_FAILED"],
      "self-destruct": ["CREATE_COMPLETE"],
    };
    vi.useFakeTimers();
    const { ingestHandler } = await import("@app/functions/infra/selfDestruct.js");
    const pending = ingestHandler(makeEvent(), { getRemainingTimeInMillis: () => 900000 });
    await vi.runAllTimersAsync();
    const res = await pending;

    expect(res.statusCode).toBe(500);
    const deleteParameterCalls = mockSsmSend.mock.calls
      .map(([cmd]) => cmd)
      .filter((cmd) => cmd.constructor.name === "DeleteParameterCommand");
    expect(deleteParameterCalls).toEqual([]);
  });

  it("skips deletion when this deployment is the environment's last-known-good within its protection window", async () => {
    process.env.LAST_KNOWN_GOOD_PARAMETER_NAME = "/submit/ci/last-known-good-deployment";
    process.env.LAST_KNOWN_GOOD_PROTECTION_HOURS = "12";
    mockSsmSend.mockImplementation((cmd) => {
      if (cmd.constructor.name === "GetParameterCommand" && cmd.input.Name === "/submit/ci/last-known-good-deployment") {
        return Promise.resolve({ Parameter: { Value: "ci-branch", LastModifiedDate: new Date() } });
      }
      return Promise.reject(Object.assign(new Error("Parameter not found"), { name: "ParameterNotFound" }));
    });

    const { ingestHandler } = await import("@app/functions/infra/selfDestruct.js");
    const res = await ingestHandler(makeEvent(), { getRemainingTimeInMillis: () => 900000 });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.message).toBe("Self-destruct sequence skipped");
    expect(body.reason).toMatch(/last-known-good/);
    expect(deleteStackCalls).toEqual([]);
    expect(describedStackNames).toEqual([]);
    expect(mockSsmSend.mock.calls.map(([cmd]) => cmd).some((cmd) => cmd.constructor.name === "PutParameterCommand")).toBe(false);

    delete process.env.LAST_KNOWN_GOOD_PARAMETER_NAME;
    delete process.env.LAST_KNOWN_GOOD_PROTECTION_HOURS;
  });

  it("destroys, having first cleared the last-known-good pointer to None, once the pointer's set goes past the protection window", async () => {
    process.env.LAST_KNOWN_GOOD_PARAMETER_NAME = "/submit/ci/last-known-good-deployment";
    process.env.LAST_KNOWN_GOOD_PROTECTION_HOURS = "12";
    stackStatusScript = { "self-destruct": ["CREATE_COMPLETE", "CREATE_COMPLETE", "CREATE_COMPLETE"] };
    const callOrder = [];
    mockSsmSend.mockImplementation((cmd) => {
      if (cmd.constructor.name === "GetParameterCommand" && cmd.input.Name === "/submit/ci/last-known-good-deployment") {
        return Promise.resolve({
          Parameter: { Value: "ci-branch", LastModifiedDate: new Date(Date.now() - 13 * 60 * 60 * 1000) },
        });
      }
      if (cmd.constructor.name === "PutParameterCommand" && cmd.input.Name === "/submit/ci/last-known-good-deployment") {
        callOrder.push({ type: "put", input: cmd.input });
        return Promise.resolve({});
      }
      if (cmd.constructor.name === "PutParameterCommand") {
        return Promise.resolve({});
      }
      return Promise.reject(Object.assign(new Error("Parameter not found"), { name: "ParameterNotFound" }));
    });
    const originalCFSend = MockCFClient.prototype.send;
    MockCFClient.prototype.send = async function (cmd) {
      if (cmd.constructor.name === "DeleteStackCommand") callOrder.push({ type: "delete", input: cmd.input });
      return originalCFSend.call(this, cmd);
    };

    const { ingestHandler } = await import("@app/functions/infra/selfDestruct.js");
    const res = await ingestHandler(makeEvent(), { getRemainingTimeInMillis: () => 900000 });

    MockCFClient.prototype.send = originalCFSend;

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.message).toMatch(/Self-destruct sequence completed/);
    expect(deleteStackCalls).toEqual([{ StackName: "self-destruct" }]);
    expect(callOrder[0]).toEqual({
      type: "put",
      input: { Name: "/submit/ci/last-known-good-deployment", Value: "None", Type: "String", Overwrite: true },
    });
    expect(callOrder[1]).toEqual({ type: "delete", input: { StackName: "self-destruct" } });

    delete process.env.LAST_KNOWN_GOOD_PARAMETER_NAME;
    delete process.env.LAST_KNOWN_GOOD_PROTECTION_HOURS;
  });

  it("destroys without writing the pointer when it names a different deployment", async () => {
    process.env.LAST_KNOWN_GOOD_PARAMETER_NAME = "/submit/ci/last-known-good-deployment";
    process.env.LAST_KNOWN_GOOD_PROTECTION_HOURS = "12";
    stackStatusScript = { "self-destruct": ["CREATE_COMPLETE", "CREATE_COMPLETE", "CREATE_COMPLETE"] };
    mockSsmSend.mockImplementation((cmd) => {
      if (cmd.constructor.name === "GetParameterCommand" && cmd.input.Name === "/submit/ci/last-known-good-deployment") {
        return Promise.resolve({ Parameter: { Value: "ci-other", LastModifiedDate: new Date() } });
      }
      return defaultSsmHandler(cmd);
    });

    const { ingestHandler } = await import("@app/functions/infra/selfDestruct.js");
    const res = await ingestHandler(makeEvent(), { getRemainingTimeInMillis: () => 900000 });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.message).toMatch(/Self-destruct sequence completed/);
    expect(deleteStackCalls).toEqual([{ StackName: "self-destruct" }]);
    expect(
      mockSsmSend.mock.calls
        .map(([cmd]) => cmd)
        .some((cmd) => cmd.constructor.name === "PutParameterCommand" && cmd.input.Name === "/submit/ci/last-known-good-deployment"),
    ).toBe(false);

    delete process.env.LAST_KNOWN_GOOD_PARAMETER_NAME;
    delete process.env.LAST_KNOWN_GOOD_PROTECTION_HOURS;
  });

  it("skips deletion when the last-known-good pointer cannot be read, rather than treating it as absent", async () => {
    process.env.LAST_KNOWN_GOOD_PARAMETER_NAME = "/submit/ci/last-known-good-deployment";
    process.env.LAST_KNOWN_GOOD_PROTECTION_HOURS = "12";
    mockSsmSend.mockImplementation((cmd) => {
      if (cmd.constructor.name === "GetParameterCommand" && cmd.input.Name === "/submit/ci/last-known-good-deployment") {
        return Promise.reject(new Error("SSM throttled"));
      }
      return Promise.reject(Object.assign(new Error("Parameter not found"), { name: "ParameterNotFound" }));
    });

    const { ingestHandler } = await import("@app/functions/infra/selfDestruct.js");
    const res = await ingestHandler(makeEvent(), { getRemainingTimeInMillis: () => 900000 });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.message).toBe("Self-destruct sequence skipped");
    expect(body.reason).toMatch(/could not read.*SSM throttled/);
    expect(deleteStackCalls).toEqual([]);

    delete process.env.LAST_KNOWN_GOOD_PARAMETER_NAME;
    delete process.env.LAST_KNOWN_GOOD_PROTECTION_HOURS;
  });

  it("deletes nothing when clearing the expired last-known-good pointer fails", async () => {
    process.env.LAST_KNOWN_GOOD_PARAMETER_NAME = "/submit/ci/last-known-good-deployment";
    process.env.LAST_KNOWN_GOOD_PROTECTION_HOURS = "12";
    stackStatusScript = { "self-destruct": ["CREATE_COMPLETE", "CREATE_COMPLETE", "CREATE_COMPLETE"] };
    mockSsmSend.mockImplementation((cmd) => {
      if (cmd.constructor.name === "GetParameterCommand" && cmd.input.Name === "/submit/ci/last-known-good-deployment") {
        return Promise.resolve({
          Parameter: { Value: "ci-branch", LastModifiedDate: new Date(Date.now() - 13 * 60 * 60 * 1000) },
        });
      }
      if (cmd.constructor.name === "PutParameterCommand") {
        return Promise.reject(new Error("AccessDenied"));
      }
      return Promise.reject(Object.assign(new Error("Parameter not found"), { name: "ParameterNotFound" }));
    });

    const { ingestHandler } = await import("@app/functions/infra/selfDestruct.js");
    const res = await ingestHandler(makeEvent(), { getRemainingTimeInMillis: () => 900000 });

    expect(res.statusCode).toBe(500);
    expect(deleteStackCalls).toEqual([]);

    delete process.env.LAST_KNOWN_GOOD_PARAMETER_NAME;
    delete process.env.LAST_KNOWN_GOOD_PROTECTION_HOURS;
  });

  it("throws rather than defaulting when the last-known-good protection window env var is missing", async () => {
    process.env.LAST_KNOWN_GOOD_PARAMETER_NAME = "/submit/ci/last-known-good-deployment";

    const { ingestHandler } = await import("@app/functions/infra/selfDestruct.js");
    const res = await ingestHandler(makeEvent(), { getRemainingTimeInMillis: () => 900000 });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.error).toMatch(/LAST_KNOWN_GOOD_PROTECTION_HOURS must be a positive number/);
    expect(deleteStackCalls).toEqual([]);

    delete process.env.LAST_KNOWN_GOOD_PARAMETER_NAME;
  });

  it("skips deletion while a deploy holds the ci slot", async () => {
    const claimedAt = new Date().toISOString();
    mockSsmSend.mockImplementation((cmd) => {
      if (cmd.constructor.name === "GetParameterCommand" && cmd.input.Name === "/submit/ci/slots/ci-set1") {
        return Promise.resolve({
          Parameter: { Value: JSON.stringify({ ref: "refs/heads/claude/b84-board", runId: "35863587199", claimedAt }) },
        });
      }
      return Promise.reject(Object.assign(new Error("Parameter not found"), { name: "ParameterNotFound" }));
    });

    const { ingestHandler } = await import("@app/functions/infra/selfDestruct.js");
    const res = await ingestHandler(makeEvent(), { getRemainingTimeInMillis: () => 900000 });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.message).toBe("Self-destruct sequence skipped");
    expect(body.reason).toMatch(/35863587199/);
    expect(deleteStackCalls).toEqual([]);
  });

  it("deletes as normal when the ci slot claim is older than the longest deploy", async () => {
    stackStatusScript = { "self-destruct": ["CREATE_COMPLETE", "CREATE_COMPLETE", "CREATE_COMPLETE"] };
    mockSsmSend.mockImplementation((cmd) => {
      if (cmd.constructor.name === "GetParameterCommand" && cmd.input.Name === "/submit/ci/slots/ci-set1") {
        return Promise.resolve({
          Parameter: { Value: JSON.stringify({ ref: "refs/heads/main", runId: "1", claimedAt: "2020-01-01T00:00:00.000Z" }) },
        });
      }
      if (cmd.constructor.name === "PutParameterCommand" || cmd.constructor.name === "DeleteParameterCommand") {
        return Promise.resolve({});
      }
      return Promise.reject(Object.assign(new Error("Parameter not found"), { name: "ParameterNotFound" }));
    });

    const { ingestHandler } = await import("@app/functions/infra/selfDestruct.js");
    const res = await ingestHandler(makeEvent(), { getRemainingTimeInMillis: () => 900000 });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.message).toMatch(/Self-destruct sequence completed/);
    expect(deleteStackCalls).toEqual([{ StackName: "self-destruct" }]);
  });

  it("skips deletion when the ci slot claim record cannot be read, rather than treating it as absent", async () => {
    mockSsmSend.mockImplementation((cmd) => {
      if (cmd.constructor.name === "GetParameterCommand" && cmd.input.Name === "/submit/ci/slots/ci-set1") {
        return Promise.reject(new Error("SSM throttled"));
      }
      return Promise.reject(Object.assign(new Error("Parameter not found"), { name: "ParameterNotFound" }));
    });

    const { ingestHandler } = await import("@app/functions/infra/selfDestruct.js");
    const res = await ingestHandler(makeEvent(), { getRemainingTimeInMillis: () => 900000 });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.message).toBe("Self-destruct sequence skipped");
    expect(body.reason).toMatch(/could not read.*SSM throttled/);
    expect(deleteStackCalls).toEqual([]);
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
      "api-routes",
      "auth",
      "hmrc",
      "hmrc-itsa",
      "companies-house",
      "billing",
      "diya-gl",
      "account",
      "self-destruct",
    ]);
    // ApiRoutesStack imports ApiStack's API id, so the deletion loop reaches it first.
    expect(describedStackNames.lastIndexOf("api-routes")).toBeLessThan(describedStackNames.lastIndexOf("api"));
  });

  it("calls the silencer before any CloudFormation call, and still deletes stacks when the silencer rejects", async () => {
    let ssmCalledBeforeFirstDescribe = false;
    mockSsmSend.mockImplementation((cmd) => {
      if (describedStackNames.length === 0) ssmCalledBeforeFirstDescribe = true;
      // Only the alarm-silence marker is unreadable here; the last-known-good and ci-slot
      // parameters this test does not care about behave as usual (defaultSsmHandler), so the
      // deployment is not protected and the deletion this test asserts on still goes ahead.
      if (cmd.input?.Name === "/submit/ci/alarm-silence/branch") {
        return Promise.reject(new Error("SSM unavailable"));
      }
      return defaultSsmHandler(cmd);
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
      "api-routes",
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
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("ci-branch-origin-bucket does not exist yet, nothing to empty"));
    expect(errorSpy).not.toHaveBeenCalled();

    delete process.env.EDGE_ORIGIN_BUCKET;
  });

  it("warns, not errors, when the origin bucket answers a wrong-region redirect on a young deployment", async () => {
    process.env.EDGE_ORIGIN_BUCKET = "ci-branch-origin-bucket";
    listObjectsV2Error = Object.assign(
      new Error("The bucket you are attempting to access must be addressed using the specified endpoint"),
      { name: "PermanentRedirect" },
    );
    const errorSpy = vi.spyOn(console, "error");
    const warnSpy = vi.spyOn(console, "warn");

    const { ingestHandler } = await import("@app/functions/infra/selfDestruct.js");
    const res = await ingestHandler(makeEvent(), { getRemainingTimeInMillis: () => 900000 });

    expect(res.statusCode).toBe(200);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("ci-branch-origin-bucket not addressable in the resolved region yet"));
    expect(errorSpy).not.toHaveBeenCalled();

    delete process.env.EDGE_ORIGIN_BUCKET;
  });

  it("warns on a bucket-emptying failure that is neither a missing bucket nor a region redirect", async () => {
    process.env.EDGE_ORIGIN_BUCKET = "ci-branch-origin-bucket";
    listObjectsV2Error = Object.assign(new Error("Access Denied"), { name: "AccessDenied" });
    const warnSpy = vi.spyOn(console, "warn");

    const { ingestHandler } = await import("@app/functions/infra/selfDestruct.js");
    const res = await ingestHandler(makeEvent(), { getRemainingTimeInMillis: () => 900000 });

    expect(res.statusCode).toBe(200);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Could not retrieve bucket contents for bucket ci-branch-origin-bucket"));

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

    const stackNamesReadByLambda = new Set([...selfDestructJsSource.matchAll(/process\.env\.(\w*STACK_NAME)/g)].map((m) => m[1]));
    const stackNamesSetByCdk = new Set(
      [...selfDestructStackJavaSource.matchAll(/putIfNotNull\(selfDestructLambdaEnv, "(\w*STACK_NAME)"/g)].map((m) => m[1]),
    );

    expect(stackNamesReadByLambda.size).toBeGreaterThan(0);
    expect(stackNamesSetByCdk.size).toBeGreaterThan(0);
    expect([...stackNamesReadByLambda].sort()).toEqual([...stackNamesSetByCdk].sort());
  });

  it("covers every application stack, so a new stack is never left out of both sides at once", () => {
    // Comparing the Lambda and the CDK stack to each other passes when a stack is missing from
    // both, which is how a newly added stack would slip through. SubmitApplication is where an
    // application stack comes into existence, so bind the deletion list to that instead.
    const testDir = fileURLToPath(new URL(".", import.meta.url));
    const applicationSource = readFileSync(`${testDir}/../../../infra/main/java/co/uk/diyaccounting/submit/SubmitApplication.java`, "utf8");
    const selfDestructJsSource = readFileSync(`${testDir}/../../functions/infra/selfDestruct.js`, "utf8");

    const envVarNameFor = (stackClassName) =>
      `${stackClassName
        .replace(/Stack$/, "")
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .toUpperCase()}_STACK_NAME`;

    const stacksCreated = new Set([...applicationSource.matchAll(/new (\w+Stack)\(/g)].map((m) => envVarNameFor(m[1])));
    const stackNamesReadByLambda = new Set([...selfDestructJsSource.matchAll(/process\.env\.(\w*STACK_NAME)/g)].map((m) => m[1]));

    expect(stacksCreated.size).toBeGreaterThan(0);
    expect([...stacksCreated].sort()).toEqual([...stackNamesReadByLambda].sort());
  });
});
