// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { readFileSync } from "node:fs";

import Ajv from "ajv";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

import { hostedToolNames } from "../lib/hosted-tools.js";

const readJson = (relativePath) => JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));

const serverJson = readJson("../server.json");
const packageJson = readJson("../package.json");
const schema = readJson("./fixtures/server.schema.json");

describe("server.json for the MCP registry", () => {
  it("validates against the registry schema", () => {
    const ajv = new Ajv({ strict: false, allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    expect(validate(serverJson), JSON.stringify(validate.errors)).toBe(true);
  });

  it("names the same server as the package's mcpName", () => {
    expect(serverJson.name).toBe(packageJson.mcpName);
  });

  it("carries the package version on the server and on the npm package entry", () => {
    expect(serverJson.version).toBe(packageJson.version);
    const [npmPackage] = serverJson.packages;
    expect(npmPackage.registryType).toBe("npm");
    expect(npmPackage.identifier).toBe(packageJson.name);
    expect(npmPackage.version).toBe(packageJson.version);
  });

  it("offers the hosted endpoint over streamable HTTP and the package over stdio", () => {
    expect(serverJson.remotes).toEqual([{ type: "streamable-http", url: "https://submit.diyaccounting.co.uk/mcp" }]);
    expect(serverJson.packages[0].transport).toEqual({ type: "stdio" });
  });

  it("describes the prod hosted tool set and no filing tool", () => {
    expect(hostedToolNames("prod")).toEqual(["list_books", "open_book", "derive_vat_return", "get_vat_receipt", "list_vat_receipts"]);
    expect(serverJson.description).toMatch(/VAT/);
    expect(serverJson.description).toMatch(/Files no return/);
  });
});
