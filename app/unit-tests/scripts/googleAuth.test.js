// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect, afterEach } from "vitest";
import { assertFederatedCredentials, createGoogleAuthClient } from "../../../scripts/lib/googleAuth.js";

const SAVED = { ...process.env };

afterEach(() => {
  for (const key of ["GOOGLE_APPLICATION_CREDENTIALS"]) {
    if (SAVED[key] === undefined) delete process.env[key];
    else process.env[key] = SAVED[key];
  }
});

describe("assertFederatedCredentials", () => {
  it("passes once application default credentials exist", () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/federated.json";
    expect(() => assertFederatedCredentials()).not.toThrow();
  });
  it("throws when the auth action has not run", () => {
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    expect(() => assertFederatedCredentials()).toThrow(/GOOGLE_APPLICATION_CREDENTIALS is not set/);
  });
});

describe("createGoogleAuthClient", () => {
  it("builds from application default credentials", () => {
    const auth = createGoogleAuthClient(["https://www.googleapis.com/auth/cloud-platform"]);
    expect(auth.jsonContent).toBeNull();
  });
});
