// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/video/fastForward.test.js

import { describe, test, expect } from "vitest";
import { isFastForward } from "../../../scripts/lib/video/fastForward.js";

describe("isFastForward", () => {
  test("is false for a scene and step that set nothing", () => {
    expect(isFastForward({ id: "home" }, { action: "click" }, null)).toBe(false);
  });

  test("is true for every step of a scene marked fastForward", () => {
    const scene = { id: "sign-in", fastForward: true };
    expect(isFastForward(scene, { action: "click" }, null)).toBe(true);
    expect(isFastForward(scene, { action: "login" }, null)).toBe(true);
  });

  test("is true for a step marked fastForward inside a scene that is not", () => {
    const scene = { id: "business-picker" };
    expect(isFastForward(scene, { action: "hmrcAuthorise", fastForward: true }, null)).toBe(true);
    expect(isFastForward(scene, { action: "click" }, null)).toBe(false);
  });

  test("is false when fastForward is set to anything but true", () => {
    expect(isFastForward({ id: "a", fastForward: false }, { action: "click", fastForward: false }, null)).toBe(false);
  });

  test("is true for a scene outside the scenes a run selected", () => {
    const selected = new Set(["results"]);
    expect(isFastForward({ id: "home" }, { action: "goto" }, selected)).toBe(true);
    expect(isFastForward({ id: "results" }, { action: "await" }, selected)).toBe(false);
  });
});
