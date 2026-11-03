// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import { apiEndpoint, verifyCodeChallenge } from "../../http-simulator/routes/local-oauth.js";

const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const REDIRECT = "http://localhost:3000/auth/loginWithMockCallback.html";

describe("simulator OAuth server PKCE", () => {
  let baseUrl;

  beforeAll(async () => {
    const app = express();
    app.use(express.urlencoded({ extended: true }));
    apiEndpoint(app);
    const server = await new Promise((resolve) => {
      const listening = app.listen(0, () => resolve(listening));
    });
    baseUrl = `http://localhost:${server.address().port}`;
    return () => server.close();
  });

  async function authorize(challengeParams) {
    const query = new URLSearchParams({
      response_type: "code",
      client_id: "debugger",
      redirect_uri: REDIRECT,
      state: "s1",
      ...challengeParams,
    });
    return fetch(`${baseUrl}/oauth/authorize?${query}`);
  }

  async function signIn(challenge) {
    const response = await fetch(`${baseUrl}/oauth/authorize`, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        redirect_uri: REDIRECT,
        state: "s1",
        client_id: "debugger",
        username: "user",
        code_challenge: challenge,
      }),
    });
    return new URL(response.headers.get("location")).searchParams.get("code");
  }

  async function exchange(code, verifier) {
    const body = { grant_type: "authorization_code", client_id: "debugger", code, redirect_uri: REDIRECT };
    if (verifier) body.code_verifier = verifier;
    return fetch(`${baseUrl}/default/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
    });
  }

  it("verifies S256 challenges", () => {
    expect(verifyCodeChallenge(CHALLENGE, VERIFIER)).toBe(true);
    expect(verifyCodeChallenge(CHALLENGE, "another-verifier")).toBe(false);
    expect(verifyCodeChallenge(undefined, VERIFIER)).toBe(false);
  });

  it("refuses an authorize request without a code_challenge", async () => {
    const response = await authorize({});

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("invalid_request");
  });

  it("refuses a plain code_challenge_method", async () => {
    const response = await authorize({ code_challenge: CHALLENGE, code_challenge_method: "plain" });

    expect(response.status).toBe(400);
  });

  it("accepts an authorize request with an S256 challenge", async () => {
    const response = await authorize({ code_challenge: CHALLENGE, code_challenge_method: "S256" });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain(CHALLENGE);
  });

  it("issues tokens when the verifier matches the challenge", async () => {
    const code = await signIn(CHALLENGE);

    const response = await exchange(code, VERIFIER);

    expect(response.status).toBe(200);
    expect((await response.json()).id_token).toBeTruthy();
  });

  it("refuses the exchange when the verifier does not match", async () => {
    const code = await signIn(CHALLENGE);

    const response = await exchange(code, "wrong-verifier-wrong-verifier-wrong-verifier");

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("invalid_grant");
  });

  it("refuses the exchange when no verifier is sent", async () => {
    const code = await signIn(CHALLENGE);

    const response = await exchange(code);

    expect(response.status).toBe(400);
  });
});
