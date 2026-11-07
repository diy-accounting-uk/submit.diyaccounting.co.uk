// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildEventWithToken, makeIdToken } from "@app/test-helpers/eventBuilders.js";

const mockCreatePass = vi.fn();
vi.mock("@app/services/passService.js", () => ({
  createPass: (...args) => mockCreatePass(...args),
}));

vi.mock("@app/lib/activityAlert.js", async (importOriginal) => ({
  ...(await importOriginal()),
  publishActivityEvent: vi.fn().mockResolvedValue(undefined),
}));

const mockRequestCustomerEmail = vi.fn();
vi.mock("@app/lib/customerEmailRequest.js", () => ({
  requestCustomerEmail: (...args) => mockRequestCustomerEmail(...args),
}));

import { ingestHandler } from "@app/functions/account/passAdminPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const operatorEmail = "operator@example.com";
const syntheticEmail = "synthetic-local@test.diyaccounting.co.uk";
const customerEmail = "customer@example.com";

function tokenFor(email) {
  return makeIdToken("caller-sub", { email });
}

function passBody(overrides = {}) {
  return { passTypeId: "day-guest-test-pass", bundleId: "day-guest", validityPeriod: "P1D", maxUses: 1, createdBy: "test", ...overrides };
}

describe("passAdminPost", () => {
  beforeEach(() => {
    mockCreatePass.mockReset();
    mockCreatePass.mockImplementation(async (params) => ({
      code: "tiger-happy-mountain-silver",
      bundleId: params.bundleId,
      passTypeId: params.passTypeId,
      testPass: params.testPass,
      maxUses: params.maxUses,
    }));
    process.env.PASSES_DYNAMODB_TABLE_NAME = "test-passes";
    process.env.OPERATOR_EMAILS = operatorEmail;
  });

  test("returns 401 and creates nothing without an authorization header", async () => {
    const result = await ingestHandler(buildEventWithToken(null, passBody()));
    expect(result.statusCode).toBe(401);
    expect(mockCreatePass).not.toHaveBeenCalled();
  });

  test("returns 403 and creates nothing for a customer", async () => {
    const result = await ingestHandler(buildEventWithToken(tokenFor(customerEmail), passBody()));
    expect(result.statusCode).toBe(403);
    expect(mockCreatePass).not.toHaveBeenCalled();
  });

  test("returns 403 for an email that only resembles a synthetic test user", async () => {
    const lookalike = "synthetic-local@test.diyaccounting.co.uk.example.com";
    const result = await ingestHandler(buildEventWithToken(tokenFor(lookalike), passBody()));
    expect(result.statusCode).toBe(403);
    expect(mockCreatePass).not.toHaveBeenCalled();
  });

  test("an operator creates a pass for any bundle without a forced test flag", async () => {
    const result = await ingestHandler(
      buildEventWithToken(
        tokenFor(operatorEmail),
        passBody({ passTypeId: "operator", bundleId: "operator", restrictedToEmail: "a@b.com" }),
      ),
    );
    expect(result.statusCode).toBe(200);
    const params = mockCreatePass.mock.calls[0][0];
    expect(params.bundleId).toBe("operator");
    expect(params.testPass).toBeUndefined();
    expect(params.restrictedToEmail).toBe("a@b.com");
  });

  test.each(["day-guest", "invited-guest", "resident-vat", "resident-ltd", "resident-pro", "resident-tax-agent"])(
    "a synthetic test user creates a %s pass, always a test pass",
    async (bundleId) => {
      const result = await ingestHandler(buildEventWithToken(tokenFor(syntheticEmail), passBody({ bundleId, testPass: false })));
      expect(result.statusCode).toBe(200);
      const params = mockCreatePass.mock.calls[0][0];
      expect(params.testPass).toBe(true);
      expect(params.actor).toBe("test-user");
    },
  );

  test.each(["operator", "resident-guest", "resident-pro-comp", "no-such-bundle"])(
    "a synthetic test user is refused a %s pass",
    async (bundleId) => {
      const result = await ingestHandler(buildEventWithToken(tokenFor(syntheticEmail), passBody({ bundleId })));
      expect(result.statusCode).toBe(403);
      expect(mockCreatePass).not.toHaveBeenCalled();
    },
  );

  test("a synthetic test user's email restriction is ignored", async () => {
    await ingestHandler(buildEventWithToken(tokenFor(syntheticEmail), passBody({ restrictedToEmail: "a@b.com" })));
    expect(mockCreatePass.mock.calls[0][0].restrictedToEmail).toBeUndefined();
  });

  describe("the customer email request", () => {
    beforeEach(() => {
      mockRequestCustomerEmail.mockReset();
      mockRequestCustomerEmail.mockResolvedValue({ requested: true });
    });

    test("an operator's pass requests a pass-generated email that is not synthetic", async () => {
      await ingestHandler(buildEventWithToken(tokenFor(operatorEmail), passBody({ testPass: false })));

      expect(mockRequestCustomerEmail).toHaveBeenCalledTimes(1);
      expect(mockRequestCustomerEmail).toHaveBeenCalledWith({
        kind: "pass-generated",
        userSub: "caller-sub",
        synthetic: false,
        data: {
          code: "tiger-happy-mountain-silver",
          passTypeId: "day-guest-test-pass",
          bundleId: "day-guest",
          validUntil: null,
          maxUses: 1,
        },
      });
    });

    test("a test pass marks the request synthetic", async () => {
      await ingestHandler(buildEventWithToken(tokenFor(syntheticEmail), passBody()));

      expect(mockRequestCustomerEmail.mock.calls[0][0].synthetic).toBe(true);
    });

    test("a refused caller requests no email", async () => {
      await ingestHandler(buildEventWithToken(tokenFor(customerEmail), passBody()));

      expect(mockRequestCustomerEmail).not.toHaveBeenCalled();
    });

    test("the response is unchanged when the request fails", async () => {
      mockRequestCustomerEmail.mockResolvedValue({ requested: false });

      const result = await ingestHandler(buildEventWithToken(tokenFor(operatorEmail), passBody()));

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body).code).toBe("tiger-happy-mountain-silver");
    });
  });
});
