// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/mcpBlobKeyRotate.test.js

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { signBlob, verifyBlob } from "@app/lib/mcpOauthBlob.js";
import { sealFor, openFor, HMRC_GRANT_PURPOSE } from "@app/lib/codesSeal.js";
import { resetSecretCache } from "@app/lib/cachedSecret.js";
import { parseBlobKeyRegistry } from "@app/lib/mcpBlobKey.js";

const send = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: class {
    send = send;
  },
  GetSecretValueCommand: class {
    constructor(input) {
      this.input = input;
      this.kind = "get";
    }
  },
  UpdateSecretCommand: class {
    constructor(input) {
      this.input = input;
      this.kind = "update";
    }
  },
  TagResourceCommand: class {
    constructor(input) {
      this.input = input;
      this.kind = "tag";
    }
  },
}));

const { planNextVersion, buildRotatedRegistry, parseArgs, main } = await import("../../../scripts/mcp-blob-key-rotate.js");

const RAW = "r".repeat(64);
const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);

describe("mcp-blob-key-rotate", () => {
  describe("planNextVersion", () => {
    it("reads a raw value as v1 and plans v2", () => {
      const { registry, nextVersion } = planNextVersion(RAW);
      expect(registry).toEqual({ current: "v1", versions: { v1: RAW } });
      expect(nextVersion).toBe("v2");
    });

    it("plans one past the highest version", () => {
      const stored = JSON.stringify({ current: "v3", versions: { v1: RAW, v3: "c".repeat(64) } });
      expect(planNextVersion(stored).nextVersion).toBe("v4");
    });

    it("refuses a malformed registry", () => {
      expect(() => planNextVersion(JSON.stringify({ current: "v9", versions: { v1: RAW } }))).toThrow(/malformed/);
    });
  });

  it("keeps every earlier version and makes the new one current", () => {
    const rotated = buildRotatedRegistry({ current: "v1", versions: { v1: RAW } }, "v2", "n".repeat(64));
    expect(rotated).toEqual({ current: "v2", versions: { v1: RAW, v2: "n".repeat(64) } });
  });

  it("rejects an unknown argument", () => {
    expect(() => parseArgs(["--force"])).toThrow(/Unknown argument/);
  });

  describe("main", () => {
    beforeEach(() => {
      send.mockReset();
      process.env.ENVIRONMENT_NAME = "ci";
      vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
      delete process.env.ENVIRONMENT_NAME;
      vi.restoreAllMocks();
    });

    it("plans by default: it reads and writes nothing", async () => {
      send.mockResolvedValue({ SecretString: RAW });
      await main([]);
      expect(send.mock.calls.map(([command]) => command.kind)).toEqual(["get"]);
      expect(send.mock.calls[0][0].input).toEqual({ SecretId: "ci/submit/mcp/oauth-blob-key" });
    });

    it("never prints a key", async () => {
      send.mockResolvedValue({ SecretString: RAW });
      await main(["--apply"]);
      const printed = console.log.mock.calls.flat().join("\n");
      expect(printed).not.toContain(RAW);
      const written = JSON.parse(send.mock.calls.find(([command]) => command.kind === "update")[0].input.SecretString);
      expect(printed).not.toContain(written.versions.v2);
    });

    it("on apply writes a registry that keeps the raw value as v1 and tags the secret", async () => {
      send.mockResolvedValue({ SecretString: RAW });
      await main(["--apply"]);
      expect(send.mock.calls.map(([command]) => command.kind)).toEqual(["get", "update", "tag"]);
      const written = JSON.parse(send.mock.calls[1][0].input.SecretString);
      expect(written.current).toBe("v2");
      expect(written.versions.v1).toBe(RAW);
      expect(written.versions.v2).toHaveLength(64);
      expect(send.mock.calls[2][0].input.Tags[0].Key).toBe("rotated-at");
    });

    it("needs ENVIRONMENT_NAME", async () => {
      delete process.env.ENVIRONMENT_NAME;
      await expect(main([])).rejects.toThrow(/ENVIRONMENT_NAME/);
    });
  });

  describe("across a roll", () => {
    const BOUND = "11111111-2222-4333-8444-555555555555";
    const TOKENS = { accessToken: "a", refreshToken: "r" };

    afterEach(() => {
      delete process.env.MCP_OAUTH_BLOB_KEY;
      resetSecretCache();
    });

    it("opens what the raw key made, signs under the new version, and still opens both", async () => {
      const before = parseBlobKeyRegistry(RAW);
      const blobBefore = signBlob({ a: 1 }, before, { typ: "code", ttlSeconds: 600, now: NOW });
      process.env.MCP_OAUTH_BLOB_KEY = RAW;
      const sealedBefore = await sealFor(HMRC_GRANT_PURPOSE, TOKENS, BOUND);

      const after = buildRotatedRegistry(planNextVersion(RAW).registry, "v2", "n".repeat(64));
      process.env.MCP_OAUTH_BLOB_KEY = JSON.stringify(after);
      const blobAfter = signBlob({ a: 2 }, after, { typ: "code", ttlSeconds: 600, now: NOW });
      const sealedAfter = await sealFor(HMRC_GRANT_PURPOSE, TOKENS, BOUND);

      expect(verifyBlob(blobBefore, after, "code", { now: NOW })).toEqual({ ok: true, fields: { a: 1 } });
      expect(verifyBlob(blobAfter, after, "code", { now: NOW })).toEqual({ ok: true, fields: { a: 2 } });
      expect(sealedBefore.startsWith("v1.")).toBe(true);
      expect(sealedAfter.startsWith("v2.")).toBe(true);
      expect(await openFor(HMRC_GRANT_PURPOSE, sealedBefore, BOUND)).toEqual(TOKENS);
      expect(await openFor(HMRC_GRANT_PURPOSE, sealedAfter, BOUND)).toEqual(TOKENS);
    });
  });
});
