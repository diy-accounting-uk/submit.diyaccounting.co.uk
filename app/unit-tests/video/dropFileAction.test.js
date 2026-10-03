// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/video/dropFileAction.test.js
//
// The dropFile action hands a file from disk to a page: through the file input a drop target
// holds or stands for, or through drag and drop events when it holds none. Runs in a real
// browser against a page served from this file's own HTML.

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { chromium } from "playwright";
import { executeAction, SceneStepError } from "../../../scripts/lib/video/actions.js";
import { installOverlay } from "../../../scripts/lib/video/overlay.js";

const FIXTURE = "app/unit-tests/video/fixtures/dropFileSample.csv";
const FIXTURE_BYTES = 46;

const PAGE_HTML = `<!doctype html><html><body>
  <div id="seen"></div>
  <div id="withInput" style="padding:20px"><input type="file" id="plain"></div>
  <label id="labelled" for="viaLabel" style="display:block;padding:20px">Pick</label>
  <input type="file" id="viaLabel" style="display:none">
  <div id="zone" style="width:200px;height:80px;border:1px solid"></div>
  <script>
    function report(source, file) { document.getElementById("seen").textContent += source + ":" + file.name + ":" + file.size + ";"; }
    for (const id of ["plain", "viaLabel"]) {
      document.getElementById(id).addEventListener("change", (e) => report("input-" + id, e.target.files[0]));
    }
    const zone = document.getElementById("zone");
    zone.addEventListener("dragover", (e) => e.preventDefault());
    zone.addEventListener("drop", (e) => { e.preventDefault(); report("drop", e.dataTransfer.files[0]); });
  </script></body></html>`;

const ctx = { sceneId: "upload", stepIndex: 2, stillsDir: "target/videos/test-stills" };

describe("dropFile action", () => {
  let browser;
  let page;

  beforeAll(async () => {
    browser = await chromium.launch();
  });
  afterAll(async () => {
    await browser.close();
  });

  async function freshPage() {
    page = await browser.newPage();
    await installOverlay(page);
    await page.route("http://dropfile.test/", (route) => route.fulfill({ contentType: "text/html", body: PAGE_HTML }));
    await page.goto("http://dropfile.test/");
    return page;
  }
  const seen = () => page.locator("#seen").textContent();

  test("sets the file on the input inside the target", async () => {
    await freshPage();
    await executeAction(page, { action: "dropFile", target: "#withInput", file: FIXTURE, name: "march.csv" }, ctx);
    expect(await seen()).toBe(`input-plain:march.csv:${FIXTURE_BYTES};`);
  });

  test("sets the file on the control a label points at", async () => {
    await freshPage();
    await executeAction(page, { action: "dropFile", target: "#labelled", file: FIXTURE }, ctx);
    expect(await seen()).toBe(`input-viaLabel:dropFileSample.csv:${FIXTURE_BYTES};`);
  });

  test("dispatches a drop when the target has no file input", async () => {
    await freshPage();
    await executeAction(page, { action: "dropFile", target: "#zone", file: FIXTURE, name: "march.csv" }, ctx);
    expect(await seen()).toBe(`drop:march.csv:${FIXTURE_BYTES};`);
  });

  test("fails naming the file when it does not exist", async () => {
    await freshPage();
    await expect(executeAction(page, { action: "dropFile", target: "#zone", file: "no/such/file.csv" }, ctx)).rejects.toBeInstanceOf(
      SceneStepError,
    );
  });
});
