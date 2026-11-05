// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/googleDelegatedToken.test.js

import { describe, test, expect } from "vitest";
import {
  ASSERTION_LIFETIME_SECONDS,
  DelegationError,
  JWT_BEARER_GRANT,
  SIGN_JWT_URL,
  TOKEN_URL,
  delegatedTokenGetter,
  delegationClaims,
} from "../../../scripts/google-delegated-token.mjs";

const ACCOUNT = "reader@example-project.iam.gserviceaccount.com";
const MAILBOX = "box@example.test";
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const NOW_MS = Date.UTC(2030, 0, 1, 12, 0, 0);

function fakeGoogle({ signStatus = 200, exchangeStatus = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url === SIGN_JWT_URL(ACCOUNT)) {
      if (signStatus !== 200) {
        return new Response(JSON.stringify({ error: { status: "PERMISSION_DENIED", message: "quota project required" } }), {
          status: signStatus,
        });
      }
      return new Response(JSON.stringify({ keyId: "k", signedJwt: "signed.jwt.value" }), { status: 200 });
    }
    if (url === TOKEN_URL) {
      if (exchangeStatus !== 200) return new Response(JSON.stringify({ error: "unauthorized_client" }), { status: exchangeStatus });
      return new Response(JSON.stringify({ access_token: "mailbox-token", expires_in: 3599 }), { status: 200 });
    }
    throw new Error(`unexpected call ${url}`);
  };
  return { calls, fetchImpl };
}

const getterFor = (google, overrides = {}) =>
  delegatedTokenGetter({
    serviceAccountEmail: ACCOUNT,
    subject: MAILBOX,
    scopes: [SCOPE],
    getFederatedToken: async () => "federated-token",
    fetchImpl: google.fetchImpl,
    now: () => NOW_MS,
    ...overrides,
  });

describe("google delegated token", () => {
  test("claim set names the account, mailbox, scope, token audience and an hour of life", () => {
    const claims = delegationClaims({ serviceAccountEmail: ACCOUNT, subject: MAILBOX, scopes: [SCOPE], nowMs: NOW_MS });
    expect(claims).toEqual({
      iss: ACCOUNT,
      sub: MAILBOX,
      scope: SCOPE,
      aud: "https://oauth2.googleapis.com/token",
      iat: NOW_MS / 1000,
      exp: NOW_MS / 1000 + 3600,
    });
    expect(ASSERTION_LIFETIME_SECONDS).toBeLessThanOrEqual(3600);
  });

  test("signs the claim set with the federated token, then exchanges the signed JWT", async () => {
    const google = fakeGoogle();
    const token = await getterFor(google)();
    expect(token).toBe("mailbox-token");
    expect(google.calls).toHaveLength(2);

    const [sign, exchange] = google.calls;
    expect(sign.url).toBe(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(ACCOUNT)}:signJwt`);
    expect(sign.init.headers.authorization).toBe("Bearer federated-token");
    const payload = JSON.parse(JSON.parse(sign.init.body).payload);
    expect(payload.iss).toBe(ACCOUNT);
    expect(payload.sub).toBe(MAILBOX);
    expect(payload.scope).toBe(SCOPE);
    expect(payload.aud).toBe(TOKEN_URL);
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(3600);

    const form = new URLSearchParams(exchange.init.body);
    expect(form.get("grant_type")).toBe(JWT_BEARER_GRANT);
    expect(form.get("assertion")).toBe("signed.jwt.value");
  });

  test("reads no private key: the only credentials are the federated token and the signed JWT", async () => {
    const google = fakeGoogle();
    await getterFor(google)();
    const sent = JSON.stringify(google.calls);
    expect(sent).not.toMatch(/private_key|BEGIN [A-Z ]*PRIVATE KEY/);
  });

  test("reuses the token until a minute before it expires", async () => {
    const google = fakeGoogle();
    let nowMs = NOW_MS;
    const getToken = getterFor(google, { now: () => nowMs });
    await getToken();
    nowMs += 3000 * 1000;
    await getToken();
    expect(google.calls).toHaveLength(2);
    nowMs += 600 * 1000;
    await getToken();
    expect(google.calls).toHaveLength(4);
  });

  test("a federation failure names the federation step", async () => {
    const google = fakeGoogle();
    const getToken = getterFor(google, {
      getFederatedToken: async () => {
        throw new Error("Could not load the default credentials");
      },
    });
    await expect(getToken()).rejects.toMatchObject({ step: "federation" });
    expect(google.calls).toHaveLength(0);
  });

  test("a signJwt failure names the step and carries Google's error text, not the payload", async () => {
    const getToken = getterFor(fakeGoogle({ signStatus: 403 }));
    const error = await getToken().catch((e) => e);
    expect(error).toBeInstanceOf(DelegationError);
    expect(error.step).toBe("signJwt");
    expect(error.message).toContain("HTTP 403 PERMISSION_DENIED: quota project required");
    expect(error.message).not.toContain(MAILBOX);
    expect(error.message).not.toContain("federated-token");
  });

  test("a token exchange failure names the step", async () => {
    const getToken = getterFor(fakeGoogle({ exchangeStatus: 401 }));
    const error = await getToken().catch((e) => e);
    expect(error.step).toBe("token exchange");
    expect(error.message).toContain("HTTP 401 unauthorized_client");
    expect(error.message).not.toContain("signed.jwt.value");
  });
});
