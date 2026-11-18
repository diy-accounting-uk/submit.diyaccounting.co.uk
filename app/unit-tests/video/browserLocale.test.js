// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/video/browserLocale.test.js

import { describe, test, expect } from "vitest";
import { captureBrowserEnv } from "../../../scripts/lib/video/browserLocale.js";

describe("captureBrowserEnv", () => {
  test("gives the browser British English over a US host locale", () => {
    const env = captureBrowserEnv({ LANG: "en_US.UTF-8", LANGUAGE: "en_US", PATH: "/usr/bin" });
    expect(env.LANG).toBe("en_GB.UTF-8");
    expect(env.LANGUAGE).toBe("en_GB");
  });

  test("keeps the rest of the host environment", () => {
    expect(captureBrowserEnv({ PATH: "/usr/bin", HOME: "/home/user" })).toMatchObject({ PATH: "/usr/bin", HOME: "/home/user" });
  });
});
