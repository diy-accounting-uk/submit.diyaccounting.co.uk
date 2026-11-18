// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @vitest-environment happy-dom

// app/unit-tests/video/homePageTargets.test.js
//
// Every target a scene script points at while it is on the home page names an element that
// web/public/index.html has, or that the shared header script widgets/page-chrome.js draws on
// every page (the sign-in and about links), so a markup change that removes one fails here and
// not part-way through a recording.

import fs from "fs";
import path from "path";
import { describe, test, expect, beforeAll } from "vitest";

const videosDir = path.resolve("videos");
// Steps that leave the page where it is; any other action may navigate away from the home page.
const STAYS_ON_PAGE = new Set(["point", "caption", "hold", "still", "highlight", "scroll", "await"]);

function homePageTargets(script) {
  const targets = [];
  let onHomePage = false;
  for (const scene of script.scenes || []) {
    for (const step of scene.steps || []) {
      if (step.action === "goto") {
        onHomePage = step.url === "/";
        continue;
      }
      if (onHomePage) {
        for (const key of ["target", "scrollTo"]) if (step[key]) targets.push({ scene: scene.id, key, target: step[key] });
      }
      if (!STAYS_ON_PAGE.has(step.action)) onHomePage = false;
    }
  }
  return targets;
}

const cases = fs
  .readdirSync(videosDir)
  .filter((name) => name.endsWith(".json"))
  .map((name) => ({ name, script: JSON.parse(fs.readFileSync(path.join(videosDir, name), "utf8")) }))
  .filter(({ script }) => Array.isArray(script.scenes) && !script.localApp)
  .flatMap(({ name, script }) => homePageTargets(script).map((t) => [name, t]));

const pageChromeSource = fs.readFileSync(path.resolve("web/public/widgets/page-chrome.js"), "utf8");
let homePage;

// A selector the static page lacks passes when every class and id it names is one page-chrome.js
// writes.
function drawnByPageChrome(selector) {
  const names = [...selector.matchAll(/[.#]([A-Za-z][\w-]*)/g)].map((m) => m[1]);
  return names.length > 0 && names.every((name) => pageChromeSource.includes(name));
}

// index.page.js fills this container with one button per activity, so a selector inside it
// passes when the container is on the page.
const FILLED_AT_RUN_TIME = ["#dynamicActivities"];

function insideFilledContainer(selector) {
  const container = FILLED_AT_RUN_TIME.find((id) => selector.startsWith(`${id} `));
  return Boolean(container) && homePage.querySelector(container) !== null;
}

function found(target) {
  if (typeof target === "string") {
    return homePage.querySelector(target) !== null || drawnByPageChrome(target) || insideFilledContainer(target);
  }
  if (target.role === "heading") {
    return [...homePage.querySelectorAll("h1, h2, h3, h4, h5, h6")].some((h) => h.textContent.trim() === target.name);
  }
  if (target.role === "link") return [...homePage.querySelectorAll("a")].some((a) => a.textContent.trim() === target.name);
  if (target.role === "button") return [...homePage.querySelectorAll("button")].some((b) => b.textContent.trim() === target.name);
  if (target.text) return homePage.body.textContent.includes(target.text);
  throw new Error(`no check for target ${JSON.stringify(target)}`);
}

describe("scene targets on the home page", () => {
  beforeAll(() => {
    // The body alone: the head's stylesheet links make happy-dom try to fetch them.
    const html = fs.readFileSync(path.resolve("web/public/index.html"), "utf8");
    document.body.innerHTML = html.slice(html.indexOf(">", html.indexOf("<body")) + 1, html.lastIndexOf("</body>"));
    homePage = document;
  });

  test("some scene scripts point at the home page", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  test.each(cases)("%s points at an element index.html has: %j", (name, { target }) => {
    expect(found(target)).toBe(true);
  });

  test("a heading or selector the page does not have is not found", () => {
    expect(found({ role: "heading", name: "Activities" })).toBe(false);
    expect(found("#noSuchElement")).toBe(false);
  });
});
