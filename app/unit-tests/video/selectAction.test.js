// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/video/selectAction.test.js
//
// The select action picks a listed option the usual way and sets an unlisted value through the
// element's own value property, which a page such as the tax-year select accepts by adding the
// option. A value the element refuses fails the step.

import { describe, test, expect, vi } from "vitest";

vi.mock("../../../scripts/lib/video/overlay.js", () => ({
  rectOf: vi.fn().mockResolvedValue({ left: 0, top: 0, width: 10, height: 10 }),
  pointTo: vi.fn().mockResolvedValue(undefined),
  highlight: vi.fn().mockResolvedValue(undefined),
}));

import { executeAction, SceneStepError } from "../../../scripts/lib/video/actions.js";

function fakeSelect({ options, accepts }) {
  return {
    value: options[0],
    options: options.map((value) => ({ value })),
    dispatched: [],
    dispatchEvent(event) {
      this.dispatched.push({ type: event.type, bubbles: event.bubbles });
    },
    set(next) {
      if (accepts) this.value = next;
    },
  };
}

function pageWithSelect(select) {
  const locator = {
    count: vi.fn().mockResolvedValue(1),
    isVisible: vi.fn().mockResolvedValue(true),
    scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
    selectOption: vi.fn().mockResolvedValue(undefined),
    first() {
      return this;
    },
    evaluate: vi.fn(async (fn, arg) => {
      const element = new Proxy(select, {
        set(target, prop, next) {
          if (prop === "value") target.set(next);
          else target[prop] = next;
          return true;
        },
      });
      globalThis.Event = class {
        constructor(type, init) {
          this.type = type;
          this.bubbles = init?.bubbles;
        }
      };
      return fn(element, arg);
    }),
  };
  return { locator: () => locator, screenshot: vi.fn().mockResolvedValue(undefined), selectLocator: locator };
}

const ctx = { sceneId: "adjustments", stepIndex: 5, stillsDir: "target/videos/test-stills" };
const step = { action: "select", target: "#taxYear", value: "2027-28" };

describe("select action", () => {
  test("uses selectOption when the option is listed", async () => {
    const page = pageWithSelect(fakeSelect({ options: ["2026-27", "2027-28"], accepts: true }));
    await executeAction(page, step, ctx);
    expect(page.selectLocator.selectOption).toHaveBeenCalledWith("2027-28");
  });

  test("sets an unlisted value on the element and announces input and change", async () => {
    const select = fakeSelect({ options: ["2025-26", "2026-27"], accepts: true });
    const page = pageWithSelect(select);
    await executeAction(page, step, ctx);
    expect(page.selectLocator.selectOption).not.toHaveBeenCalled();
    expect(select.value).toBe("2027-28");
    expect(select.dispatched).toEqual([
      { type: "input", bubbles: true },
      { type: "change", bubbles: true },
    ]);
  });

  test("fails with a SceneStepError when the element refuses the value", async () => {
    const page = pageWithSelect(fakeSelect({ options: ["2025-26"], accepts: false }));
    await expect(executeAction(page, step, ctx)).rejects.toBeInstanceOf(SceneStepError);
  });
});
