// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/googleReconsent.test.js

import { describe, test, expect } from "vitest";
import crypto from "node:crypto";

import {
  buildConsentUrl,
  makePkcePair,
  makeLogger,
  parseArgs,
  loadSpecs,
  runReconsent,
  runClientRoll,
  StepError,
  TOKEN_ENDPOINT,
} from "../../../scripts/google-reconsent.js";

const OLD_TOKEN = "1//old-refresh-token-aaaa";
const NEW_TOKEN = "1//new-refresh-token-bbbb";
const CODE = "4/authorization-code-value-cccccccc";
const CLIENT_SECRET = "GOCSPX-client-secret-value-dddd";
const CLIENT_RAW = JSON.stringify({ installed: { client_id: "cid.apps.googleusercontent.com", client_secret: CLIENT_SECRET } });
const SECRET_NAME = "prod/submit/test/refresh_token";
const CLIENT_NAME = "prod/submit/test/oauth_client";
const SCOPES = ["scope-a", "scope-b"];

function makeWorld({ failAt, oldStored = true, grantedScopes = SCOPES.join(" "), readBackDiffers = false } = {}) {
  const events = [];
  const lines = [];
  const store = new Map([[CLIENT_NAME, CLIENT_RAW]]);
  if (oldStored) store.set(SECRET_NAME, JSON.stringify({ refresh_token: OLD_TOKEN }));
  const secrets = {
    async read(name) {
      events.push(`read:${name}`);
      if (failAt === "read-back" && name === SECRET_NAME && events.includes("write")) return JSON.stringify({ refresh_token: "different" });
      if (readBackDiffers && events.includes("write")) return "different";
      return store.has(name) ? store.get(name) : null;
    },
    async write(name, value) {
      if (failAt === "write" && value.includes(NEW_TOKEN)) throw new Error("write refused");
      events.push("write");
      store.set(name, value);
    },
  };
  const fetchImpl = async (url, init = {}) => {
    const body = init.body ? Object.fromEntries(new URLSearchParams(init.body)) : {};
    const json = (status, payload) => ({ ok: status < 400, status, json: async () => payload });
    if (url === TOKEN_ENDPOINT && body.grant_type === "authorization_code") {
      events.push("exchange");
      return failAt === "exchange"
        ? json(400, { error: "invalid_grant" })
        : json(200, { refresh_token: NEW_TOKEN, access_token: "at-exchange" });
    }
    if (url === TOKEN_ENDPOINT && body.grant_type === "refresh_token") {
      events.push(`mint:${body.refresh_token === NEW_TOKEN ? "new" : "old"}`);
      return json(200, { access_token: "at-minted", scope: grantedScopes });
    }
    throw new Error(`unexpected url ${url}`);
  };
  const spec = {
    name: "test",
    secretName: SECRET_NAME,
    scopes: SCOPES,
    check: async () => {
      events.push("api-read");
      if (failAt === "check-new" && !events.includes("write")) throw new Error("api read refused");
      if (failAt === "check-stored" && events.includes("write")) throw new Error("api read refused");
    },
  };
  const loopback = async () => ({
    redirectUri: "http://127.0.0.1:5555/",
    waitForCode: async () => {
      events.push("consent");
      if (failAt === "consent") throw new Error("no consent");
      return CODE;
    },
    close: () => events.push("close-loopback"),
  });
  const known = new Set();
  const log = makeLogger(
    (l) => lines.push(l),
    () => known,
  );
  const run = (extra = {}) =>
    runReconsent({
      spec,
      clientSecretName: CLIENT_NAME,
      secrets,
      fetchImpl,
      startLoopback: loopback,
      dryRun: false,
      log,
      remember: (v) => known.add(v),
      ...extra,
    });
  return { events, lines, store, run };
}

