// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/system-tests/selfDestruct.system.test.js

import { describe, it, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

class MockCFClient {
  async send(cmd) {
    const name = cmd.input?.StackName || "";
    if (cmd.constructor.name === "DescribeStacksCommand") {
      const err = new Error(`Stack with id ${name} does not exist`);
      throw err;
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

vi.mock("@aws-sdk/client-cloudwatch-logs", () => {
  class MockLogsClient {
    async send() {
      return { logGroups: [] };
    }
  }
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

function makeEvent() {
  return { requestContext: { http: { method: "POST", path: "/ops/self-destruct" } }, headers: {} };
}

describe("System: infra/selfDestruct", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(process.env, {
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
    expect(body.results.some((r) => r.status === "skipped")).toBe(true);
  });
});
