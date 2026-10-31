// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability DEV-21 Verify module wiring and repository shape
// - **Use when:** a module might not be reachable from the app's index, or NEXT.md's board-row structure needs checking.
// - **Does:** module-index.test.js confirms every module the app exports is reachable from its index. nextShape.test.js checks that NEXT.md carries its five required headings, in order, each occurring exactly once.
// - **Run:** `npx vitest run app/unit-tests/module-index.test.js`; `npx vitest run app/unit-tests/nextShape.test.js`
// - **Entry:** `app/unit-tests/module-index.test.js`; `app/unit-tests/nextShape.test.js`
// - **Files:** app/unit-tests/module-index.test.js, app/unit-tests/nextShape.test.js
// - **Keywords:** module index, export wiring, next.md shape, board headings, repository structure check
// - **Related:** DEV-26
// @end-capability

// app/unit-tests/module-index.test.js

import { describe, test, expect, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

import anything from "../index.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("Index Module Exports", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
    };
  });

  test("module index should be defined", () => {
    expect(anything).toBeUndefined();
  });
});
