// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// auth.test.js -- signIn's loopback PKCE flow, idToken's and accessToken's cache/refresh, and
// signOut's revoke-then-sign-out-then-delete, with the token endpoint mocked and the browser
// launch stubbed; the loopback listener itself is real, since it is the one piece Cognito's
// exact-match callback URLs actually depend on.

import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.fn(() => ({ unref: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: (...args) => spawnMock(...args) }));

const { accessToken, idToken, signIn, signOut } = await import("../lib/auth.js");

const AUTH_DOMAIN = "https://ci-auth.diyaccounting.co.uk";
const BASE_URL = "https://ci.submit.diyaccounting.co.uk";
const CLIENT_ID = "test-mcp-client-id";

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) };
}

// The signIn tests still need a real network call for their own request to the loopback
// listener (the one piece under test), so this stub only intercepts the token endpoint and
// falls through to the real fetch for everything else, rather than replacing fetch outright.
function stubTokenEndpoint(status, body) {
  const realFetch = globalThis.fetch;
  const mockFetch = vi.fn((url, init) => {
    if (typeof url === "string" && url.startsWith(`${AUTH_DOMAIN}/oauth2/token`)) {
      return Promise.resolve(jsonResponse(status, body));
    }
    return realFetch(url, init);
  });
  vi.stubGlobal("fetch", mockFetch);
  return mockFetch;
}

let configDir;

