// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach } from "vitest";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { getInstallationAccessToken } from "@app/lib/githubAppToken.js";

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

function decodeJwt(jwt) {
  const [headerPart, payloadPart, signaturePart] = jwt.split(".");
  return {
    header: JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8")),
    payload: JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")),
    signingInput: `${headerPart}.${payloadPart}`,
    signature: Buffer.from(signaturePart, "base64url"),
  };
}

function verifyJwt(jwt) {
  const { header, payload, signingInput, signature } = decodeJwt(jwt);
  const verified = createVerify("RSA-SHA256").update(signingInput).verify(publicKey, signature);
  return { header, payload, verified };
}

function authorizationBearerJwt(fetchMock, callIndex = 0) {
  const [, options] = fetchMock.mock.calls[callIndex];
  return options.headers.Authorization.replace(/^Bearer /, "");
}

function tokenResponse({ token = "ghs_installation-token", expiresAt } = {}) {
  return {
    ok: true,
    json: () => Promise.resolve({ token, expires_at: expiresAt ?? new Date(Date.now() + 60 * 60 * 1000).toISOString() }),
  };
}

describe("githubAppToken", () => {
  beforeEach(() => {
    // The module cache is process-wide, so every test mints against its own installation id
    // to avoid one test's cached token answering another test's call.
  });

  test("mints a JWT that verifies against the App's own public key, with iat backdated and exp about 9 minutes out", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(tokenResponse());
    const before = Math.floor(Date.now() / 1000);

    await getInstallationAccessToken({ appId: "12345", privateKey, installationId: "1", fetchImpl });

    const { header, payload, verified } = verifyJwt(authorizationBearerJwt(fetchImpl));
    expect(verified).toBe(true);
    expect(header).toEqual({ alg: "RS256", typ: "JWT" });
    expect(payload.iss).toBe("12345");
    expect(payload.iat).toBeLessThanOrEqual(before - 59);
    expect(payload.iat).toBeGreaterThanOrEqual(before - 61);
    expect(payload.exp - payload.iat).toBe(60 + 9 * 60);
  });

  test("posts to the installation's access_tokens endpoint with the standard GitHub headers", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(tokenResponse());

    await getInstallationAccessToken({ appId: "12345", privateKey, installationId: "77", fetchImpl });

    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.github.com/app/installations/77/access_tokens");
    expect(options.method).toBe("POST");
    expect(options.headers.Accept).toBe("application/vnd.github+json");
    expect(options.headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
  });

  test("sends no body and no Content-Type when no repositories are given", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(tokenResponse());

    await getInstallationAccessToken({ appId: "12345", privateKey, installationId: "2", fetchImpl });

    const [, options] = fetchImpl.mock.calls[0];
    expect(options.body).toBeUndefined();
    expect(options.headers["Content-Type"]).toBeUndefined();
  });

  test("sends the repositories list as the JSON body when given", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(tokenResponse());

    await getInstallationAccessToken({
      appId: "12345",
      privateKey,
      installationId: "3",
      repositories: ["submit.diyaccounting.co.uk"],
      fetchImpl,
    });

    const [, options] = fetchImpl.mock.calls[0];
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(options.body)).toEqual({ repositories: ["submit.diyaccounting.co.uk"] });
  });

  test("returns the token from a successful response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(tokenResponse({ token: "ghs_abc123" }));

    const token = await getInstallationAccessToken({ appId: "12345", privateKey, installationId: "4", fetchImpl });

    expect(token).toBe("ghs_abc123");
  });

  test("reuses the cached token for the same installation id and repositories, minting no second JWT", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(tokenResponse({ token: "ghs_cached" }));

    const first = await getInstallationAccessToken({ appId: "12345", privateKey, installationId: "5", fetchImpl });
    const second = await getInstallationAccessToken({ appId: "12345", privateKey, installationId: "5", fetchImpl });

    expect(first).toBe("ghs_cached");
    expect(second).toBe("ghs_cached");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("mints separately for the same installation id scoped to different repositories", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse({ token: "ghs_submit" }))
      .mockResolvedValueOnce(tokenResponse({ token: "ghs_spreadsheets" }));

    const submitToken = await getInstallationAccessToken({
      appId: "12345",
      privateKey,
      installationId: "6",
      repositories: ["submit.diyaccounting.co.uk"],
      fetchImpl,
    });
    const spreadsheetsToken = await getInstallationAccessToken({
      appId: "12345",
      privateKey,
      installationId: "6",
      repositories: ["spreadsheets.diyaccounting.co.uk"],
      fetchImpl,
    });

    expect(submitToken).toBe("ghs_submit");
    expect(spreadsheetsToken).toBe("ghs_spreadsheets");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("mints a fresh token once the cached one is within 5 minutes of its expiry", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse({ token: "ghs_first", expiresAt: new Date(Date.now() + 4 * 60 * 1000).toISOString() }))
      .mockResolvedValueOnce(tokenResponse({ token: "ghs_second" }));

    const first = await getInstallationAccessToken({ appId: "12345", privateKey, installationId: "7", fetchImpl });
    const second = await getInstallationAccessToken({ appId: "12345", privateKey, installationId: "7", fetchImpl });

    expect(first).toBe("ghs_first");
    expect(second).toBe("ghs_second");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("throws with the status and body on a non-ok response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401, text: () => Promise.resolve("Bad credentials") });

    await expect(getInstallationAccessToken({ appId: "12345", privateKey, installationId: "8", fetchImpl })).rejects.toThrow(
      "GitHub API error minting installation access token: 401 Bad credentials",
    );
  });
});
