// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/hmrcAssert.test.js

import { describe, test, expect } from "vitest";

import {
  parseConfig,
  applicationsForEnvironment,
  probeRequest,
  classifySubscriptionResponse,
} from "../../../infra/hmrc/hmrc-assert.js";

const SAMPLE_TOML = `
[application.sandbox]
client_id = "uqMHA6RsDGGa7h8EG2VqfqAmv4tV"
host = "test-api.service.hmrc.gov.uk"
redirect_uris = ["https://ci-submit.diyaccounting.co.uk/activities/submitVatCallback.html"]

  [application.sandbox.secret]
  ci = "ci/submit/hmrc/sandbox_client_secret"
  prod = "prod/submit/hmrc/sandbox_client_secret"

  [[application.sandbox.subscription]]
  api = "business-details"
  version = "2.0"
  probe = "/individuals/business/details/AA000003A/list"

  [[application.sandbox.subscription]]
  api = "create-test-user"
  version = "1.0"
  method = "POST"
  probe = "/create-test-user/individuals"

[application.production]
client_id = "hKCOeWXZ6ji7H3ep3nMwHrP5ycev"
host = "api.service.hmrc.gov.uk"
redirect_uris = ["https://submit.diyaccounting.co.uk/activities/submitVatCallback.html"]

  [application.production.secret]
  prod = "prod/submit/hmrc/client_secret"

  [[application.production.subscription]]
  api = "vat-mtd"
  version = "1.0"
  probe = "/organisations/vat/193051768/obligations"
`;

describe("parseConfig", () => {
  test("reads both applications", () => {
    const { applications } = parseConfig(SAMPLE_TOML);

    expect(applications.sandbox.clientId).toBe("uqMHA6RsDGGa7h8EG2VqfqAmv4tV");
    expect(applications.sandbox.host).toBe("test-api.service.hmrc.gov.uk");
    expect(applications.sandbox.secretByEnvironment).toEqual({
      ci: "ci/submit/hmrc/sandbox_client_secret",
      prod: "prod/submit/hmrc/sandbox_client_secret",
    });
    expect(applications.sandbox.subscriptions).toEqual([
      { api: "business-details", version: "2.0", probe: "/individuals/business/details/AA000003A/list", method: "GET" },
      { api: "create-test-user", version: "1.0", probe: "/create-test-user/individuals", method: "POST" },
    ]);

    expect(applications.production.secretByEnvironment).toEqual({ prod: "prod/submit/hmrc/client_secret" });
    expect(applications.production.subscriptions).toHaveLength(1);
  });

  test("throws when either application is missing", () => {
    expect(() => parseConfig("[application.sandbox]\nclient_id = \"x\"\nhost = \"h\"\n")).toThrow(/production/);
  });

  test("throws when a subscription is missing a required field", () => {
    const toml = `
[application.sandbox]
client_id = "x"
host = "h"
  [[application.sandbox.subscription]]
  api = "vat-mtd"
[application.production]
client_id = "y"
host = "h2"
`;
    expect(() => parseConfig(toml)).toThrow(/version|probe/);
  });
});

describe("applicationsForEnvironment", () => {
  test("ci asserts sandbox only", () => {
    expect(applicationsForEnvironment("ci")).toEqual(["sandbox"]);
  });

  test("prod asserts both applications", () => {
    expect(applicationsForEnvironment("prod")).toEqual(["sandbox", "production"]);
  });

  test("throws for an unknown environment", () => {
    expect(() => applicationsForEnvironment("staging")).toThrow(/staging/);
  });
});

describe("probeRequest", () => {
  test("builds the Accept header from the subscription's version", () => {
    const request = probeRequest({
      host: "test-api.service.hmrc.gov.uk",
      subscription: { method: "GET", probe: "/individuals/business/details/AA000003A/list", version: "2.0" },
      accessToken: "tok",
    });
    expect(request).toEqual({
      url: "https://test-api.service.hmrc.gov.uk/individuals/business/details/AA000003A/list",
      method: "GET",
      headers: { Authorization: "Bearer tok", Accept: "application/vnd.hmrc.2.0+json" },
    });
  });
});

describe("classifySubscriptionResponse", () => {
  test("403 RESOURCE_FORBIDDEN means not subscribed", () => {
    expect(classifySubscriptionResponse(403, { code: "RESOURCE_FORBIDDEN" })).toBe("not-subscribed");
  });

  test.each([200, 400, 401, 404])("%i means subscribed", (status) => {
    expect(classifySubscriptionResponse(status, { code: "SOMETHING_ELSE" })).toBe("subscribed");
  });

  test("a 403 with a different code is not classified as subscription evidence", () => {
    expect(classifySubscriptionResponse(403, { code: "CLIENT_OR_AGENT_NOT_AUTHORISED" })).toBe("unknown");
  });

  test("an unexpected status is unknown", () => {
    expect(classifySubscriptionResponse(500, undefined)).toBe("unknown");
  });
});
