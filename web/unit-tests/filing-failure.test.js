// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/filing-failure.test.js

import { describe, test, expect } from "vitest";
import { FAILURE_KINDS, HELP_HREF, classifyFilingFailure, classifyStripeFailure } from "../public/lib/filing-failure.js";

// The client's error for an answer: its status, the server's JSON body, and the request id header.
function answer(status, body = {}, requestId) {
  const error = new Error(body.message ?? `Request failed with status ${status}`);
  error.status = status;
  error.body = body;
  error.reason = body.reason;
  if (requestId) error.requestId = requestId;
  return error;
}

describe("the kind of a filing's failure", () => {
  test("a 5xx from Submit carrying no service error is a fault in Submit, with Help and the request id", () => {
    const failure = classifyFilingFailure(answer(500, { message: "Internal server error" }, "req-123"), { service: "hmrc" });
    expect(failure).toMatchObject({ kind: FAILURE_KINDS.submitFault, requestId: "req-123", next: { href: HELP_HREF } });
    expect(failure.cause).toBe("This is a fault in Submit, not in your answers or your sign-in.");
  });

  test("a request that got no answer is a fault in Submit, and never a refusal before anything was sent", () => {
    const failure = classifyFilingFailure(new TypeError("Failed to fetch"), { service: "hmrc" });
    expect(failure.kind).toBe(FAILURE_KINDS.submitFault);
  });

  test("HMRC's schema error is a fault in Submit, not an answer to correct", () => {
    const body = { error: { errors: [{ number: "1001", text: "The submitted XML document failed to validate" }] } };
    expect(classifyFilingFailure(answer(502, body), { service: "hmrc" }).kind).toBe(FAILURE_KINDS.submitFault);
  });

  test("Companies House refusing the presenter account Submit files under is Submit's own credentials", () => {
    const body = { message: "Gateway error", error: { errors: [{ number: "502", text: "Authentication Failure" }] } };
    const failure = classifyFilingFailure(answer(502, body), { service: "companiesHouse" });
    expect(failure.kind).toBe(FAILURE_KINDS.submitCredentials);
    expect(failure.cause).toBe("Companies House refused Submit's own credentials. Nothing is wrong with your account. Try again later.");
  });

  test("HMRC refusing the software's vendor credentials is Submit's own credentials", () => {
    const body = { error: { errors: [{ number: "1020", text: "The vendor ID is not recognised" }] } };
    expect(classifyFilingFailure(answer(502, body), { service: "hmrc" }).kind).toBe(FAILURE_KINDS.submitCredentials);
  });

  test("HMRC refusing the Government Gateway user ID or password is the person's own credentials", () => {
    const body = {
      message: "HMRC did not acknowledge the Company Tax Return",
      error: { errors: [{ number: "1046", text: "Authentication Failure" }] },
    };
    const failure = classifyFilingFailure(answer(502, body), { service: "hmrc" });
    expect(failure.kind).toBe(FAILURE_KINDS.yourCredentials);
    expect(failure.cause).toContain("Government Gateway user ID or password");
  });

  test("a wrong company authentication code is the person's own credentials", () => {
    const body = {
      reason: "invalid-company-authentication-code",
      error: { errors: [{ number: "9999", text: "Invalid CompanyAuthenticationCode" }] },
    };
    const failure = classifyFilingFailure(answer(400, body), { service: "companiesHouse" });
    expect(failure).toMatchObject({ kind: FAILURE_KINDS.yourCredentials, service: "companiesHouse" });
    expect(failure.cause).toContain("company authentication code");
  });

  test("an expired sign-in and an account with no tokens or bundle are the person's own account", () => {
    expect(classifyFilingFailure(answer(401), { service: "hmrc" })).toMatchObject({
      kind: FAILURE_KINDS.yourCredentials,
      next: { href: "/auth/login.html" },
    });
    expect(classifyFilingFailure(answer(403, { reason: "tokens_exhausted" }), { service: "hmrc" })).toMatchObject({
      kind: FAILURE_KINDS.yourCredentials,
      next: { href: "/bundles.html" },
    });
    expect(classifyFilingFailure(answer(403, {}), { service: "companiesHouse" }).kind).toBe(FAILURE_KINDS.yourCredentials);
  });

  test("a 502 carrying HMRC's business errors is their answer, with each error and the place it names", () => {
    const body = {
      error: { errors: [{ number: "3001", text: "Box 145 must not be negative", location: "/IRenvelope/CompanyTaxReturn/Turnover" }] },
    };
    const failure = classifyFilingFailure(answer(502, body), { service: "hmrc" });
    expect(failure.kind).toBe(FAILURE_KINDS.businessError);
    expect(failure.cause).toBe("HMRC answered with this error. Correct the answer it names and send again.");
    expect(failure.errors).toEqual(["Box 145 must not be negative (/IRenvelope/CompanyTaxReturn/Turnover)"]);
  });

  test("Companies House's data errors are their answer, and its software fault number is a fault in Submit", () => {
    const data = { error: { errors: [{ number: "604", text: "Missing field" }] } };
    expect(classifyFilingFailure(answer(502, data), { service: "companiesHouse" }).kind).toBe(FAILURE_KINDS.businessError);
    const fault = { error: { errors: [{ number: "505", text: "Schema validation failed" }] } };
    expect(classifyFilingFailure(answer(502, fault, "req-9"), { service: "companiesHouse" })).toMatchObject({
      kind: FAILURE_KINDS.submitFault,
      requestId: "req-9",
    });
  });

  test("Companies House's filing API errors are their answer, each with the field it names", () => {
    const body = { errors: [{ error: "Postcode is not valid", location: "postal_code", type: "ch:validation" }] };
    const failure = classifyFilingFailure(answer(422, body), { service: "companiesHouse" });
    expect(failure.kind).toBe(FAILURE_KINDS.businessError);
    expect(failure.cause).toBe("Companies House answered with this error. Correct the answer it names and send again.");
    expect(failure.errors).toEqual(["Postcode is not valid (postal_code)"]);
  });

  test("a 4xx refusal before anything was sent is a business error with the server's own message", () => {
    const body = { message: "The figures changed after you reviewed them (box 145). Review the return again before you file it." };
    const failure = classifyFilingFailure(answer(409, body), { service: "hmrc" });
    expect(failure.kind).toBe(FAILURE_KINDS.businessError);
    expect(failure.errors).toEqual([body.message]);
  });
});

