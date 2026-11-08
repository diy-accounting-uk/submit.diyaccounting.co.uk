// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/emailHashRotate.test.js

import { describe, test, expect } from "vitest";

import { planNextVersion, buildRotatedRegistry } from "../../../scripts/email-hash-rotate.js";

describe("planNextVersion", () => {
  test("reads a raw secret string as version v1 and plans v2", () => {
    const { registry, nextVersion } = planNextVersion("raw-secret-value");
    expect(registry).toEqual({ current: "v1", versions: { v1: "raw-secret-value" } });
    expect(nextVersion).toBe("v2");
  });

  test("reads a registry and plans one past the highest version", () => {
    const raw = JSON.stringify({ current: "v3", versions: { v1: "a", v3: "c" } });
    const { registry, nextVersion } = planNextVersion(raw);
    expect(registry.current).toBe("v3");
    expect(nextVersion).toBe("v4");
  });

  test("rejects a registry whose current version has no secret", () => {
    expect(() => planNextVersion(JSON.stringify({ current: "v2", versions: { v1: "a" } }))).toThrow(/missing required fields/);
  });
});

describe("buildRotatedRegistry", () => {
  test("keeps the legacy raw secret as v1 beside the new current version", () => {
    const { registry, nextVersion } = planNextVersion("raw-secret-value");
    expect(buildRotatedRegistry(registry, nextVersion, "new")).toEqual({
      current: "v2",
      versions: { v1: "raw-secret-value", v2: "new" },
    });
  });
});
