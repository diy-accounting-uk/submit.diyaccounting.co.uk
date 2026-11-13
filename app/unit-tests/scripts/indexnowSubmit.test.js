// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { commitOfDeployment, findKeyFile, indexNowUrlList } from "../../../scripts/indexnow-submit.mjs";

const SITEMAP = `<urlset>
  <url><loc>https://submit.diyaccounting.co.uk/</loc></url>
  <url><loc>https://submit.diyaccounting.co.uk/about.html</loc></url>
  <url><loc>https://submit.diyaccounting.co.uk/guide/index.html</loc></url>
</urlset>`;

describe("indexNowUrlList", () => {
  it("lists the sitemap URLs whose page file changed", () => {
    const list = indexNowUrlList(SITEMAP, ["web/public/about.html", "web/public/guide/index.html", "web/public/other.css"]);
    expect(list).toEqual(["https://submit.diyaccounting.co.uk/about.html", "https://submit.diyaccounting.co.uk/guide/index.html"]);
  });

  it("maps the root URL to index.html", () => {
    expect(indexNowUrlList(SITEMAP, ["web/public/index.html"])).toEqual(["https://submit.diyaccounting.co.uk/"]);
  });

  it("ignores files outside web/public and pages the sitemap does not list", () => {
    expect(indexNowUrlList(SITEMAP, ["app/lib/x.js", "web/public/unlisted.html"])).toEqual([]);
  });

  it("answers an empty list for no changes", () => {
    expect(indexNowUrlList(SITEMAP, [])).toEqual([]);
  });
});

describe("commitOfDeployment", () => {
  it("takes the text after the last dash", () => {
    expect(commitOfDeployment("prod-1a2b3c4")).toBe("1a2b3c4");
    expect(commitOfDeployment("ci-my-branch-1a2b3c4")).toBe("1a2b3c4");
  });

  it("answers an empty string for an empty name or a name with no dash", () => {
    expect(commitOfDeployment("")).toBe("");
    expect(commitOfDeployment("prod")).toBe("");
  });
});

describe("the IndexNow key file", () => {
  it("is the only key file in web/public and holds its own name", () => {
    const keyFiles = readdirSync("web/public").filter((name) => /^[0-9a-f]{32}\.txt$/.test(name));
    expect(keyFiles).toHaveLength(1);
    expect(readFileSync(`web/public/${keyFiles[0]}`, "utf8")).toBe(keyFiles[0].replace(/\.txt$/, ""));
    expect(findKeyFile("web/public")?.fileName).toBe(keyFiles[0]);
  });
});
