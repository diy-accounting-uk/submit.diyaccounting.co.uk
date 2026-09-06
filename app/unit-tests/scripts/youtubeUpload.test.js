// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/scripts/youtubeUpload.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

import {
  parseArgs,
  loadPublishList,
  savePublishList,
  selectPendingUploads,
  recordVideoId,
  buildVideoResource,
  requireEnv,
  buildConsentUrl,
  extractAuthorizationCode,
  ensureAccessToken,
  uploadVideo,
  uploadCaption,
} from "../../../scripts/youtube-upload.js";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "youtube-upload-test-"));
}

describe("parseArgs", () => {
  test("defaults to unlisted", () => {
    expect(parseArgs([])).toEqual({ publicVideo: false });
  });
  test("reads --public", () => {
    expect(parseArgs(["--public"])).toEqual({ publicVideo: true });
  });
});

describe("loadPublishList", () => {
  let dir;
  beforeEach(() => (dir = makeTempDir()));
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("throws when the file is missing", () => {
    expect(() => loadPublishList(path.join(dir, "missing.json"))).toThrow(/not found/);
  });

  test("throws when the file has no videos array", () => {
    const filePath = path.join(dir, "publish.json");
    fs.writeFileSync(filePath, JSON.stringify({ videos: "nope" }));
    expect(() => loadPublishList(filePath)).toThrow(/"videos" array/);
  });

  test("parses a well-formed publish list", () => {
    const filePath = path.join(dir, "publish.json");
    const list = { videos: [{ id: "a", publish: true }] };
    fs.writeFileSync(filePath, JSON.stringify(list));
    expect(loadPublishList(filePath)).toEqual(list);
  });
});

describe("savePublishList", () => {
  test("round-trips through loadPublishList", () => {
    const dir = makeTempDir();
    try {
      const filePath = path.join(dir, "publish.json");
      const list = { videos: [{ id: "a", publish: true, videoId: null }] };
      savePublishList(list, filePath);
      expect(loadPublishList(filePath)).toEqual(list);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("selectPendingUploads (the idempotency guard)", () => {
  test("selects only publish:true entries with no videoId yet", () => {
    const list = {
      videos: [
        { id: "already-uploaded", publish: true, videoId: "abc123" },
        { id: "not-for-publishing", publish: false, videoId: null },
        { id: "ready", publish: true, videoId: null },
        { id: "also-ready", publish: true },
      ],
    };
    expect(selectPendingUploads(list).map((entry) => entry.id)).toEqual(["ready", "also-ready"]);
  });

  test("selects nothing once every publish:true entry has a videoId", () => {
    const list = { videos: [{ id: "a", publish: true, videoId: "abc" }, { id: "b", publish: false }] };
    expect(selectPendingUploads(list)).toEqual([]);
  });
});

describe("recordVideoId", () => {
  test("sets the videoId on the matching entry only, without mutating the input", () => {
    const list = { videos: [{ id: "a", publish: true, videoId: null }, { id: "b", publish: true, videoId: null }] };
    const next = recordVideoId(list, "a", "xyz789");
    expect(next.videos).toEqual([{ id: "a", publish: true, videoId: "xyz789" }, { id: "b", publish: true, videoId: null }]);
    expect(list.videos[0].videoId).toBeNull();
  });
});

describe("buildVideoResource", () => {
  const entry = { title: "A title", description: "A description", tags: ["a", "b"], categoryId: "27" };

  test("defaults to unlisted", () => {
    expect(buildVideoResource(entry, { publicVideo: false }).status.privacyStatus).toBe("unlisted");
  });

  test("uses public when asked", () => {
    expect(buildVideoResource(entry, { publicVideo: true }).status.privacyStatus).toBe("public");
  });

  test("carries the title, description, tags and category into the snippet", () => {
    const resource = buildVideoResource(entry, { publicVideo: false });
    expect(resource.snippet).toEqual({ title: "A title", description: "A description", tags: ["a", "b"], categoryId: "27" });
  });
});

describe("requireEnv", () => {
  test("throws when the variable is missing", () => {
    expect(() => requireEnv("YOUTUBE_CLIENT_ID", {})).toThrow(/YOUTUBE_CLIENT_ID/);
  });
  test("returns the value when present", () => {
    expect(requireEnv("YOUTUBE_CLIENT_ID", { YOUTUBE_CLIENT_ID: "abc" })).toBe("abc");
  });
});

describe("buildConsentUrl", () => {
  test("carries the client id and the upload scope", () => {
    const url = new URL(buildConsentUrl("my-client-id"));
    expect(url.searchParams.get("client_id")).toBe("my-client-id");
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/youtube.upload");
    expect(url.searchParams.get("access_type")).toBe("offline");
  });
});

describe("extractAuthorizationCode", () => {
  test("pulls the code out of a pasted redirect URL", () => {
    expect(extractAuthorizationCode("http://127.0.0.1:8912/oauth2callback?code=4/abc-123&scope=x")).toBe("4/abc-123");
  });
  test("treats a bare pasted value as the code itself", () => {
    expect(extractAuthorizationCode("  4/abc-123  ")).toBe("4/abc-123");
  });
});

describe("ensureAccessToken", () => {
  let dir;
  beforeEach(() => (dir = makeTempDir()));
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("refreshes silently when a token is already stored", async () => {
    const tokenPath = path.join(dir, "youtube-token.json");
    fs.writeFileSync(tokenPath, JSON.stringify({ refreshToken: "stored-refresh-token" }));
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: "fresh-access-token" }) });
    const prompt = vi.fn();

    const accessToken = await ensureAccessToken({ clientId: "id", clientSecret: "secret", tokenPath, fetchImpl, prompt });

    expect(accessToken).toBe("fresh-access-token");
    expect(prompt).not.toHaveBeenCalled();
    const [, options] = fetchImpl.mock.calls[0];
    expect(options.body.get("refresh_token")).toBe("stored-refresh-token");
    expect(options.body.get("grant_type")).toBe("refresh_token");
  });

  test("runs the consent flow and stores the refresh token when nothing is stored yet", async () => {
    const tokenPath = path.join(dir, "youtube-token.json");
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: "first-access-token", refresh_token: "first-refresh-token" }) });
    const prompt = vi.fn().mockResolvedValue("pasted-code");

    const accessToken = await ensureAccessToken({ clientId: "id", clientSecret: "secret", tokenPath, fetchImpl, prompt });

    expect(accessToken).toBe("first-access-token");
    expect(prompt).toHaveBeenCalledOnce();
    expect(JSON.parse(fs.readFileSync(tokenPath, "utf8"))).toEqual({ refreshToken: "first-refresh-token" });
  });

  test("fails loudly when Google returns no refresh token on first consent", async () => {
    const tokenPath = path.join(dir, "youtube-token.json");
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: "only-access-token" }) });
    const prompt = vi.fn().mockResolvedValue("pasted-code");

    await expect(ensureAccessToken({ clientId: "id", clientSecret: "secret", tokenPath, fetchImpl, prompt })).rejects.toThrow(/refresh token/);
  });
});

