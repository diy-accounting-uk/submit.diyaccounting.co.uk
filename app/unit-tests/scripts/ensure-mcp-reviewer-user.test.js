// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/ensure-mcp-reviewer-user.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { Secret } from "otpauth";

import {
  REVIEWER_GROUP,
  REVIEWER_USERNAME,
  SAMPLE_BOOKS,
  ensureUser,
  saveSampleBooks,
  secretNames,
} from "../../../scripts/ensure-mcp-reviewer-user.js";

const PASSWORD = "Reviewer-Password-Value-7";
const NEW_SEED = Secret.fromUTF8("12345678901234567890").base32;
const STORED_SEED = Secret.fromUTF8("abcdefghijklmnopqrst").base32;
const names = secretNames("ci");

function fakeCognito({ exists = false, devices = [] } = {}) {
  const calls = [];
  let userExists = exists;
  let deviceList = [...devices];
  const send = vi.fn(async (command) => {
    const name = command.constructor.name;
    calls.push(name);
    switch (name) {
      case "AdminCreateUserCommand":
        if (userExists) throw Object.assign(new Error("exists"), { name: "UsernameExistsException" });
        userExists = true;
        return {};
      case "AdminDeleteUserCommand":
        userExists = false;
        deviceList = [];
        return {};
      case "AdminGetUserCommand":
        return { UserMFASettingList: deviceList };
      case "AdminInitiateAuthCommand":
        return { ChallengeName: "MFA_SETUP", Session: "setup-session" };
      case "AssociateSoftwareTokenCommand":
        return { SecretCode: NEW_SEED, Session: "associate-session" };
      case "VerifySoftwareTokenCommand":
        return { Status: "SUCCESS", Session: "verified-session" };
      case "AdminRespondToAuthChallengeCommand":
        return { AuthenticationResult: { AccessToken: "enrol-access-token" } };
      case "AdminSetUserMFAPreferenceCommand":
        deviceList = ["SOFTWARE_TOKEN_MFA"];
        return {};
      default:
        return {};
    }
  });
  return { send, calls };
}

function fakeSecrets(initial) {
  const store = new Map(Object.entries(initial));
  const send = vi.fn(async (command) => {
    const name = command.constructor.name;
    const id = command.input.SecretId ?? command.input.Name;
    if (name === "GetSecretValueCommand") {
      if (!store.has(id)) throw Object.assign(new Error("none"), { name: "ResourceNotFoundException" });
      return { SecretString: store.get(id) };
    }
    if (name === "PutSecretValueCommand") {
      if (!store.has(id)) throw Object.assign(new Error("none"), { name: "ResourceNotFoundException" });
      store.set(id, command.input.SecretString);
      return {};
    }
    if (name === "CreateSecretCommand") {
      store.set(id, command.input.SecretString);
      return {};
    }
    throw new Error(`unexpected ${name}`);
  });
  return { send, store };
}

const run = (cognito, secrets, signIn, logs) =>
  ensureUser({
    cognito,
    secrets,
    userPoolId: "eu-west-2_pool",
    userPoolClientId: "mcp-client",
    environmentName: "ci",
    signIn,
    now: Date.UTC(2026, 10, 13, 9, 0, 0),
    log: (line) => logs.push(line),
  });

