// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/oauthRedirectUri.test.js

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { resolveCallbackRedirectUri, ownCallbackRedirectUri } from "@app/lib/oauthRedirectUri.js";

const HMRC_PATH = "activities/submitVatCallback.html";
const COMPANIES_HOUSE_PATH = "companies-house/filingCallback.html";
const DEPLOYMENT_BASE_URL = "https://ci-set2.submit.diyaccounting.co.uk/";
const PROD_APEX_BASE_URL = "https://submit.diyaccounting.co.uk/";

const HOST_ERROR = "Invalid redirectUri. The host is not a registered callback host.";
const PATH_ERROR = `Invalid redirectUri. Must be the ${HMRC_PATH} callback page.`;
const ABSOLUTE_ERROR = "Invalid redirectUri. Must be an absolute URL.";
const MISSING_ERROR = "Missing redirectUri from event body";

let savedBaseUrl;

beforeEach(() => {
  savedBaseUrl = process.env.DIY_SUBMIT_BASE_URL;
});

afterEach(() => {
  if (savedBaseUrl === undefined) delete process.env.DIY_SUBMIT_BASE_URL;
  else process.env.DIY_SUBMIT_BASE_URL = savedBaseUrl;
});

describe.each([
  ["a deployment's own base URL", DEPLOYMENT_BASE_URL],
  ["the prod apex base URL", PROD_APEX_BASE_URL],
])("resolveCallbackRedirectUri with %s", (_label, baseUrl) => {
  beforeEach(() => {
    process.env.DIY_SUBMIT_BASE_URL = baseUrl;
  });

  test.each([
    ["userinfo before the host", `https://user:pw@ci-submit.diyaccounting.co.uk/${HMRC_PATH}`, PATH_ERROR],
    ["a non-default port on an apex host", `https://ci-submit.diyaccounting.co.uk:8443/${HMRC_PATH}`, HOST_ERROR],
    ["http on an apex host", `http://ci-submit.diyaccounting.co.uk/${HMRC_PATH}`, HOST_ERROR],
    ["an apex host with a trailing dot", `https://ci-submit.diyaccounting.co.uk./${HMRC_PATH}`, HOST_ERROR],
    ["a punycode look-alike host", `https://xn--ci-submt-zhh.diyaccounting.co.uk/${HMRC_PATH}`, HOST_ERROR],
    ["a percent-encoded dot in the path", "https://ci-submit.diyaccounting.co.uk/activities/submitVatCallback%2Ehtml", PATH_ERROR],
    ["a hash after the callback path", `https://ci-submit.diyaccounting.co.uk/${HMRC_PATH}#x`, PATH_ERROR],
    ["a backslash and an at sign after the host", `https://ci-submit.diyaccounting.co.uk\\@evil.com/${HMRC_PATH}`, PATH_ERROR],
    ["a scheme-relative URL", `//ci-submit.diyaccounting.co.uk/${HMRC_PATH}`, ABSOLUTE_ERROR],
    ["http on the deployment's own host", `http://ci-set2.submit.diyaccounting.co.uk/${HMRC_PATH}`, HOST_ERROR],
    ["a foreign host", `https://evil.example.com/${HMRC_PATH}`, HOST_ERROR],
    ["a look-alike suffix host", `https://ci-submit.diyaccounting.co.uk.evil.example.com/${HMRC_PATH}`, HOST_ERROR],
    ["another path on an apex host", "https://ci-submit.diyaccounting.co.uk/index.html", PATH_ERROR],
    ["a query after the callback path", `https://ci-submit.diyaccounting.co.uk/${HMRC_PATH}?x=1`, PATH_ERROR],
  ])("rejects %s", (_case, candidate, error) => {
    expect(resolveCallbackRedirectUri(candidate, HMRC_PATH)).toEqual({ error });
  });

  test.each([
    ["an absent value", undefined],
    ["an empty string", ""],
    ["a value that is not a string", 42],
  ])("rejects %s as missing", (_case, candidate) => {
    expect(resolveCallbackRedirectUri(candidate, HMRC_PATH)).toEqual({ error: MISSING_ERROR });
  });

  test.each([
    ["the default port written out", `https://ci-submit.diyaccounting.co.uk:443/${HMRC_PATH}`],
    ["an upper-case host", `https://CI-SUBMIT.DiyAccounting.co.uk/${HMRC_PATH}`],
    ["dot segments in the path", "https://ci-submit.diyaccounting.co.uk/activities/x/../submitVatCallback.html"],
    ["an empty query", `https://ci-submit.diyaccounting.co.uk/${HMRC_PATH}?`],
  ])("accepts %s on an apex host as the canonical callback", (_case, candidate) => {
    expect(resolveCallbackRedirectUri(candidate, HMRC_PATH)).toEqual({
      redirectUri: `https://ci-submit.diyaccounting.co.uk/${HMRC_PATH}`,
    });
  });

  test("accepts the prod apex callback", () => {
    expect(resolveCallbackRedirectUri(`https://submit.diyaccounting.co.uk/${HMRC_PATH}`, HMRC_PATH)).toEqual({
      redirectUri: `https://submit.diyaccounting.co.uk/${HMRC_PATH}`,
    });
  });

  test("holds a Companies House callback to its own path", () => {
    expect(resolveCallbackRedirectUri(`https://ci-submit.diyaccounting.co.uk/${COMPANIES_HOUSE_PATH}`, COMPANIES_HOUSE_PATH)).toEqual({
      redirectUri: `https://ci-submit.diyaccounting.co.uk/${COMPANIES_HOUSE_PATH}`,
    });
    expect(resolveCallbackRedirectUri(`https://ci-submit.diyaccounting.co.uk/${HMRC_PATH}`, COMPANIES_HOUSE_PATH)).toEqual({
      error: `Invalid redirectUri. Must be the ${COMPANIES_HOUSE_PATH} callback page.`,
    });
  });
});

