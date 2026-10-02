// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/video/collaboraSheet.test.js
//
// The pure parts of the Collabora sheet scene actions: how a scene script's cell name becomes
// Collabora's reference, which zoom steps exist, and that a sheetType step sends its characters
// and key over the document socket and never through the page keyboard.

import { describe, test, expect, vi } from "vitest";

vi.mock("../../../scripts/lib/video/overlay.js", () => ({
  pointTo: vi.fn(async () => {}),
  highlight: vi.fn(async () => {}),
  typeChar: vi.fn(async () => {}),
}));

import { libreOfficeReference, zoomStepFor } from "../../../scripts/lib/video/collabora.js";
import { groupFor } from "../../../scripts/lib/video/pacing.js";
import { validateScript } from "../../../scripts/lib/video/scriptSchema.js";
import { executeAction } from "../../../scripts/lib/video/actions.js";
import * as overlay from "../../../scripts/lib/video/overlay.js";
import fs from "fs";

describe("libreOfficeReference", () => {
  test("a one-word sheet name takes a leading dollar", () => {
    expect(libreOfficeReference("SalesApr!A4")).toBe("$SalesApr.A4");
  });

  test("a sheet name with spaces and an ampersand is quoted", () => {
    expect(libreOfficeReference("Profit & Loss Acc!C24")).toBe("$'Profit & Loss Acc'.C24");
  });

  test("a quote inside a sheet name is doubled", () => {
    expect(libreOfficeReference("Sam's sheet!B2")).toBe("$'Sam''s sheet'.B2");
  });

  test("a reference without a sheet fails", () => {
    expect(() => libreOfficeReference("A4")).toThrow(/needs a sheet and a cell/);
  });

  test("a reference whose cell is not a cell fails", () => {
    expect(() => libreOfficeReference("SalesApr!total")).toThrow(/no cell like A4/);
  });
});

describe("zoomStepFor", () => {
  test("100 percent is step 10 and 150 percent is step 12", () => {
    expect(zoomStepFor(100)).toBe(10);
    expect(zoomStepFor(150)).toBe(12);
  });

  test("a percentage Collabora does not offer fails", () => {
    expect(() => zoomStepFor(130)).toThrow(/no 130% zoom/);
  });
});

describe("sheet actions in the scene script", () => {
  test("the sheet actions are paced like a click, or not at all when they only set up", () => {
    expect(groupFor("sheetCell")).toBe(2);
    expect(groupFor("sheetType")).toBe(2);
    expect(groupFor("sheetPoint")).toBe(2);
    expect(groupFor("sheetPrepare")).toBeNull();
    expect(groupFor("sheetZoom")).toBeNull();
  });

  test("the accounting spreadsheet script validates", () => {
    const script = JSON.parse(fs.readFileSync("videos/accounting-spreadsheet-profit.json", "utf8"));
    expect(() => validateScript(script)).not.toThrow();
  });
});

describe("sheetType", () => {
  function fakePage() {
    const sent = [];
    return {
      sent,
      keyboard: { type: vi.fn(), press: vi.fn() },
      waitForTimeout: vi.fn(async () => {}),
      evaluate: vi.fn(async (fn, arg) => {
        globalThis.window = { app: { socket: { sendMessage: (m) => sent.push(m) }, calc: {} } };
        try {
          const source = fn.toString();
          if (source.includes("cellCursorRectangle")) return { left: 10, top: 20, width: 100, height: 20 };
          return fn(arg);
        } finally {
          delete globalThis.window;
        }
      }),
    };
  }
  const ctx = { sceneId: "april", stepIndex: 1, values: {}, now: new Date(), pacing: { perCharMs: 0 }, onTargetRect: null };

  test("types each character and the key through the document socket", async () => {
    const page = fakePage();
    await executeAction(page, { action: "sheetType", text: "a/b", then: "Tab" }, ctx);
    const text = page.sent.filter((m) => m.startsWith("textinput")).map((m) => decodeURIComponent(m.split("text=")[1]));
    expect(text).toEqual(["a", "/", "b"]);
    expect(page.sent.filter((m) => m.startsWith("key type=input"))).toEqual(["key type=input char=9 key=1282"]);
    expect(page.keyboard.type).not.toHaveBeenCalled();
    expect(page.keyboard.press).not.toHaveBeenCalled();
  });

  test("empty text presses the key alone", async () => {
    const page = fakePage();
    await executeAction(page, { action: "sheetType", text: "", then: "Enter" }, ctx);
    expect(page.sent.filter((m) => m.startsWith("textinput"))).toEqual([]);
    expect(page.sent.filter((m) => m.startsWith("key type=input"))).toEqual(["key type=input char=13 key=1280"]);
  });

  test("points the overlay at the middle of the cell", async () => {
    const page = fakePage();
    await executeAction(page, { action: "sheetType", text: "", then: "Tab" }, ctx);
    expect(overlay.pointTo).toHaveBeenCalledWith(page, 60, 30);
  });
});
