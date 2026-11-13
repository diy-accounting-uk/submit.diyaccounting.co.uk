// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// plugin.test.js -- the plugin folder names the hosted connector and its skill calls only tools that prod serves.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { hostedToolNames } from "../lib/hosted-tools.js";

const read = (relativePath) => readFileSync(new URL(`../../plugins/diya-submit/${relativePath}`, import.meta.url), "utf8");
const serverJson = JSON.parse(readFileSync(new URL("../server.json", import.meta.url), "utf8"));

describe("the diya-submit plugin", () => {
  it("names the plugin in lowercase words joined by hyphens and carries the directory's fields", () => {
    const manifest = JSON.parse(read(".claude-plugin/plugin.json"));
    expect(manifest.name).toMatch(/^[a-z]+(-[a-z]+)*$/);
    for (const field of ["displayName", "version", "description", "author", "license"]) expect(manifest[field]).toBeTruthy();
  });

  it("points its connector at the hosted endpoint the registry entry lists", () => {
    const { mcpServers } = JSON.parse(read(".mcp.json"));
    expect(Object.values(mcpServers)).toEqual([{ type: "http", url: serverJson.remotes[0].url }]);
  });

  it("names its skill after its folder and calls only tools the prod connector serves", () => {
    const skill = read("skills/file-a-uk-vat-return/SKILL.md");
    expect(skill).toMatch(/^---\nname: file-a-uk-vat-return\ndescription: .+\n---\n/);
    const called = [...skill.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)].map((match) => match[1]);
    expect(called.length).toBeGreaterThan(0);
    const prod = hostedToolNames("prod");
    for (const name of called) expect(prod, name).toContain(name);
  });
});
