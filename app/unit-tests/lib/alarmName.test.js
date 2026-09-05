// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, test, expect } from "vitest";
import { resolveAlarmEnv, alarmFamilyKey } from "@app/lib/alarmName.js";

describe("resolveAlarmEnv", () => {
  test("extracts ci from a ci-prefixed name", () => {
    expect(resolveAlarmEnv("ci-claudeboa-app-hmrc-stack-health", "unknown")).toBe("ci");
  });

  test("extracts prod from a prod-prefixed name", () => {
    expect(resolveAlarmEnv("prod-env-salt-secret-unexpected-read", "unknown")).toBe("prod");
  });

  test("falls back when the name has no ci/prod prefix", () => {
    expect(resolveAlarmEnv("docs-something", "unknown")).toBe("unknown");
  });
});

describe("alarmFamilyKey", () => {
  test("drops the deployment slug from a deployment-scoped app alarm", () => {
    expect(alarmFamilyKey("prod-a0f41c7-app-api-5xx")).toBe("prod-app-api-5xx");
  });

  test("drops a word-slug deployment name from a stack-health alarm", () => {
    expect(alarmFamilyKey("ci-claudeboa-app-hmrc-stack-health")).toBe("ci-app-hmrc-stack-health");
  });

  test("drops the deployment slug regardless of which check fired", () => {
    expect(alarmFamilyKey("prod-9050bb5-app-cognito-token-post-health")).toBe("prod-app-cognito-token-post-health");
  });

  test("leaves an environment-scoped alarm name unchanged", () => {
    expect(alarmFamilyKey("prod-env-salt-secret-unexpected-read")).toBe("prod-env-salt-secret-unexpected-read");
  });

  test("leaves an already family-shaped name unchanged", () => {
    expect(alarmFamilyKey("ci-app-health-failed")).toBe("ci-app-health-failed");
  });
});