describe("Companies House not answering before anything was sent", () => {
  test("a 502 saying Submit could not read the company says Companies House did not answer, and to try again later", () => {
    const failure = classifyFilingFailure(
      answer(502, {
        message: "Could not read the company from Companies House to check the filing, so it has not been sent",
        code: "company-unread",
        status: 503,
      }),
      { service: "companiesHouse" },
    );
    expect(failure).toMatchObject({ kind: FAILURE_KINDS.notAnswering, service: "companiesHouse", next: null });
    expect(failure.cause).toBe("Companies House did not answer when Submit read the company, so nothing was sent. Try again later.");
  });

  test("a 502 with no code stays a fault in Submit", () => {
    expect(classifyFilingFailure(answer(502, { message: "Bad gateway" }), { service: "companiesHouse" }).kind).toBe(
      FAILURE_KINDS.submitFault,
    );
  });
});

describe("the kind of a Stripe journey's failure", () => {
  test("a request that got no answer from Submit says Stripe was not asked, with no link", () => {
    const failure = classifyStripeFailure(new TypeError("Failed to fetch"));
    expect(failure).toMatchObject({ kind: FAILURE_KINDS.connection, next: null });
    expect(failure.cause).toBe("Submit did not answer, so Stripe was not asked. Check your connection and try again.");
  });

  test("an expired sign-in sends the person to sign in again", () => {
    const failure = classifyStripeFailure(answer(401, { message: "Authentication required" }));
    expect(failure).toMatchObject({ kind: FAILURE_KINDS.yourCredentials, next: { href: "/auth/login.html" } });
  });

  test("the firewall's HTML 403 is a blocked request with Help and the firewall's reference", () => {
    const error = answer(403, {}, "cf-ref-1");
    error.html = true;
    const failure = classifyStripeFailure(error);
    expect(failure).toMatchObject({ kind: FAILURE_KINDS.blocked, requestId: "cf-ref-1", next: { href: HELP_HREF } });
    expect(failure.cause).toBe("The site's firewall blocked this request before it reached Stripe. Try again later.");
  });

  test("a JSON 403 is the person's sign-in refused", () => {
    const failure = classifyStripeFailure(answer(403, { message: "Forbidden" }));
    expect(failure).toMatchObject({ kind: FAILURE_KINDS.yourCredentials, next: { href: "/auth/login.html" } });
    expect(failure.cause).toBe("Submit did not accept your sign-in for this request.");
  });

  test("the portal's 404 says the account has no Stripe subscription and points at the bundles", () => {
    const failure = classifyStripeFailure(answer(404, { message: "No active subscription found" }));
    expect(failure).toMatchObject({ kind: FAILURE_KINDS.yourCredentials, service: "stripe", next: { href: "/bundles.html" } });
  });

  test("an activity fee already paid says to go back and send the filing", () => {
    const failure = classifyStripeFailure(answer(409, { message: "already-paid", code: "already-paid" }));
    expect(failure).toMatchObject({ kind: FAILURE_KINDS.businessError, next: null });
    expect(failure.cause).toBe("The fee for this filing is already paid. Go back to the filing and send it.");
  });

  test("a 400 refusal of what the page asked for is a fault in Submit, with Help and the request id", () => {
    const failure = classifyStripeFailure(answer(400, { message: "bundle-not-listed", code: "bundle-not-listed" }, "req-400"));
    expect(failure).toMatchObject({ kind: FAILURE_KINDS.submitFault, requestId: "req-400", next: { href: HELP_HREF } });
    expect(failure.cause).toBe("Submit refused the request before asking Stripe. This is a fault in Submit, not in your account.");
  });

  test("a 5xx, or an answer with no page to open, is a fault in Submit or at Stripe", () => {
    for (const status of [500, 502, 200]) {
      const failure = classifyStripeFailure(answer(status, { message: "Failed to create checkout session" }, "req-5"));
      expect(failure).toMatchObject({ kind: FAILURE_KINDS.submitFault, service: "stripe", requestId: "req-5" });
      expect(failure.cause).toContain("This is a fault in Submit or at Stripe, not in your account.");
    }
  });
});