describe("auth", () => {
  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), "diya-submit-auth-"));
    process.env.DIYA_SUBMIT_CONFIG_DIR = configDir;
    process.env.DIYA_SUBMIT_AUTH_DOMAIN = AUTH_DOMAIN;
    process.env.DIYA_SUBMIT_MCP_CLIENT_ID = CLIENT_ID;
    process.env.DIYA_SUBMIT_BASE_URL = BASE_URL;
    spawnMock.mockClear();
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
    delete process.env.DIYA_SUBMIT_CONFIG_DIR;
    delete process.env.DIYA_SUBMIT_AUTH_DOMAIN;
    delete process.env.DIYA_SUBMIT_MCP_CLIENT_ID;
    delete process.env.DIYA_SUBMIT_BASE_URL;
    vi.unstubAllGlobals();
  });

  describe("signIn", () => {
    it("opens the hosted UI with a PKCE challenge, catches the code on the loopback listener, and stores the refresh token mode 600", async () => {
      const mockFetch = stubTokenEndpoint(200, {
        id_token: "id-token-1",
        access_token: "access-token-1",
        refresh_token: "refresh-token-1",
        expires_in: 3600,
        token_type: "Bearer",
      });

      const signInPromise = signIn();

      // signIn() opens the browser before it awaits the callback; give that microtask a turn.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(spawnMock).toHaveBeenCalledTimes(1);
      const openedUrl = new URL(spawnMock.mock.calls[0][1].at(-1));

      expect(openedUrl.origin + openedUrl.pathname).toBe(`${AUTH_DOMAIN}/oauth2/authorize`);
      expect(openedUrl.searchParams.get("client_id")).toBe(CLIENT_ID);
      expect(openedUrl.searchParams.get("code_challenge_method")).toBe("S256");
      const redirectUri = new URL(openedUrl.searchParams.get("redirect_uri"));
      expect(redirectUri.hostname).toBe("127.0.0.1");
      expect(redirectUri.pathname).toBe("/callback");
      const port = Number(redirectUri.port);
      expect(port).toBeGreaterThanOrEqual(49152);
      expect(port).toBeLessThanOrEqual(49159);
      const state = openedUrl.searchParams.get("state");

      const callbackResponse = await fetch(`http://127.0.0.1:${port}/callback?code=auth-code-1&state=${encodeURIComponent(state)}`);
      expect(callbackResponse.status).toBe(200);

      const result = await signInPromise;
      expect(result).toEqual({ signedIn: true });

      const [tokenUrl, tokenInit] = mockFetch.mock.calls.find(([url]) => url === `${AUTH_DOMAIN}/oauth2/token`);
      expect(tokenUrl).toBe(`${AUTH_DOMAIN}/oauth2/token`);
      const tokenBody = new URLSearchParams(tokenInit.body);
      expect(tokenBody.get("grant_type")).toBe("authorization_code");
      expect(tokenBody.get("code")).toBe("auth-code-1");
      expect(tokenBody.get("redirect_uri")).toBe(redirectUri.toString());
      expect(tokenBody.get("code_verifier")).toBeTruthy();

      const credentialsPath = join(configDir, "credentials.json");
      const stored = JSON.parse(readFileSync(credentialsPath, "utf8"));
      expect(stored.refreshToken).toBe("refresh-token-1");
      expect(stored.idToken).toBe("id-token-1");
      expect(stored.idTokenExpiresAt).toBeGreaterThan(Date.now());
      expect(stored.accessToken).toBe("access-token-1");
      expect(stored.accessTokenExpiresAt).toBeGreaterThan(Date.now());
      expect(statSync(credentialsPath).mode & 0o777).toBe(0o600);
    });

    it("rejects when the hosted UI's callback state does not match", async () => {
      const signInPromise = signIn();
      // The callback request settles this promise as a side effect of the fetch() below, well
      // before the "rejects" assertion attaches its own handler; a synchronous no-op catch here
      // only silences node's unhandledRejection warning for that gap, it does not consume the
      // rejection the assertion still awaits on the same promise.
      signInPromise.catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 50));
      const openedUrl = new URL(spawnMock.mock.calls[0][1].at(-1));
      const redirectUri = new URL(openedUrl.searchParams.get("redirect_uri"));

      await fetch(`${redirectUri.toString()}?code=auth-code-1&state=wrong-state`);

      await expect(signInPromise).rejects.toThrow(/state did not match/);
    });

    it("rejects when the hosted UI reports an error", async () => {
      const signInPromise = signIn();
      signInPromise.catch(() => {}); // see the note in the state-mismatch test above
      await new Promise((resolve) => setTimeout(resolve, 50));
      const openedUrl = new URL(spawnMock.mock.calls[0][1].at(-1));
      const redirectUri = new URL(openedUrl.searchParams.get("redirect_uri"));
      const state = openedUrl.searchParams.get("state");

      await fetch(`${redirectUri.toString()}?error=access_denied&state=${encodeURIComponent(state)}`);

      await expect(signInPromise).rejects.toThrow(/access_denied/);
    });
  });

  describe("idToken", () => {
    it("requires signIn to have run first", async () => {
      await expect(idToken()).rejects.toThrow(/Not signed in/);
    });

    it("answers the cached id token without a network call while it is not near expiry", async () => {
      writeFileSync(
        join(configDir, "credentials.json"),
        JSON.stringify({ refreshToken: "refresh-token-1", idToken: "cached-id-token", idTokenExpiresAt: Date.now() + 3600_000 }),
      );
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      const token = await idToken();

      expect(token).toBe("cached-id-token");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("refreshes silently once the cached id token is near expiry, keeping the refresh token if none is reissued", async () => {
      writeFileSync(
        join(configDir, "credentials.json"),
        JSON.stringify({ refreshToken: "refresh-token-1", idToken: "stale-id-token", idTokenExpiresAt: Date.now() + 1000 }),
      );
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, { id_token: "fresh-id-token", expires_in: 3600 }));
      vi.stubGlobal("fetch", mockFetch);

      const token = await idToken();

      expect(token).toBe("fresh-id-token");
      const [tokenUrl, tokenInit] = mockFetch.mock.calls[0];
      expect(tokenUrl).toBe(`${AUTH_DOMAIN}/oauth2/token`);
      const tokenBody = new URLSearchParams(tokenInit.body);
      expect(tokenBody.get("grant_type")).toBe("refresh_token");
      expect(tokenBody.get("refresh_token")).toBe("refresh-token-1");

      const stored = JSON.parse(readFileSync(join(configDir, "credentials.json"), "utf8"));
      expect(stored.idToken).toBe("fresh-id-token");
      expect(stored.refreshToken).toBe("refresh-token-1");
    });

    it("throws the token endpoint's own error on a failed refresh", async () => {
      writeFileSync(
        join(configDir, "credentials.json"),
        JSON.stringify({ refreshToken: "refresh-token-1", idToken: "stale-id-token", idTokenExpiresAt: 1 }),
      );
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(400, { error: "invalid_grant", error_description: "Refresh Token has expired" }));
      vi.stubGlobal("fetch", mockFetch);

      await expect(idToken()).rejects.toThrow("Refresh Token has expired");
    });
  });

  describe("accessToken", () => {
    it("requires signIn to have run first", async () => {
      await expect(accessToken()).rejects.toThrow(/Not signed in/);
    });

    it("answers the cached access token without a network call while it is not near expiry", async () => {
      writeFileSync(
        join(configDir, "credentials.json"),
        JSON.stringify({
          refreshToken: "refresh-token-1",
          accessToken: "cached-access-token",
          accessTokenExpiresAt: Date.now() + 3600_000,
        }),
      );
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      const token = await accessToken();

      expect(token).toBe("cached-access-token");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("refreshes silently once the cached access token is near expiry", async () => {
      writeFileSync(
        join(configDir, "credentials.json"),
        JSON.stringify({
          refreshToken: "refresh-token-1",
          accessToken: "stale-access-token",
          accessTokenExpiresAt: Date.now() + 1000,
        }),
      );
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(200, { access_token: "fresh-access-token", expires_in: 3600 }));
      vi.stubGlobal("fetch", mockFetch);

      const token = await accessToken();

      expect(token).toBe("fresh-access-token");
      const stored = JSON.parse(readFileSync(join(configDir, "credentials.json"), "utf8"));
      expect(stored.accessToken).toBe("fresh-access-token");
    });
  });

  describe("signOut", () => {
    function credentialsPath() {
      return join(configDir, "credentials.json");
    }

    it("revokes the refresh token, posts to the sign-out route, and deletes the credentials file", async () => {
      writeFileSync(
        credentialsPath(),
        JSON.stringify({ refreshToken: "refresh-token-1", accessToken: "access-token-1", idToken: "id-token-1" }),
      );
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse(200, {}));
      vi.stubGlobal("fetch", mockFetch);

      const result = await signOut();

      expect(result).toEqual({ signedOut: true });
      const [revokeUrl, revokeInit] = mockFetch.mock.calls.find(([url]) => url === `${AUTH_DOMAIN}/oauth2/revoke`);
      expect(revokeUrl).toBe(`${AUTH_DOMAIN}/oauth2/revoke`);
      const revokeBody = new URLSearchParams(revokeInit.body);
      expect(revokeBody.get("token")).toBe("refresh-token-1");
      expect(revokeBody.get("client_id")).toBe(CLIENT_ID);

      const [signOutUrl, signOutInit] = mockFetch.mock.calls.find(([url]) => url === `${BASE_URL}/api/v1/session/sign-out`);
      expect(signOutUrl).toBe(`${BASE_URL}/api/v1/session/sign-out`);
      expect(signOutInit.headers.Authorization).toBe("Bearer access-token-1");

      expect(existsSync(credentialsPath())).toBe(false);
    });

    it("still deletes the credentials file when the revoke and sign-out calls fail", async () => {
      writeFileSync(
        credentialsPath(),
        JSON.stringify({ refreshToken: "refresh-token-1", accessToken: "access-token-1", idToken: "id-token-1" }),
      );
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

      const result = await signOut();

      expect(result).toEqual({ signedOut: true });
      expect(existsSync(credentialsPath())).toBe(false);
    });

    it("is a no-op on the network when there are no stored credentials", async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      const result = await signOut();

      expect(result).toEqual({ signedOut: true });
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
