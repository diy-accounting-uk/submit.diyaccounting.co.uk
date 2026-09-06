// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/scripts/youtubeUpload.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

import {
  ADC_LOGIN_COMMAND,
  DEFAULT_QUOTA_PROJECT,
  parseArgs,
  loadPublishList,
  savePublishList,
  selectPendingUploads,
  recordVideoId,
  buildVideoResource,
  resolveQuotaProject,
  resolveAdcPath,
  getAccessToken,
  fetchOwnChannelTitle,
  uploadVideo,
  uploadCaption,
} from "../../../scripts/youtube-upload.js";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "youtube-upload-test-"));
}

describe("parseArgs", () => {
  test("defaults to unlisted and no check", () => {
    expect(parseArgs([])).toEqual({ publicVideo: false, check: false });
  });
  test("reads --public", () => {
    expect(parseArgs(["--public"])).toEqual({ publicVideo: true, check: false });
  });
  test("reads --check", () => {
    expect(parseArgs(["--check"])).toEqual({ publicVideo: false, check: true });
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

describe("resolveQuotaProject", () => {
  test("defaults to diyaccounting-ga4", () => {
    expect(resolveQuotaProject({})).toBe(DEFAULT_QUOTA_PROJECT);
  });
  test("honours GOOGLE_CLOUD_QUOTA_PROJECT", () => {
    expect(resolveQuotaProject({ GOOGLE_CLOUD_QUOTA_PROJECT: "other-project" })).toBe("other-project");
  });
});

describe("resolveAdcPath", () => {
  test("honours GOOGLE_APPLICATION_CREDENTIALS", () => {
    expect(resolveAdcPath({ GOOGLE_APPLICATION_CREDENTIALS: "/tmp/creds.json", HOME: "/home/x" })).toBe("/tmp/creds.json");
  });
  test("falls back to the gcloud well-known file under HOME", () => {
    expect(resolveAdcPath({ HOME: "/home/x" })).toBe(path.join("/home/x", ".config", "gcloud", "application_default_credentials.json"));
  });
});

describe("getAccessToken", () => {
  let dir;
  beforeEach(() => (dir = makeTempDir()));
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("fails naming the gcloud login command when no ADC file exists", async () => {
    const env = { HOME: dir };
    await expect(getAccessToken({ env })).rejects.toThrow(ADC_LOGIN_COMMAND);
  });

  test("reads the token from a GoogleAuth client built from ADC", async () => {
    const adcPath = path.join(dir, ".config", "gcloud", "application_default_credentials.json");
    fs.mkdirSync(path.dirname(adcPath), { recursive: true });
    fs.writeFileSync(adcPath, JSON.stringify({ type: "authorized_user" }));
    const env = { HOME: dir };
    const getClient = vi.fn().mockResolvedValue({ getAccessToken: vi.fn().mockResolvedValue({ token: "adc-access-token" }) });
    const GoogleAuthImpl = vi.fn(function GoogleAuthImpl() {
      this.getClient = getClient;
    });

    const token = await getAccessToken({ env, GoogleAuthImpl });

    expect(token).toBe("adc-access-token");
    expect(GoogleAuthImpl).toHaveBeenCalledWith({
      scopes: [
        "https://www.googleapis.com/auth/cloud-platform",
        "https://www.googleapis.com/auth/youtube.upload",
        "https://www.googleapis.com/auth/youtube.force-ssl",
      ],
    });
  });

  test("fails naming the gcloud login command when the credential lacks the YouTube scope", async () => {
    const adcPath = path.join(dir, ".config", "gcloud", "application_default_credentials.json");
    fs.mkdirSync(path.dirname(adcPath), { recursive: true });
    fs.writeFileSync(adcPath, JSON.stringify({ type: "authorized_user" }));
    const env = { HOME: dir };
    const getClient = vi.fn().mockResolvedValue({ getAccessToken: vi.fn().mockRejectedValue(new Error("invalid_scope")) });
    const GoogleAuthImpl = vi.fn(function GoogleAuthImpl() {
      this.getClient = getClient;
    });

    await expect(getAccessToken({ env, GoogleAuthImpl })).rejects.toThrow(ADC_LOGIN_COMMAND);
  });
});

describe("fetchOwnChannelTitle", () => {
  test("returns the signed-in channel's title", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [{ snippet: { title: "DIY Accounting Submit" } }] }) });

    const title = await fetchOwnChannelTitle({ accessToken: "token", quotaProject: "diyaccounting-ga4", fetchImpl });

    expect(title).toBe("DIY Accounting Submit");
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toContain("/youtube/v3/channels?part=snippet&mine=true");
    expect(options.headers["x-goog-user-project"]).toBe("diyaccounting-ga4");
    expect(options.headers.Authorization).toBe("Bearer token");
  });

  test("fails loudly when no channel is linked to the account", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });

    await expect(fetchOwnChannelTitle({ accessToken: "token", quotaProject: "diyaccounting-ga4", fetchImpl })).rejects.toThrow(/no YouTube channel/);
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

    const videoId = await uploadVideo({ entry, accessToken: "token", quotaProject: "diyaccounting-ga4", publicVideo: false, fetchImpl });

    expect(videoId).toBe("yt-video-id");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][0]).toBe("https://upload.example/session-1");
    expect(fetchImpl.mock.calls[0][1].headers["x-goog-user-project"]).toBe("diyaccounting-ga4");
  });

  test("fails loudly when the resumable session has no Location header", async () => {
    const videoFile = path.join(dir, "clip.mp4");
    fs.writeFileSync(videoFile, "fake video bytes");
    const entry = { id: "clip", videoFile, title: "t", description: "d", tags: [], categoryId: "27" };
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, headers: new Headers() });

    await expect(uploadVideo({ entry, accessToken: "token", quotaProject: "diyaccounting-ga4", publicVideo: false, fetchImpl })).rejects.toThrow(/Location header/);
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

    const result = await uploadCaption({ entry, videoId: "yt-video-id", accessToken: "token", quotaProject: "diyaccounting-ga4", fetchImpl });

    expect(result).toEqual({ id: "caption-id" });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toContain("/captions?uploadType=multipart");
    expect(options.headers["Content-Type"]).toMatch(/^multipart\/related; boundary=/);
    expect(options.headers["x-goog-user-project"]).toBe("diyaccounting-ga4");
    expect(options.body.toString()).toContain("yt-video-id");
    expect(options.body.toString()).toContain("WEBVTT");
  });
});