describe("uploadVideo", () => {
  let dir;
  beforeEach(() => (dir = makeTempDir()));
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("starts a resumable upload then PUTs the file bytes, returning the video id", async () => {
    const videoFile = path.join(dir, "clip.mp4");
    fs.writeFileSync(videoFile, "fake video bytes");
    const entry = { id: "clip", videoFile, title: "t", description: "d", tags: [], categoryId: "27" };

    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, headers: new Headers({ location: "https://upload.example/session-1" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "yt-video-id" }) });

    const videoId = await uploadVideo({ entry, accessToken: "token", publicVideo: false, fetchImpl });

    expect(videoId).toBe("yt-video-id");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][0]).toBe("https://upload.example/session-1");
  });

  test("fails loudly when the resumable session has no Location header", async () => {
    const videoFile = path.join(dir, "clip.mp4");
    fs.writeFileSync(videoFile, "fake video bytes");
    const entry = { id: "clip", videoFile, title: "t", description: "d", tags: [], categoryId: "27" };
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, headers: new Headers() });

    await expect(uploadVideo({ entry, accessToken: "token", publicVideo: false, fetchImpl })).rejects.toThrow(/Location header/);
  });
});

describe("uploadCaption", () => {
  let dir;
  beforeEach(() => (dir = makeTempDir()));
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("posts a multipart/related body carrying the caption file", async () => {
    const captionFile = path.join(dir, "clip.vtt");
    fs.writeFileSync(captionFile, "WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.000\nHello.\n");
    const entry = { id: "clip", captionFile };
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "caption-id" }) });

    const result = await uploadCaption({ entry, videoId: "yt-video-id", accessToken: "token", fetchImpl });

    expect(result).toEqual({ id: "caption-id" });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toContain("/captions?uploadType=multipart");
    expect(options.headers["Content-Type"]).toMatch(/^multipart\/related; boundary=/);
    expect(options.body.toString()).toContain("yt-video-id");
    expect(options.body.toString()).toContain("WEBVTT");
  });
});
