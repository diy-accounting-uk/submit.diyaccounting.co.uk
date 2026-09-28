// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/video/videoCoverage.test.js
//
// Every activity the catalogue lists for prod needs a scene script under videos/*.json whose
// declared pages cover it — or a reasoned entry in videoCoverageAllowList.js. A prod-listed
// activity with neither fails here, named, instead of the gap staying invisible until a
// customer notices there is no video for it. A scene script that exists but carries no
// videoId yet (recorded, not uploaded) is reported as pending, not passed silently and not
// failed either: this batch itself adds several, and the operator uploads them later.

import fs from "node:fs";
import path from "node:path";
import { describe, test, expect } from "vitest";
import { loadCatalogFromRoot, isActivityListedInEnvironment } from "@app/services/productCatalog.js";
import { VIDEO_COVERAGE_ALLOW_LIST } from "../../../scripts/lib/video/videoCoverageAllowList.js";

const videosDir = path.resolve(process.cwd(), "videos");
const repoRoot = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const sceneScripts = fs
  .readdirSync(videosDir)
  .filter((file) => file.endsWith(".json") && !file.endsWith(".schema.json") && file !== "publish.json")
  .map((file) => file.replace(/\.json$/, ""))
  .map((name) => ({ name, script: readJson(path.join(videosDir, `${name}.json`)) }));

const publishList = readJson(path.join(videosDir, "publish.json"));
const publishById = new Map(publishList.videos.map((entry) => [entry.id, entry]));

// A scene script "covers" an activity when one of its declared pages is one of the activity's
// own .html paths — the only evidence a script's own JSON carries of which activity it
// demonstrates, since a click on a {role, name} or CSS target names no page of its own.
function scriptsCoveringActivity(activity) {
  const activityPages = (activity.paths || []).filter((p) => p.endsWith(".html")).map((p) => `web/public/${p}`);
  if (activityPages.length === 0) return [];
  return sceneScripts.filter(({ script }) => script.pages.some((page) => activityPages.includes(page)));
}

const catalog = loadCatalogFromRoot();
const prodActivities = (catalog.activities || []).filter((activity) => isActivityListedInEnvironment(activity, "prod"));

describe("every allow-list entry names a real reason", () => {
  test.each(Object.entries(VIDEO_COVERAGE_ALLOW_LIST))("%s", (activityId, reason) => {
    expect(typeof reason).toBe("string");
    expect(reason.length).toBeGreaterThan(0);
  });
});

describe("every prod-listed activity has a scene script, or a reasoned allow-list entry", () => {
  test.each(prodActivities.map((activity) => activity.id))("%s", (activityId) => {
    if (VIDEO_COVERAGE_ALLOW_LIST[activityId]) return;
    const activity = prodActivities.find((a) => a.id === activityId);
    const covering = scriptsCoveringActivity(activity);
    expect(
      covering.length,
      `"${activityId}" has no scene script (videos/*.json) whose pages cover one of ${JSON.stringify(activity.paths)}; ` +
        `add one or add "${activityId}" to VIDEO_COVERAGE_ALLOW_LIST with a reason`,
    ).toBeGreaterThan(0);
  });
});

describe("every video a covering scene script names is published, or reported pending", () => {
  const pendingByActivity = [];
  for (const activity of prodActivities) {
    if (VIDEO_COVERAGE_ALLOW_LIST[activity.id]) continue;
    for (const { name } of scriptsCoveringActivity(activity)) {
      const entry = publishById.get(name);
      const published = !!entry && entry.publish === true && !!entry.videoId;
      if (!published) pendingByActivity.push({ activityId: activity.id, script: name });
    }
  }

  test("names every scene script recorded for a prod activity but not yet uploaded", () => {
    if (pendingByActivity.length > 0) {
      console.log(
        `pending videoId (recorded scene script, not yet uploaded): ` +
          pendingByActivity.map((p) => `${p.script} (${p.activityId})`).join(", "),
      );
    }
    // Never expected to go red on its own: it exists to print the pending list every run
    // rather than let "no videoId yet" pass without a trace. A hard failure belongs to the
    // "has a scene script" check above, not to whether it has been uploaded yet.
    expect(Array.isArray(pendingByActivity)).toBe(true);
  });
});

describe("every published entry renders on its group's page", () => {
  const widgetSource = fs.readFileSync(path.join(repoRoot, "web/public/widgets/video-pages.js"), "utf8");
  const areaPagesBlock = widgetSource.match(/const AREA_PAGES = \{([\s\S]*?)\};/)[1];

  test("the shared widget's manifest filter keys on videoId, the field the checks above rely on", () => {
    expect(widgetSource).toMatch(/filter\(\s*\(v\)\s*=>\s*v\s*&&\s*v\.videoId\s*\)/);
  });

  const publishedGroups = [...new Set(publishList.videos.filter((v) => v.videoId).map((v) => v.group))];

  test.each(publishedGroups)('published group "%s" has an area page the widget renders it on', (group) => {
    const match = areaPagesBlock.match(new RegExp(`"${group}":\\s*"([^"]+)"`));
    expect(match, `AREA_PAGES in web/public/widgets/video-pages.js has no entry for group "${group}"`).not.toBeNull();
    expect(fs.existsSync(path.join(repoRoot, "web/public", match[1]))).toBe(true);
  });
});
