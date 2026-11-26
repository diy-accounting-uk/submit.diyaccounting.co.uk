// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/filing-failure.test.js

import { describe, test, expect } from "vitest";
import { FAILURE_KINDS, HELP_HREF, classifyFilingFailure } from "../public/lib/filing-failure.js";

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

  test("a 4xx refusal before anything was sent is a business error with the server's own message", () => {
    const body = { message: "The figures changed after you reviewed them (box 145). Review the return again before you file it." };
    const failure = classifyFilingFailure(answer(409, body), { service: "hmrc" });
    expect(failure.kind).toBe(FAILURE_KINDS.businessError);
    expect(failure.errors).toEqual([body.message]);
  });
});
