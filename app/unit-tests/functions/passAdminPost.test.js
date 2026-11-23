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
      ...(params.grants ? { grants: params.grants, usesPerAccount: params.usesPerAccount } : {}),
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
        passBody({ passTypeId: "operator", bundleId: "operator", restrictedToEmail: operatorEmail }),
      ),
    );
    expect(result.statusCode).toBe(200);
    const params = mockCreatePass.mock.calls[0][0];
    expect(params.bundleId).toBe("operator");
    expect(params.testPass).toBeUndefined();
    expect(params.restrictedToEmail).toBe(operatorEmail);
  });

  test.each([
    ["restricted to an email that is not an operator's", { restrictedToEmail: "a@b.com" }],
    ["restricted to no email", {}],
  ])("refuses an operator pass %s", async (_label, restriction) => {
    const result = await ingestHandler(
      buildEventWithToken(tokenFor(operatorEmail), passBody({ passTypeId: "operator", bundleId: "operator", ...restriction })),
    );
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("A pass for the bundle 'operator' must be restricted to an operator's email");
    expect(mockCreatePass).not.toHaveBeenCalled();
  });

  test("refuses a campaign grant of the operator bundle unless the pass is restricted to an operator's email", async () => {
    const body = {
      passTypeId: "custom-campaign",
      validFrom: "2026-11-22T00:00:00.000Z",
      grants: [{ bundleId: "operator" }],
    };
    const refused = await ingestHandler(buildEventWithToken(tokenFor(operatorEmail), { ...body, restrictedToEmail: "a@b.com" }));
    expect(refused.statusCode).toBe(400);
    expect(JSON.parse(refused.body).message).toBe("A pass for the bundle 'operator' must be restricted to an operator's email");
    const admitted = await ingestHandler(buildEventWithToken(tokenFor(operatorEmail), { ...body, restrictedToEmail: operatorEmail }));
    expect(admitted.statusCode).toBe(200);
  });

  test("refuses a pass for a bundle a pass may not grant, as the admin bundleId and as a campaign grant", async () => {
    const plain = await ingestHandler(
      buildEventWithToken(tokenFor(operatorEmail), passBody({ passTypeId: "day-guest-pass", bundleId: "default" })),
    );
    expect(plain.statusCode).toBe(400);
    expect(JSON.parse(plain.body).message).toBe("Bundle 'default' cannot be granted by a pass");
    const campaign = await ingestHandler(
      buildEventWithToken(tokenFor(operatorEmail), {
        passTypeId: "custom-campaign",
        validFrom: "2026-11-22T00:00:00.000Z",
        grants: [{ bundleId: "default" }],
      }),
    );
    expect(campaign.statusCode).toBe(400);
    expect(JSON.parse(campaign.body).message).toBe("Bundle 'default' cannot be granted by a pass");
    expect(mockCreatePass).not.toHaveBeenCalled();
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
          usesLeft: 1,
          generatedBy: "operator",
          restrictedTo: null,
          passSummary: "submit VAT returns to HMRC",
        },
      });
    });

    test("an email-restricted operator pass sends the masked address and never the full one", async () => {
      await ingestHandler(
        buildEventWithToken(tokenFor(operatorEmail), passBody({ testPass: false, restrictedToEmail: "jane.doe@example.com" })),
      );

      const request = mockRequestCustomerEmail.mock.calls[0][0];
      expect(request.data.restrictedTo).toMatch(/^j.*@example\.com$/);
      expect(request.data.restrictedTo).not.toBe("jane.doe@example.com");
      expect(JSON.stringify(request)).not.toContain("jane.doe@example.com");
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

  describe("a campaign pass", () => {
    const campaignBody = (overrides = {}) => ({
      passTypeId: "custom-campaign",
      validFrom: "2026-11-22T00:00:00.000Z",
      validUntil: "2027-05-22T00:00:00.000Z",
      maxUses: 1000,
      usesPerAccount: 1,
      grants: [{ bundleId: "resident-vat-comp", duration: "P1Y" }],
      ...overrides,
    });

    test("stores its grants and per-account limit, and names its first bundle as the pass's bundle", async () => {
      const result = await ingestHandler(buildEventWithToken(tokenFor(operatorEmail), campaignBody()));

      expect(result.statusCode).toBe(200);
      expect(mockCreatePass.mock.calls[0][0]).toMatchObject({
        passTypeId: "custom-campaign",
        bundleId: "resident-vat-comp",
        maxUses: 1000,
        usesPerAccount: 1,
        grants: [{ bundleId: "resident-vat-comp", duration: "P1Y" }],
      });
    });

    test("sends each grant's terms and its bundle summary to the email", async () => {
      await ingestHandler(
        buildEventWithToken(
          tokenFor(operatorEmail),
          campaignBody({ grants: [{ bundleId: "resident-vat-comp", duration: "P1Y", tokens: 50, tokenRefreshInterval: "P1M" }] }),
        ),
      );

      expect(mockRequestCustomerEmail.mock.calls[0][0].data.grants).toEqual([
        {
          bundleId: "resident-vat-comp",
          duration: "P1Y",
          tokens: 50,
          tokenRefreshInterval: "P1M",
          summary: "submit VAT returns to HMRC and make pass links for other people",
        },
      ]);
    });

    test("admits a duration of exactly 100 years", async () => {
      const result = await ingestHandler(
        buildEventWithToken(tokenFor(operatorEmail), campaignBody({ grants: [{ bundleId: "resident-vat-comp", duration: "P100Y" }] })),
      );
      expect(result.statusCode).toBe(200);
    });

    test("refuses a synthetic test user", async () => {
      const result = await ingestHandler(buildEventWithToken(tokenFor(syntheticEmail), campaignBody()));
      expect(result.statusCode).toBe(403);
      expect(mockCreatePass).not.toHaveBeenCalled();
    });

    test.each([
      [{ grants: [] }, "grants must list at least one bundle"],
      [{ grants: [{ bundleId: "no-such-bundle" }] }, "Bundle 'no-such-bundle' is not in the catalogue"],
      [{ grants: [{ bundleId: "resident-vat" }] }, "Bundle 'resident-vat' is sold by subscription: grant 'resident-vat-comp' instead"],
      [{ grants: [{ bundleId: "resident-vat-comp", duration: "one year" }] }, "duration 'one year' is not an ISO duration"],
      [{ grants: [{ bundleId: "resident-vat-comp", duration: "P101Y" }] }, "duration 'P101Y' is longer than 100 years"],
      [{ grants: [{ bundleId: "resident-vat-comp", duration: "P300000Y" }] }, "duration 'P300000Y' does not end on a valid date"],
      [
        { grants: [{ bundleId: "resident-vat-comp", tokens: 5, tokenRefreshInterval: "P1300M" }] },
        "tokenRefreshInterval 'P1300M' is longer than 100 years",
      ],
      [
        { grants: [{ bundleId: "resident-vat-comp", tokens: 5, tokenRefreshInterval: "P99999999D" }] },
        "tokenRefreshInterval 'P99999999D' does not end on a valid date",
      ],
      [{ grants: [{ bundleId: "resident-vat-comp", tokens: 0 }] }, 'tokens must be a positive whole number or "unlimited"'],
      [{ grants: [{ bundleId: "resident-vat-comp", tokenRefreshInterval: "P1M" }] }, "tokenRefreshInterval needs tokens"],
      [{ usesPerAccount: 0 }, "usesPerAccount must be a positive whole number"],
      [{ bundleId: "resident-vat-comp" }, "A campaign pass names its bundles in grants, not bundleId"],
    ])("refuses %j with its reason", async (overrides, message) => {
      const result = await ingestHandler(buildEventWithToken(tokenFor(operatorEmail), campaignBody(overrides)));

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toBe(message);
      expect(mockCreatePass).not.toHaveBeenCalled();
    });
  });
});
