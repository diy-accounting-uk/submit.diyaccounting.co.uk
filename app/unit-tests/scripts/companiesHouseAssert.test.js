// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/companiesHouseAssert.test.js

import { describe, test, expect } from "vitest";

import { parseConfig, authoriseUrl, classifyAuthoriseResponse, probeScope } from "../../../infra/companies-house/companies-house-assert.js";

const SAMPLE_TOML = `
[environment.ci]
application_name = "DIY Accounting Submit - test"
client_id = "e5be4a0d-cebf-4024-83a3-5497a0fec4b2"
rest_base_uri = "https://api.company-information.service.gov.uk"
identity_base_uri = "https://identity-sandbox.company-information.service.gov.uk"
xmlgw_uri = "https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway"
redirect_uris = ["https://ci-submit.diyaccounting.co.uk/companies-house/filingCallback.html"]

  [environment.ci.secrets]
  api_key = "ci/submit/companies-house/api_key"
  client_secret = "ci/submit/companies-house/client_secret"
  presenter_id = "ci/submit/companies-house/presenter_id"
  presenter_code = "ci/submit/companies-house/presenter_code"

[environment.prod]
application_name = "DIY Accounting Submit"
client_id = "9b4676ee-a473-4d10-aafe-33d5a14d982d"
rest_base_uri = "https://api.company-information.service.gov.uk"
identity_base_uri = "https://identity.company-information.service.gov.uk"
xmlgw_uri = ""
redirect_uris = ["https://submit.diyaccounting.co.uk/companies-house/filingCallback.html"]

  [environment.prod.secrets]
  api_key = "prod/submit/companies-house/api_key"
  client_secret = "prod/submit/companies-house/client_secret"
  presenter_id = ""
  presenter_code = ""
`;

describe("parseConfig", () => {
  test("reads both environments", () => {
    const { environments } = parseConfig(SAMPLE_TOML);
    expect(Object.keys(environments)).toEqual(["ci", "prod"]);

    expect(environments.ci).toEqual({
      applicationName: "DIY Accounting Submit - test",
      clientId: "e5be4a0d-cebf-4024-83a3-5497a0fec4b2",
      restBaseUri: "https://api.company-information.service.gov.uk",
      identityBaseUri: "https://identity-sandbox.company-information.service.gov.uk",
      xmlgwUri: "https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway",
      redirectUris: ["https://ci-submit.diyaccounting.co.uk/companies-house/filingCallback.html"],
      secrets: {
        apiKey: "ci/submit/companies-house/api_key",
        clientSecret: "ci/submit/companies-house/client_secret",
        presenterId: "ci/submit/companies-house/presenter_id",
        presenterCode: "ci/submit/companies-house/presenter_code",
      },
    });

    expect(environments.prod.xmlgwUri).toBeNull();
    expect(environments.prod.secrets.presenterId).toBeNull();
    expect(environments.prod.secrets.presenterCode).toBeNull();
  });

  test("throws when there are no [environment.*] entries", () => {
    expect(() => parseConfig("")).toThrow(/environment/);
  });

  test("throws when an environment is missing a required field", () => {
    expect(() => parseConfig('[environment.ci]\nclient_id = "x"\n')).toThrow(/identity_base_uri|rest_base_uri/);
  });
});

describe("probeScope", () => {
  test("builds the profile-read scope on the identity host", () => {
    expect(probeScope("https://identity-sandbox.company-information.service.gov.uk")).toBe(
      "https://identity-sandbox.company-information.service.gov.uk/user/profile.read",
    );
  });

  test("strips a trailing slash from the identity host", () => {
    expect(probeScope("https://identity.company-information.service.gov.uk/")).toBe(
      "https://identity.company-information.service.gov.uk/user/profile.read",
    );
  });
});

describe("authoriseUrl", () => {
  test("builds the same query shape web/public/lib/auth-url-builder.js sends", () => {
    const url = authoriseUrl({
      identityBaseUri: "https://identity-sandbox.company-information.service.gov.uk",
      clientId: "e5be4a0d-cebf-4024-83a3-5497a0fec4b2",
      redirectUri: "https://ci-submit.diyaccounting.co.uk/companies-house/filingCallback.html",
      scope: "https://identity-sandbox.company-information.service.gov.uk/user/profile.read",
      state: "infra-assert",
    });
    expect(url).toBe(
      "https://identity-sandbox.company-information.service.gov.uk/oauth2/authorise" +
        "?response_type=code" +
        "&client_id=e5be4a0d-cebf-4024-83a3-5497a0fec4b2" +
        "&redirect_uri=https%3A%2F%2Fci-submit.diyaccounting.co.uk%2Fcompanies-house%2FfilingCallback.html" +
        "&scope=https%3A%2F%2Fidentity-sandbox.company-information.service.gov.uk%2Fuser%2Fprofile.read" +
        "&state=infra-assert",
    );
  });
});

describe("classifyAuthoriseResponse", () => {
  test("a 400 means the client id or redirect URI is not registered", () => {
    expect(classifyAuthoriseResponse(400)).toBe("not-registered");
  });

  test.each([200, 302, 401])("a %i response means the pair is registered", (status) => {
    expect(classifyAuthoriseResponse(status)).toBe("registered");
  });
});
