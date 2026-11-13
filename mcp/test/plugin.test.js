// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// plugin.test.js -- the plugin folder names the hosted connector and its skill calls only tools that prod serves.

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { hostedToolNames } from "../lib/hosted-tools.js";
import { buildPluginZip, packageEntries } from "../../scripts/build-chatgpt-plugin.mjs";

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

const chatgptRead = (relativePath) => readFileSync(new URL(`../../plugins/diya-submit-chatgpt/${relativePath}`, import.meta.url), "utf8");
const siteFile = (url) => new URL(`../../web/public${new URL(url).pathname}`, import.meta.url);

describe("the diya-submit ChatGPT plugin package", () => {
  const manifest = JSON.parse(chatgptRead("plugin.json"));
  const listing = manifest.extensions["com.openai"].interface;

  it("meets the package limits for the name, version, description and author", () => {
    expect(manifest.name).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
    expect(manifest.name.length).toBeLessThanOrEqual(64);
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.description.length).toBeLessThanOrEqual(1024);
    expect(manifest.author.name.length).toBeLessThanOrEqual(120);
    expect(manifest.author.url).toMatch(/^https:\/\//);
  });

  it("meets the listing limits and carries the four HTTPS pages that a site file backs", () => {
    expect(listing.displayName.length).toBeLessThanOrEqual(30);
    expect(listing.shortDescription.length).toBeLessThanOrEqual(30);
    expect(listing.longDescription.length).toBeLessThanOrEqual(4000);
    expect(listing.developerName.length).toBeLessThanOrEqual(80);
    expect(listing.capabilities.length).toBeLessThanOrEqual(20);
    for (const capability of listing.capabilities) expect(capability.length).toBeLessThanOrEqual(120);
    expect(listing.defaultPrompt.length).toBeLessThanOrEqual(3);
    for (const prompt of listing.defaultPrompt) expect(prompt.length).toBeLessThanOrEqual(128);
    for (const field of ["websiteURL", "supportURL", "privacyPolicyURL", "termsOfServiceURL"]) {
      expect(listing[field], field).toMatch(/^https:\/\/submit\.diyaccounting\.co\.uk\//);
      expect(listing[field].length).toBeLessThanOrEqual(1024);
      const path = siteFile(listing[field]);
      const file = path.pathname.endsWith("/") ? new URL("index.html", path) : path;
      expect(existsSync(file), listing[field]).toBe(true);
    }
  });

  it("publishes to GB only and shows no price, plan or checkout", () => {
    expect(manifest.publication.countries).toEqual(["GB"]);
    const text = JSON.stringify(manifest).toLowerCase();
    for (const word of ["checkout", "subscribe", "free trial", "discount", "£"]) expect(text, word).not.toContain(word);
  });

  it("points its logo and composer icon at a file in the package", () => {
    for (const field of ["logo", "composerIcon"]) {
      expect(listing[field]).toMatch(/^\.\/assets\//);
      expect(existsSync(new URL(`../../plugins/diya-submit-chatgpt/${listing[field]}`, import.meta.url))).toBe(true);
    }
  });

  it("names the one hosted MCP server the registry entry lists", () => {
    const { mcpServers } = JSON.parse(chatgptRead("mcp.json"));
    expect(Object.values(mcpServers)).toHaveLength(1);
    expect(Object.values(mcpServers)[0].url).toBe(serverJson.remotes[0].url);
  });

  it("calls in its skill only the six tools prod serves and all of them", () => {
    const skill = chatgptRead("skills/file-a-uk-vat-return/SKILL.md");
    const called = new Set([...skill.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)].map((match) => match[1]));
    expect([...called].sort()).toEqual([...hostedToolNames("prod")].sort());
  });

  it("holds five positive and three negative review test cases", () => {
    const cases = JSON.parse(chatgptRead("review/test-cases.json"));
    expect(cases.positive).toHaveLength(5);
    expect(cases.negative).toHaveLength(3);
    const prod = hostedToolNames("prod");
    for (const positive of cases.positive) {
      for (const field of ["scenario", "prompt", "expectedResult"]) expect(positive[field]).toBeTruthy();
      for (const tool of positive.expectedTools) expect(prod, tool).toContain(tool);
    }
    for (const negative of cases.negative) for (const field of ["prompt", "reason", "expectedResult"]) expect(negative[field]).toBeTruthy();
  });

  it("builds the same ZIP twice and leaves out the README and the review folder", () => {
    expect(packageEntries()).toEqual(["LICENSE", "assets/logo.png", "mcp.json", "plugin.json", "skills/file-a-uk-vat-return/SKILL.md"]);
    expect(buildPluginZip().equals(buildPluginZip())).toBe(true);
  });
});
