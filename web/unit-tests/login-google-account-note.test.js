// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/login-google-account-note.test.js

import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const publicDir = path.resolve(import.meta.dirname, "../public");

describe("Google account note", () => {
  test.each(["auth/login.html", "bundles.html"])("%s says any Google account works and links to sign-up", (file) => {
    const html = fs.readFileSync(path.join(publicDir, file), "utf8").replace(/\s+/g, " ");
    expect(html.toLowerCase()).toContain("any google account works");
    expect(html).toContain("including one made with your own email address");
    expect(html).toContain("https://accounts.google.com/signup");
  });
});
