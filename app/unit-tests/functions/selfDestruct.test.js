// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/functions/selfDestruct.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Mock CloudFormation client to simulate 'stack does not exist'
class MockCFClient {
  async send(cmd) {
    const name = cmd.input?.StackName || "";
    // Always throw for DescribeStacks to simulate non-existent stacks
    if (cmd.constructor.name === "DescribeStacksCommand") {
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
class MockLogsClient {
  constructor({ region }) {
    this.region = region;
  }
  async send(cmd) {
    logGroupCalls.push({ region: this.region, command: cmd.constructor.name, input: cmd.input });
    if (cmd.constructor.name === "DescribeLogGroupsCommand") {
      return this.region === "us-east-1"
        ? { logGroups: [{ logGroupName: `${cmd.input.logGroupNamePrefix}EdgeStack-AwsCustomResourceProvider` }] }
        : { logGroups: [] };
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
    Object.assign(process.env, {
      DEPLOYMENT_NAME: "ci-branch",
      OPS_STACK_NAME: "ops",
      PUBLISH_STACK_NAME: "publish",
      EDGE_STACK_NAME: "edge",
      API_STACK_NAME: "api",
      AUTH_STACK_NAME: "auth",
      HMRC_STACK_NAME: "hmrc",
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
});