describe("resolveCallbackRedirectUri on a deployment's own host", () => {
  beforeEach(() => {
    process.env.DIY_SUBMIT_BASE_URL = DEPLOYMENT_BASE_URL;
  });

  test("accepts the deployment's own callback", () => {
    expect(resolveCallbackRedirectUri(`https://ci-set2.submit.diyaccounting.co.uk/${HMRC_PATH}`, HMRC_PATH)).toEqual({
      redirectUri: `https://ci-set2.submit.diyaccounting.co.uk/${HMRC_PATH}`,
    });
  });

  test("accepts the deployment's own host with the default port written out, as the canonical callback", () => {
    expect(resolveCallbackRedirectUri(`https://ci-set2.submit.diyaccounting.co.uk:443/${HMRC_PATH}`, HMRC_PATH)).toEqual({
      redirectUri: `https://ci-set2.submit.diyaccounting.co.uk/${HMRC_PATH}`,
    });
  });

  test("rejects another deployment's host", () => {
    expect(resolveCallbackRedirectUri(`https://ci-set3.submit.diyaccounting.co.uk/${HMRC_PATH}`, HMRC_PATH)).toEqual({ error: HOST_ERROR });
  });
});

describe("resolveCallbackRedirectUri with no base URL set", () => {
  beforeEach(() => {
    delete process.env.DIY_SUBMIT_BASE_URL;
  });

  test("rejects a deployment host, which only the base URL can register", () => {
    expect(resolveCallbackRedirectUri(`https://ci-set2.submit.diyaccounting.co.uk/${HMRC_PATH}`, HMRC_PATH)).toEqual({ error: HOST_ERROR });
  });

  test("still accepts an apex callback", () => {
    expect(resolveCallbackRedirectUri(`https://ci-submit.diyaccounting.co.uk/${HMRC_PATH}`, HMRC_PATH)).toEqual({
      redirectUri: `https://ci-submit.diyaccounting.co.uk/${HMRC_PATH}`,
    });
  });
});

describe("ownCallbackRedirectUri", () => {
  test("is the callback page on the deployment's base URL", () => {
    process.env.DIY_SUBMIT_BASE_URL = DEPLOYMENT_BASE_URL;
    expect(ownCallbackRedirectUri(HMRC_PATH)).toBe(`https://ci-set2.submit.diyaccounting.co.uk/${HMRC_PATH}`);
  });
});