describe("consent URL and PKCE", () => {
  test("the URL carries offline access, forced consent, S256 PKCE and exactly the given scopes", () => {
    const url = new URL(
      buildConsentUrl({ clientId: "cid", redirectUri: "http://127.0.0.1:1/", scopes: SCOPES, codeChallenge: "chal", state: "st" }),
    );
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("scope")).toBe("scope-a scope-b");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("response_type")).toBe("code");
  });

  test("the challenge is the base64url SHA-256 of the verifier", () => {
    const { verifier, challenge } = makePkcePair();
    expect(challenge).toBe(crypto.createHash("sha256").update(verifier).digest("base64url"));
    expect(verifier.length).toBeGreaterThanOrEqual(43);
  });
});

describe("arguments and specs", () => {
  test("a mode is required and the two modes are exclusive", () => {
    expect(() => parseArgs([])).toThrow();
    expect(() => parseArgs(["--token", "nope"])).toThrow();
    expect(() => parseArgs(["--token", "ads", "--client-json", "x.json"])).toThrow();
    expect(parseArgs(["--token", "ads", "--dry-run"])).toEqual({ token: "ads", clientJson: undefined, dryRun: true });
  });

  test("each token asks for the scopes its readers use", () => {
    const { tokens } = loadSpecs();
    expect(tokens.youtube.scopes).toEqual([
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.force-ssl",
    ]);
    expect(tokens.ads.scopes).toEqual(["https://www.googleapis.com/auth/adwords", "https://www.googleapis.com/auth/datamanager"]);
    expect(tokens.msads.scopes).toEqual(["openid", "profile", "email"]);
    expect(tokens.msads.secretName).toBe("prod/submit/microsoft-ads/google_refresh_token");
  });
});

describe("the order of the steps for one refresh token", () => {
  test("a clean run checks, writes, reads back and checks again, and never revokes a token", async () => {
    const w = makeWorld();
    await w.run();
    const e = w.events;
    expect(e.indexOf("mint:new")).toBeLessThan(e.indexOf("write"));
    expect(e.indexOf("api-read")).toBeLessThan(e.indexOf("write"));
    const afterWrite = e.slice(e.indexOf("write"));
    expect(afterWrite.indexOf(`read:${SECRET_NAME}`)).toBeLessThan(afterWrite.indexOf("api-read"));
    expect(e.filter((x) => x === "api-read").length).toBe(2);
    // fetchImpl throws on any URL other than the token endpoint, so a revoke call fails the run.
    expect(w.store.get(SECRET_NAME)).toBe(JSON.stringify({ refresh_token: NEW_TOKEN }));
  });

  test.each(["consent", "exchange", "check-new"])("a failed %s writes nothing and revokes nothing", async (failAt) => {
    const w = makeWorld({ failAt });
    await expect(w.run()).rejects.toMatchObject({ step: failAt });
    expect(w.events).not.toContain("write");
    expect(w.events.some((x) => x.startsWith("revoke"))).toBe(false);
    expect(w.store.get(SECRET_NAME)).toBe(JSON.stringify({ refresh_token: OLD_TOKEN }));
  });

  test("a token without every scope fails check-new", async () => {
    const w = makeWorld({ grantedScopes: "scope-a" });
    await expect(w.run()).rejects.toMatchObject({ step: "check-new" });
    expect(w.events).not.toContain("write");
  });

  test("a failed write revokes nothing", async () => {
    const w = makeWorld({ failAt: "write" });
    await expect(w.run()).rejects.toMatchObject({ step: "write" });
    expect(w.events.some((x) => x.startsWith("revoke"))).toBe(false);
  });

  test.each(["read-back", "check-stored"])("a failed %s restores the old token and revokes nothing", async (failAt) => {
    const w = makeWorld({ failAt });
    await expect(w.run()).rejects.toMatchObject({ step: failAt });
    expect(w.events.some((x) => x.startsWith("revoke"))).toBe(false);
    expect(w.store.get(SECRET_NAME)).toBe(JSON.stringify({ refresh_token: OLD_TOKEN }));
  });

  test("a first consent with no stored token writes and revokes nothing old", async () => {
    const w = makeWorld({ oldStored: false });
    await w.run();
    expect(w.events).toContain("write");
    expect(w.events.some((x) => x.startsWith("revoke"))).toBe(false);
  });

  test("a dry run stops after the check of the new token", async () => {
    const w = makeWorld();
    await w.run({ dryRun: true });
    expect(w.events).toContain("api-read");
    expect(w.events).not.toContain("write");
    expect(w.events.some((x) => x.startsWith("revoke"))).toBe(false);
  });

  test("no logged line holds a token, the client secret or the code", async () => {
    const ok = makeWorld();
    await ok.run();
    const failing = makeWorld({ failAt: "check-stored" });
    await failing.run().catch(() => {});
    for (const line of [...ok.lines, ...failing.lines]) {
      for (const value of [OLD_TOKEN, NEW_TOKEN, CODE, CLIENT_SECRET]) expect(line).not.toContain(value);
    }
  });

  test("the logger hides a value that reaches it inside an error message", () => {
    const lines = [];
    const log = makeLogger(
      (l) => lines.push(l),
      () => new Set([NEW_TOKEN]),
    );
    log(`step x: FAILED boom ${NEW_TOKEN}`);
    expect(lines[0]).not.toContain(NEW_TOKEN);
  });
});