describe("ensureUser", () => {
  test("creates the user, adds the group, enrols one device and stores its seed", async () => {
    const cognito = fakeCognito();
    const secrets = fakeSecrets({ [names.password]: PASSWORD });
    const signIn = vi.fn();
    const result = await run(cognito, secrets, signIn, []);

    expect(result).toEqual({ userCreated: true, deviceEnrolled: true, accessToken: "enrol-access-token" });
    expect(signIn).not.toHaveBeenCalled();
    const create = cognito.send.mock.calls.map(([c]) => c).find((c) => c.constructor.name === "AdminCreateUserCommand");
    expect(create.input).toMatchObject({ Username: REVIEWER_USERNAME, MessageAction: "SUPPRESS" });
    const group = cognito.send.mock.calls.map(([c]) => c).find((c) => c.constructor.name === "AdminAddUserToGroupCommand");
    expect(group.input).toMatchObject({ GroupName: REVIEWER_GROUP, Username: REVIEWER_USERNAME });
    const password = cognito.send.mock.calls.map(([c]) => c).find((c) => c.constructor.name === "AdminSetUserPasswordCommand");
    expect(password.input).toMatchObject({ Password: PASSWORD, Permanent: true });
    expect(secrets.store.get(names.totpSeed)).toBe(NEW_SEED);
    expect(cognito.calls.filter((name) => name === "AssociateSoftwareTokenCommand")).toHaveLength(1);
  });

  test("changes nothing but the password and group when the user, device and seed exist", async () => {
    const cognito = fakeCognito({ exists: true, devices: ["SOFTWARE_TOKEN_MFA"] });
    const secrets = fakeSecrets({ [names.password]: PASSWORD, [names.totpSeed]: STORED_SEED });
    const signIn = vi.fn(async () => ({ AccessToken: "sign-in-access-token" }));
    const result = await run(cognito, secrets, signIn, []);

    expect(result).toEqual({ userCreated: false, deviceEnrolled: false, accessToken: "sign-in-access-token" });
    expect(signIn).toHaveBeenCalledWith({ password: PASSWORD });
    for (const unwanted of ["AssociateSoftwareTokenCommand", "VerifySoftwareTokenCommand", "AdminDeleteUserCommand"]) {
      expect(cognito.calls).not.toContain(unwanted);
    }
    expect(secrets.store.get(names.totpSeed)).toBe(STORED_SEED);
    expect(secrets.send.mock.calls.map(([c]) => c.constructor.name)).not.toContain("PutSecretValueCommand");
  });

  test("a second run after the first enrols no second device", async () => {
    const cognito = fakeCognito();
    const secrets = fakeSecrets({ [names.password]: PASSWORD });
    await run(cognito, secrets, vi.fn(), []);
    const again = await run(
      cognito,
      secrets,
      vi.fn(async () => ({ AccessToken: "t" })),
      [],
    );
    expect(again.deviceEnrolled).toBe(false);
    expect(cognito.calls.filter((name) => name === "AssociateSoftwareTokenCommand")).toHaveLength(1);
    expect(cognito.calls.filter((name) => name === "AdminDeleteUserCommand")).toHaveLength(0);
  });

  test("deletes and creates the user again when it has a device and no stored seed", async () => {
    const cognito = fakeCognito({ exists: true, devices: ["SOFTWARE_TOKEN_MFA"] });
    const secrets = fakeSecrets({ [names.password]: PASSWORD });
    const result = await run(cognito, secrets, vi.fn(), []);
    expect(cognito.calls.filter((name) => name === "AdminDeleteUserCommand")).toHaveLength(1);
    expect(result.deviceEnrolled).toBe(true);
    expect(secrets.store.get(names.totpSeed)).toBe(NEW_SEED);
  });

  test("refuses a missing password secret", async () => {
    await expect(run(fakeCognito(), fakeSecrets({}), vi.fn(), [])).rejects.toThrow(/reviewer-password/);
  });

  test("writes no password, seed or token to any log line", async () => {
    const logs = [];
    const spies = ["log", "info", "warn", "error"].map((level) => vi.spyOn(console, level).mockImplementation(() => {}));
    try {
      await run(fakeCognito(), fakeSecrets({ [names.password]: PASSWORD }), vi.fn(), logs);
      const written = JSON.stringify([logs, ...spies.map((spy) => spy.mock.calls)]);
      for (const secret of [PASSWORD, NEW_SEED, STORED_SEED, "enrol-access-token", "setup-session", "verified-session"]) {
        expect(written).not.toContain(secret);
      }
      expect(logs.length).toBeGreaterThan(0);
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });
});

describe("saveSampleBooks", () => {
  let puts;
  let stored;

  beforeEach(() => {
    process.env.DIYA_SUBMIT_BASE_URL = "https://ci-submit.example.test/";
    puts = [];
    stored = new Map();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init = {}) => {
        const path = new URL(url).pathname;
        if (init.method === "PUT") {
          const bookId = path.split("/").pop();
          puts.push({ bookId, ifMatch: init.headers["if-match"], authorization: init.headers.Authorization });
          const etag = `etag-${puts.length}`;
          stored.set(bookId, { bookId, latestETag: etag });
          return { ok: true, status: 200, json: async () => ({ metadata: { latestETag: etag } }) };
        }
        return { ok: true, status: 200, json: async () => ({ entitlement: {}, books: [...stored.values()] }) };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.DIYA_SUBMIT_BASE_URL;
  });

  test("saves the two fixture books, then replaces the same two with their etags", async () => {
    const first = await saveSampleBooks({ accessToken: "tok", log: () => {} });
    expect(first).toEqual(SAMPLE_BOOKS.map((book) => book.bookId));
    expect(puts.map((put) => put.ifMatch)).toEqual([undefined, undefined]);

    await saveSampleBooks({ accessToken: "tok", log: () => {} });
    expect(puts.slice(2).map((put) => put.bookId)).toEqual(SAMPLE_BOOKS.map((book) => book.bookId));
    expect(puts.slice(2).every((put) => put.ifMatch)).toBe(true);
    expect(stored.size).toBe(2);
    expect(puts.every((put) => put.authorization === "Bearer tok")).toBe(true);
  }, 60000);
});

describe("mcp-reviewer-seed workflow", () => {
  const workflow = load(readFileSync("./.github/workflows/mcp-reviewer-seed.yml", "utf8"));

  test("runs weekly and on dispatch for one environment, on a pinned runner", () => {
    expect(workflow.on.schedule).toHaveLength(1);
    expect(workflow.on.workflow_dispatch.inputs.environment.options).toEqual(["ci", "prod"]);
    expect(workflow.jobs.seed["runs-on"]).toBe("ubuntu-24.04");
    expect(workflow.jobs.seed.permissions["id-token"]).toBe("write");
  });

  test("runs the script for the matrix environment under pipefail", () => {
    const step = workflow.jobs.seed.steps.find((candidate) => /ensure-mcp-reviewer-user\.js/.test(candidate.run ?? ""));
    expect(step.run).toContain("set -euo pipefail");
    expect(step.run).toContain('ensure-mcp-reviewer-user.js "${ENVIRONMENT_NAME}"');
  });
});
