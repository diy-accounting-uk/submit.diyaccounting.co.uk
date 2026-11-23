// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import fs from "node:fs";
import TOML from "@iarna/toml";
import { describe, it, expect } from "vitest";
import {
  captureOverlayConfig,
  unlistedNavTabSelectors,
  SHOWN_SIGN_IN_ADDRESS,
  TEST_EQUIPMENT_SELECTORS,
} from "../../../scripts/lib/video/captureOverlayConfig.js";

describe("captureOverlayConfig", () => {
  const activities = [
    { id: "practice", environments: ["local", "ci"] },
    { id: "submit-vat", environments: ["local", "ci", "prod"] },
    { id: "unrestricted" },
  ];

  it("selects the navigation tab of each activity that production does not list", () => {
    expect(unlistedNavTabSelectors(activities)).toEqual(['.main-nav a[data-activity="practice"]']);
  });

  it("keeps the scene file's own suppress list and adds the tabs", () => {
    const config = captureOverlayConfig({ suppress: ["#syntheticIndicator"] }, { activities }, null);
    expect(config.suppress).toEqual(["#syntheticIndicator", '.main-nav a[data-activity="practice"]']);
    expect(config.replaceText).toBeUndefined();
  });

  it("carries the script's chapter position", () => {
    expect(captureOverlayConfig({ chapterPosition: "top-center" }, { activities }, null).chapterPosition).toBe("top-center");
    expect(captureOverlayConfig({}, { activities }, null).chapterPosition).toBeUndefined();
  });

  it("conceals the developer mode toggle in every capture, whatever the scene file suppresses", () => {
    expect(TEST_EQUIPMENT_SELECTORS).toContain(".developer-mode-toggle");
    expect(captureOverlayConfig({}, { activities }, null).conceal).toEqual(TEST_EQUIPMENT_SELECTORS);
    expect(captureOverlayConfig({ suppress: ["#syntheticIndicator"] }, { activities }, "user").conceal).toContain(".developer-mode-toggle");
  });

  it("swaps the sign-in address for one example address", () => {
    const config = captureOverlayConfig({}, { activities }, "synthetic-video-capture@test.diyaccounting.co.uk");
    expect(config.replaceText).toEqual({ from: "synthetic-video-capture@test.diyaccounting.co.uk", to: SHOWN_SIGN_IN_ADDRESS });
  });

  it("hides the Practice tab with the real catalogue", () => {
    const catalog = TOML.parse(fs.readFileSync("web/public/submit.catalogue.toml", "utf8"));
    expect(captureOverlayConfig({}, catalog, null).suppress).toContain('.main-nav a[data-activity="practice"]');
  });

  it("shows the sign-in address of a person of the simulator's register", () => {
    expect(SHOWN_SIGN_IN_ADDRESS).toBe("eleanor.bramwell@test.diyaccounting.co.uk");
  });
});
