// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { COGNITO_CALLBACK_HOST } from "@app/lib/cognitoCallbackHosts.js";

describe("cognitoCallbackHosts", () => {
  it("holds the same host pattern as the browser's auth-url-builder", () => {
    const source = readFileSync(new URL("../../../web/public/lib/auth-url-builder.js", import.meta.url), "utf-8");
    const browserPattern = source.match(/const COGNITO_CALLBACK_HOST = (\/.*\/);/)[1];
    expect(COGNITO_CALLBACK_HOST.toString()).toBe(browserPattern);
  });
});
