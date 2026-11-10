// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/login-provider-note.test.js

import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const publicDir = path.resolve(import.meta.dirname, "../public");

describe("Sign-in provider note", () => {
  const html = fs.readFileSync(path.join(publicDir, "auth/login.html"), "utf8").replace(/\s+/g, " ");

  test("login.html says which details the provider shares", () => {
    expect(html).toContain('id="providerAccountNote"');
    expect(html).toContain("Use the account you already have. We receive your email address and name, and nothing else.");
  });

  test("login.html offers Google then Microsoft", () => {
    const google = html.indexOf("Sign in with your Google account");
    const microsoft = html.indexOf("Sign in with your Microsoft account");
    expect(google).toBeGreaterThan(0);
    expect(microsoft).toBeGreaterThan(google);
    expect(html).toContain("../images/microsoft-logo.svg");
  });
});
