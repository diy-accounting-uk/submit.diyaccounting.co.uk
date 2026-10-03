// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/system/**/*.system.test.js"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