describe("the client secret roll", () => {
  const NEW_CLIENT_RAW = JSON.stringify({
    installed: { client_id: "cid.apps.googleusercontent.com", client_secret: "GOCSPX-brand-new-secret-eeee" },
  });

  function rollWorld({ tokensMint = true } = {}) {
    const events = [];
    const lines = [];
    const store = new Map([
      [CLIENT_NAME, CLIENT_RAW],
      ["t/youtube", JSON.stringify({ refresh_token: OLD_TOKEN })],
      ["t/ads", JSON.stringify({ refresh_token: OLD_TOKEN })],
    ]);
    const specs = {
      clientSecretName: CLIENT_NAME,
      tokens: { youtube: { secretName: "t/youtube" }, ads: { secretName: "t/ads" }, msads: { secretName: "t/msads" } },
    };
    const secrets = {
      async read(name) {
        return store.has(name) ? store.get(name) : null;
      },
      async write(name, value) {
        events.push("write");
        store.set(name, value);
      },
    };
    const fetchImpl = async () => ({
      ok: tokensMint,
      status: tokensMint ? 200 : 400,
      json: async () => (tokensMint ? { access_token: "at", scope: "" } : { error: "invalid_grant" }),
    });
    const known = new Set();
    const log = makeLogger(
      (l) => lines.push(l),
      () => known,
    );
    return {
      events,
      lines,
      store,
      run: (extra = {}) =>
        runClientRoll({
          clientJsonRaw: NEW_CLIENT_RAW,
          specs,
          secrets,
          fetchImpl,
          dryRun: false,
          log,
          remember: (v) => known.add(v),
          ...extra,
        }),
    };
  }

  test("it writes the client and reports each token", async () => {
    const w = rollWorld();
    const result = await w.run();
    expect(w.store.get(CLIENT_NAME)).toBe(NEW_CLIENT_RAW);
    expect(result.outcomes).toEqual({ youtube: "still mints an access token", ads: "still mints an access token", msads: "absent" });
  });

  test("it reports tokens the roll ended", async () => {
    const w = rollWorld({ tokensMint: false });
    const result = await w.run();
    expect(result.outcomes.youtube).toContain("no longer mints");
    expect(w.lines.join("\n")).not.toContain("brand-new-secret");
  });

  test("a dry run reports and writes nothing", async () => {
    const w = rollWorld();
    const result = await w.run({ dryRun: true });
    expect(result.written).toBe(false);
    expect(w.events).not.toContain("write");
  });

  test("a different client id is refused before any write", async () => {
    const w = rollWorld();
    const other = JSON.stringify({ installed: { client_id: "other", client_secret: "GOCSPX-other-secret-ffff" } });
    await expect(w.run({ clientJsonRaw: other })).rejects.toMatchObject({ step: "compare-client-id" });
    expect(w.events).not.toContain("write");
  });
});
