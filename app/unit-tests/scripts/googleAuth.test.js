// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect, afterEach } from "vitest";
import {
  googleAuthMode,
  resolveServiceAccountCredentialsJson,
  createGoogleAuthClient,
  AUTH_MODES,
} from "../../../scripts/lib/googleAuth.js";

const SAVED = { ...process.env };

afterEach(() => {
  for (const key of ["GOOGLE_AUTH_MODE", "GOOGLE_APPLICATION_CREDENTIALS", "TEST_GA4_JSON", "TEST_GA4_ARN"]) {
    if (SAVED[key] === undefined) delete process.env[key];
    else process.env[key] = SAVED[key];
  }
});

describe("googleAuthMode", () => {
  it("defaults to the stored key", () => {
    expect(googleAuthMode({})).toBe("key");
  });
  it("reads federated from GOOGLE_AUTH_MODE", () => {
    expect(googleAuthMode({ GOOGLE_AUTH_MODE: "federated" })).toBe("federated");
  });
  it("refuses any other value", () => {
    expect(() => googleAuthMode({ GOOGLE_AUTH_MODE: "magic" })).toThrow(/GOOGLE_AUTH_MODE must be one of key, federated/);
    expect(AUTH_MODES).toEqual(["key", "federated"]);
  });
});

describe("resolveServiceAccountCredentialsJson", () => {
  it("answers the raw JSON env var in key mode", async () => {
    delete process.env.GOOGLE_AUTH_MODE;
    process.env.TEST_GA4_JSON = '{"type":"service_account"}';
    await expect(resolveServiceAccountCredentialsJson({ jsonEnvVar: "TEST_GA4_JSON", arnEnvVar: "TEST_GA4_ARN" })).resolves.toBe(
      '{"type":"service_account"}',
    );
  });
  it("throws in key mode when neither env var is set", async () => {
    delete process.env.GOOGLE_AUTH_MODE;
    delete process.env.TEST_GA4_JSON;
    delete process.env.TEST_GA4_ARN;
    await expect(resolveServiceAccountCredentialsJson({ jsonEnvVar: "TEST_GA4_JSON", arnEnvVar: "TEST_GA4_ARN" })).rejects.toThrow(
      /Neither TEST_GA4_JSON nor TEST_GA4_ARN/,
    );
  });
  it("answers null in federated mode once application default credentials exist", async () => {
    process.env.GOOGLE_AUTH_MODE = "federated";
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/federated.json";
    process.env.TEST_GA4_JSON = '{"type":"service_account"}';
    await expect(resolveServiceAccountCredentialsJson({ jsonEnvVar: "TEST_GA4_JSON", arnEnvVar: "TEST_GA4_ARN" })).resolves.toBeNull();
  });
  it("throws in federated mode when the auth action has not run", async () => {
    process.env.GOOGLE_AUTH_MODE = "federated";
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    await expect(resolveServiceAccountCredentialsJson({ jsonEnvVar: "TEST_GA4_JSON", arnEnvVar: "TEST_GA4_ARN" })).rejects.toThrow(
      /GOOGLE_APPLICATION_CREDENTIALS is not set/,
    );
  });
});

describe("createGoogleAuthClient", () => {
  it("builds from application default credentials when the JSON is null", () => {
    const auth = createGoogleAuthClient(null, ["https://www.googleapis.com/auth/cloud-platform"]);
    expect(auth.jsonContent).toBeNull();
  });
  it("builds from the key when the JSON is given", () => {
    const auth = createGoogleAuthClient(
      JSON.stringify({ type: "service_account", client_email: "sa@example.iam.gserviceaccount.com", private_key: "x" }),
    );
    expect(auth.jsonContent.client_email).toBe("sa@example.iam.gserviceaccount.com");
  });
});