describe("the kind of a failure HMRC's MTD APIs answered", () => {
  // The server passes HMRC's answer on as error.hmrcResponseCode and error.responseBody.
  const mtd = (status, hmrcResponseCode, responseBody) =>
    answer(status, { message: "HMRC rejected the request", error: { hmrcResponseCode, responseBody } });

  test("a rule HMRC names is a business error, listed with its code", () => {
    const failure = classifyFilingFailure(
      mtd(400, 400, { code: "RULE_BOTH_EXPENSES_SUPPLIED", message: "Both expenses and consolidated expenses must not be present" }),
      { service: "hmrc" },
    );
    expect(failure.kind).toBe(FAILURE_KINDS.businessError);
    expect(failure.errors).toEqual(["Both expenses and consolidated expenses must not be present (RULE_BOTH_EXPENSES_SUPPLIED)"]);
  });

  test("several errors are each listed", () => {
    const body = {
      code: "INVALID_REQUEST",
      message: "Invalid request",
      errors: [
        { code: "FORMAT_VALUE", message: "The value must be between 0 and 99999999999.99" },
        { code: "RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED", message: "An empty or non-matching body was submitted" },
      ],
    };
    expect(classifyFilingFailure(mtd(400, 400, body), { service: "hmrc" }).errors).toEqual([
      "The value must be between 0 and 99999999999.99 (FORMAT_VALUE)",
      "An empty or non-matching body was submitted (RULE_INCORRECT_OR_EMPTY_BODY_SUBMITTED)",
    ]);
  });

  test("a rule HMRC answers with 403 is a business error, not a missing bundle", () => {
    const failure = classifyFilingFailure(mtd(403, 403, { code: "RULE_TAX_YEAR_NOT_ENDED", message: "Tax year not ended" }), {
      service: "hmrc",
    });
    expect(failure.kind).toBe(FAILURE_KINDS.businessError);
  });

  test("HMRC not accepting the authorisation is the person's own credentials", () => {
    for (const error of [
      mtd(403, 403, { code: "CLIENT_OR_AGENT_NOT_AUTHORISED", message: "The client or agent is not authorised" }),
      mtd(500, 401, { code: "INVALID_CREDENTIALS", message: "Invalid Authentication information provided" }),
      answer(403, { reason: "hmrc_scope_insufficient" }),
    ]) {
      const failure = classifyFilingFailure(error, { service: "hmrc" });
      expect(failure).toMatchObject({ kind: FAILURE_KINDS.yourCredentials, service: "hmrc", next: null });
      expect(failure.cause).toBe(
        "HMRC did not accept the authorisation Submit holds for you. Send again, and sign in to HMRC when it asks.",
      );
    }
  });

  test("HMRC unable to take the request, or limiting the rate, is neither a fault in Submit nor the person's", () => {
    for (const error of [
      mtd(500, 503, { code: "SERVICE_UNAVAILABLE", message: "Service unavailable" }),
      mtd(500, 429, { code: "MESSAGE_THROTTLED_OUT", message: "Too many requests" }),
    ]) {
      const failure = classifyFilingFailure(error, { service: "hmrc" });
      expect(failure.kind).toBe(FAILURE_KINDS.serviceUnavailable);
      expect(failure.cause).toBe("HMRC could not take the request just now. Try again later.");
    }
  });

  test("Submit's own 403 with no HMRC answer is still a missing bundle", () => {
    expect(classifyFilingFailure(answer(403, { reason: "BUNDLE_ENTITLEMENT_REQUIRED" }), { service: "hmrc" }).kind).toBe(
      FAILURE_KINDS.yourCredentials,
    );
    expect(classifyFilingFailure(answer(403, {}), { service: "hmrc" }).next?.href).toBe("/bundles.html");
  });
});
