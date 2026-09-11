// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/googleOauthAssert.test.js

import { describe, test, expect } from "vitest";

import { parseConfig, deriveProjectNumber, assertClientIdMatches, assertBrandMatches, assertScopesGranted } from "../../../scripts/google-oauth-assert.js";

const SAMPLE_TOML = `
[[client]]
purpose = "sign_in"
id = "670010122633-j177nir959n1tdnd891uqsgj6fkrj6b1.apps.googleusercontent.com"
application_type = "web"
scopes = ["email", "openid", "profile"]
redirect_uris = [
  "https://ci-auth.diyaccounting.co.uk/oauth2/idpresponse",
  "https://prod-auth.diyaccounting.co.uk/oauth2/idpresponse",
]

  [client.environment.ci]
  secret = "ci/submit/google/client_secret"
  identity_stack = "ci-env-IdentityStack"

  [client.environment.prod]
  secret = "prod/submit/google/client_secret"
  identity_stack = "prod-env-IdentityStack"

[[client]]
purpose = "youtube_upload"
application_type = "desktop"
scopes = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.force-ssl"]
secret = "prod/submit/youtube/oauth_client"

  [client.brand]
  app_name = "DIY Accounting Submit"
  audience = "external"
`;

describe("parseConfig", () => {
  test("reads both clients", () => {
    const config = parseConfig(SAMPLE_TOML);
    expect(config.clients).toHaveLength(2);

    const signIn = config.clients[0];
    expect(signIn.purpose).toBe("sign_in");
    expect(signIn.id).toBe("670010122633-j177nir959n1tdnd891uqsgj6fkrj6b1.apps.googleusercontent.com");
    expect(signIn.applicationType).toBe("web");
    expect(signIn.scopes).toEqual(["email", "openid", "profile"]);
    expect(signIn.redirectUris).toEqual(["https://ci-auth.diyaccounting.co.uk/oauth2/idpresponse", "https://prod-auth.diyaccounting.co.uk/oauth2/idpresponse"]);
    expect(signIn.environments).toEqual({
      ci: { secret: "ci/submit/google/client_secret", identityStack: "ci-env-IdentityStack" },
      prod: { secret: "prod/submit/google/client_secret", identityStack: "prod-env-IdentityStack" },
    });
    expect(signIn.secret).toBeNull();
    expect(signIn.brand).toBeNull();

    const youtube = config.clients[1];
    expect(youtube.purpose).toBe("youtube_upload");
    expect(youtube.id).toBeNull();
    expect(youtube.environments).toBeNull();
    expect(youtube.secret).toBe("prod/submit/youtube/oauth_client");
    expect(youtube.brand).toEqual({ appName: "DIY Accounting Submit", audience: "external" });
  });

  test("throws when there are no [[client]] entries", () => {
    expect(() => parseConfig("")).toThrow(/\[\[client\]\]/);
  });

  test("throws when a client has no purpose", () => {
    expect(() => parseConfig('[[client]]\nid = "x"\n')).toThrow(/purpose/);
  });
});

describe("deriveProjectNumber", () => {
  test("reads the number prefix off a client id", () => {
    expect(deriveProjectNumber("670010122633-j177nir959n1tdnd891uqsgj6fkrj6b1.apps.googleusercontent.com")).toBe("670010122633");
  });

  test("throws when the id doesn't start with a numeric prefix", () => {
    expect(() => deriveProjectNumber("not-a-real-client-id")).toThrow(/Could not derive a project number/);
  });
});

describe("assertClientIdMatches", () => {
  test("passes silently when the ids match", () => {
    expect(() => assertClientIdMatches("sign_in", "abc", "abc")).not.toThrow();
  });

  test("throws naming both ids when they differ", () => {
    expect(() => assertClientIdMatches("sign_in (ci)", "abc", "xyz")).toThrow(/"abc".*"xyz"/s);
  });
});

describe("assertBrandMatches", () => {
  const liveBrand = { applicationTitle: "DIY Accounting Submit", orgInternalOnly: false };

  test("passes when app_name and audience both match", () => {
    expect(() => assertBrandMatches("youtube_upload", { appName: "DIY Accounting Submit", audience: "external" }, liveBrand)).not.toThrow();
  });

  test("skips an unrecorded field rather than treating it as a mismatch", () => {
    expect(() => assertBrandMatches("youtube_upload", { audience: "external" }, liveBrand)).not.toThrow();
  });

  test("throws when app_name differs", () => {
    expect(() => assertBrandMatches("youtube_upload", { appName: "Wrong Name" }, liveBrand)).toThrow(/app_name/);
  });

  test("throws when audience differs", () => {
    expect(() => assertBrandMatches("youtube_upload", { audience: "internal" }, liveBrand)).toThrow(/audience/);
  });
});

describe("assertScopesGranted", () => {
  test("passes when every declared scope is granted", () => {
    const granted = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl";
    expect(() =>
      assertScopesGranted("youtube_upload", ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.force-ssl"], granted),
    ).not.toThrow();
  });

  test("tolerates extra granted scopes the file doesn't track", () => {
    const granted = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl https://www.googleapis.com/auth/userinfo.email";
    expect(() => assertScopesGranted("youtube_upload", ["https://www.googleapis.com/auth/youtube.upload"], granted)).not.toThrow();
  });

  test("throws naming the missing scope", () => {
    expect(() => assertScopesGranted("youtube_upload", ["https://www.googleapis.com/auth/youtube.upload"], "")).toThrow(/youtube\.upload/);
  });
});
