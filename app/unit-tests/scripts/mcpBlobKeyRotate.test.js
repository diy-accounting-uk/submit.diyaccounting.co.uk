// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/mcpBlobKeyRotate.test.js

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { signBlob, verifyBlob } from "@app/lib/mcpOauthBlob.js";
import { sealFor, openFor, HMRC_GRANT_PURPOSE, KEY_REFRESH_LOG_MESSAGE } from "@app/lib/codesSeal.js";
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

const {
  planNextVersion,
  buildRotatedRegistry,
  parseArgs,
  main,
  proveRefresh,
  assertProofAllowed,
  isRefreshEvidence,
  parseLogLine,
  grantIdFromCreated,
} = await import("../../../scripts/mcp-blob-key-rotate.js");

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

  describe("--prove-refresh", () => {
    it("implies apply", () => {
      expect(parseArgs(["--prove-refresh"])).toEqual({ apply: true, proveRefresh: true });
    });

    it("refuses every environment but ci", () => {
      expect(() => assertProofAllowed("prod")).toThrow(/ci only/);
      expect(() => assertProofAllowed("ci")).not.toThrow();
    });

    it("main refuses prod before it reads the secret", async () => {
      send.mockReset();
      process.env.ENVIRONMENT_NAME = "prod";
      await expect(main(["--prove-refresh"])).rejects.toThrow(/ci only/);
      expect(send).not.toHaveBeenCalled();
      delete process.env.ENVIRONMENT_NAME;
    });

    it("matches a refresh line only for the versions under test", () => {
      const line = {
        message: KEY_REFRESH_LOG_MESSAGE,
        purpose: HMRC_GRANT_PURPOSE,
        sealedVersion: "v2",
        cachedCurrent: "v1",
        refreshedCurrent: "v2",
        keysChanged: true,
      };
      const expected = { sealedVersion: "v2", cachedCurrent: "v1" };
      expect(isRefreshEvidence(line, expected)).toBe(true);
      expect(isRefreshEvidence({ ...line, keysChanged: false }, expected)).toBe(false);
      expect(isRefreshEvidence({ ...line, sealedVersion: "v3" }, expected)).toBe(false);
      expect(isRefreshEvidence(null, expected)).toBe(false);
      expect(parseLogLine("not json")).toBeNull();
    });

    describe("grantIdFromCreated", () => {
      it("reads the grant id from the top level of a 201 body", () => {
        const body = {
          grantId: "g1",
          url: "https://hmrc.example",
          expiresAt: "2026-01-01T00:00:00.000Z",
          scope: "read:vat",
          hmrcAccount: "synthetic",
        };
        expect(grantIdFromCreated({ status: 201, body })).toBe("g1");
      });

      it("names the status when it is not 201", () => {
        expect(() => grantIdFromCreated({ status: 403, body: { message: "no" } })).toThrow(/answered 403, expected 201/);
      });

      it("names the top-level keys, never a value, when a 201 body has no grant id", () => {
        const failure = () => grantIdFromCreated({ status: 201, body: { data: { grantId: "secret-value" }, message: "m" } });
        expect(failure).toThrow(/201 with no grantId.*data, message/);
        expect(failure).not.toThrow(/secret-value/);
      });
    });

    describe("sequence", () => {
      let clock;
      let order;
      let steps;

      beforeEach(() => {
        clock = 1_000_000;
        order = [];
        let current = "v1";
        steps = {
          createGrant: async () => "grant-1",
          seal: async () => `${current}.iv.tag.text`,
          place: async (_grantId, sealed) => order.push(`place ${sealed.split(".")[0]}`),
          read: async () => {
            order.push("read");
            return { status: 200 };
          },
          roll: async () => {
            order.push("roll");
            current = "v2";
          },
          findEvidence: async () => ({ logGroupName: "group" }),
          remove: async (grantId) => order.push(`remove ${grantId}`),
          sleep: async (ms) => {
            order.push("sleep");
            clock += ms;
          },
          now: () => clock,
        };
      });

      it("reads, rolls, waits past the forced-read floor, places the new version, reads again and removes the grant", async () => {
        const result = await proveRefresh(steps);
        expect(order).toEqual(["place v1", "read", "roll", "sleep", "place v2", "read", "remove grant-1"]);
        expect(result).toMatchObject({ grantId: "grant-1", cachedCurrent: "v1", sealedVersion: "v2" });
      });

      it("removes the grant and fails when the log has no refresh line", async () => {
        steps.findEvidence = async () => null;
        await expect(proveRefresh(steps)).rejects.toThrow(/No ".*" line/);
        expect(order.at(-1)).toBe("remove grant-1");
      });

      it("fails when the second read is not 200", async () => {
        let reads = 0;
        steps.read = async () => ({ status: ++reads === 1 ? 200 : 404 });
        await expect(proveRefresh(steps)).rejects.toThrow(/second grant read answered 404/);
        expect(order.at(-1)).toBe("remove grant-1");
      });

      it("fails when the roll leaves the same current version", async () => {
        steps.roll = async () => order.push("roll");
        await expect(proveRefresh(steps)).rejects.toThrow(/left the current version/);
      });

      it("fails when the cache would expire before the second read", async () => {
        steps.roll = async () => {
          clock += 5 * 60 * 1000;
        };
        await expect(proveRefresh(steps)).rejects.toThrow(/cache would have expired/);
      });
    });
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
