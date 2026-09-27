// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/video/localApp.test.js

import { describe, test, expect } from "vitest";
import { startLocalApp } from "../../../scripts/lib/video/localApp.js";

describe("startLocalApp", () => {
  test("resolves once the command's own output matches readyPattern, and url is the config's own", async () => {
    const app = await startLocalApp({
      command: "sleep 0.2; echo before; echo READY-NOW; sleep 5",
      url: "http://127.0.0.1:9999",
      readyPattern: "READY-NOW",
    });
    expect(app.url).toBe("http://127.0.0.1:9999");
    await app.stop();
  });

  test("rejects when the command exits before matching readyPattern", async () => {
    await expect(
      startLocalApp({
        command: "echo not-ready-yet",
        url: "http://127.0.0.1:9999",
        readyPattern: "NEVER-PRINTED",
      }),
    ).rejects.toThrow(/exited before becoming ready/);
  });

  test("rejects after readyTimeoutMs when the command never matches readyPattern", async () => {
    await expect(
      startLocalApp({
        command: "sleep 5",
        url: "http://127.0.0.1:9999",
        readyPattern: "NEVER-PRINTED",
        readyTimeoutMs: 200,
      }),
    ).rejects.toThrow(/did not match readyPattern/);
  });

  test("stop() is safe to call on an app whose process already exited", async () => {
    const app = await startLocalApp({
      command: "echo READY-NOW",
      url: "http://127.0.0.1:9999",
      readyPattern: "READY-NOW",
    });
    // Give the already-matched process time to exit on its own before stop() runs.
    await new Promise((resolve) => setTimeout(resolve, 200));
    await expect(app.stop()).resolves.toBeUndefined();
  });
});
