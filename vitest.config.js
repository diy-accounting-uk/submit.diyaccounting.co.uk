// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { defineConfig } from "vitest/config";
import dotenv from "dotenv";
import path from "path";

export default defineConfig(({ mode }) => {
  // Load env files for tests without requiring Vite
  // 1) Base .env
  dotenv.config({ path: path.resolve(process.cwd(), ".env") });
  // 2) Mode-specific .env (e.g., .env.test, .env.ci, .env.prod) if present
  if (mode) {
    dotenv.config({ path: path.resolve(process.cwd(), `.env.${mode}`) });
  }

  // Clear AWS_PROFILE to ensure tests use dummy credentials with local DynamoDB
  // AWS SDK v3 prefers AWS_PROFILE over AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY
  delete process.env.AWS_PROFILE;

  const env = process.env;

  return {
    resolve: {
      alias: {
        "@dist": path.resolve(process.cwd(), "dist"),
        "@app": path.resolve(process.cwd(), "app"),
      },
    },
    test: {
      env,
      environment: "node",
      // Limit workers without CLI flags
      pool: "forks",
      maxWorkers: 1,
      minWorkers: 1,

      // Disable file-level parallelism and concurrent tests
      // fileParallelism: false, // run test files sequentially
      // sequence: { concurrent: false }, // run tests in a file sequentially

      include: ["app/unit-tests/*.test.js", "app/unit-tests/**/*.test.js", "app/system-tests/*.test.js", "web/unit-tests/*.test.js"],
      exclude: [
        "app/bin/*",
        "app/test-helpers/*",
        "app/functions/non-lambda-mocks/*",
        "web/browser-tests/*.test.js",
        "manually-run-tests/*.test.js",
        "behaviour-tests/*.test.js",
        "**/node_modules/**",
        "**/.claude/**",
      ],
      coverage: {
        provider: "v8",
        reportsDirectory: "./coverage",
        reporter: ["text", "json", "html"],
        include: ["app/**/*.js"],
        exclude: [
          "app/bin/*",
          "app/test-helpers/*",
          "app/functions/non-lambda-mocks/*",
          "**/dist/**",
          "**/entrypoint/**",
          "app/unit-tests/*.test.js",
          "app/unit-tests/*/*.test.js",
          "app/system-tests/*.test.js",
          "web/unit-tests/*.test.js",
          "web/browser-tests/*.test.js",
          "manually-run-tests/*.test.js",
          "behaviour-tests/*.test.js",
          "**/node_modules/**",
          "app/index.js",
          "**/exports/**",
        ],
        thresholds: {
          statements: 76,
          branches: 68,
          functions: 86,
          lines: 77,
          perFile: false,
        },
      },
    },
  };
});
