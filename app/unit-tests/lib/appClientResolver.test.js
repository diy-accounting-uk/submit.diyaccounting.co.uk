// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const mockSsmSend = vi.fn();
vi.mock("@aws-sdk/client-ssm", () => ({
  SSMClient: class {
    send(...args) {
      return mockSsmSend(...args);
    }
  },
  GetParameterCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

const { resolveAppClient } = await import("@app/lib/appClientResolver.js");

function ssmParam(value) {
  return { Parameter: { Value: value } };
}

describe("appClientResolver", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockSsmSend.mockReset();
    process.env = { ...originalEnv, ENVIRONMENT_NAME: "ci" };
    mockSsmSend.mockImplementation((command) => {
      if (command.input.Name === "/submit/ci/submit-app-client-id") return Promise.resolve(ssmParam("submit-client-id"));
      if (command.input.Name === "/submit/ci/spreadsheets-diya-gl-app-client-id") return Promise.resolve(ssmParam("books-client-id"));
      if (command.input.Name === "/submit/ci/mcp-app-client-id") return Promise.resolve(ssmParam("mcp-client-id"));
      return Promise.reject(new Error("unexpected parameter"));
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("resolveAppClient", () => {
    test("maps each app client id to its name", async () => {
      expect(await resolveAppClient("submit-client-id")).toBe("submit");
      expect(await resolveAppClient("books-client-id")).toBe("books");
      expect(await resolveAppClient("mcp-client-id")).toBe("mcp");
    });

    test("returns the raw client id when it matches none of the three", async () => {
      expect(await resolveAppClient("unknown-client-id")).toBe("unknown-client-id");
    });

    test("returns undefined when no client id is given", async () => {
      expect(await resolveAppClient(undefined)).toBeUndefined();
    });

    test("returns the raw client id when the SSM lookup fails", async () => {
      mockSsmSend.mockRejectedValue(new Error("throttled"));
      expect(await resolveAppClient("submit-client-id")).toBe("submit-client-id");
    });
  });
});
