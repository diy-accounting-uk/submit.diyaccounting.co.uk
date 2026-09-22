// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/youtubeUpload.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

import {
  CLIENT_SECRET_NAME,
  REFRESH_TOKEN_SECRET_NAME,
  DEFAULT_QUOTA_PROJECT,
  CHANNEL_HANDLE,
  parseConfig,
  parseArgs,
  loadPublishList,
  savePublishList,
  selectPendingUploads,
  recordVideoId,
  buildVideoResource,
  resolveQuotaProject,
  resolveClientCredentials,
  storeClientCredentials,
  obtainAccessToken,
  fetchOwnChannel,
  assertChannelHandleMatches,
  normalizeChannelHandle,
  channelHandlesMatch,
  uploadVideo,
  uploadCaption,
  publishEntry,
  CAPTION_RETRY_DELAYS_MS,
  selectUploadedVideos,
  setVideoPrivacy,
} from "../../../scripts/youtube-upload.js";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "youtube-upload-test-"));
}

function notFound() {
  return Object.assign(new Error("not found"), { name: "ResourceNotFoundException" });
}

function fakeSmClient() {
  return { send: vi.fn() };
}

describe("parseArgs", () => {
  test("defaults to unlisted, no check, no client file or store", () => {
    expect(parseArgs([])).toEqual({ publicVideo: false, check: false, clientFile: undefined, storeClient: undefined });
  });
  test("reads --public", () => {
    expect(parseArgs(["--public"]).publicVideo).toBe(true);
  });
  test("reads --check", () => {
    expect(parseArgs(["--check"]).check).toBe(true);
  });
  test("reads --client-file with its path", () => {
    expect(parseArgs(["--client-file", "/tmp/client.json"]).clientFile).toBe("/tmp/client.json");
  });
  test("reads --store-client with its path", () => {
    expect(parseArgs(["--store-client", "/tmp/client.json"]).storeClient).toBe("/tmp/client.json");
  });
  test("fails when --client-file has no path argument", () => {
    expect(() => parseArgs(["--client-file"])).toThrow(/--client-file requires a path argument/);
  });
  test("fails when --store-client has no path argument", () => {
    expect(() => parseArgs(["--store-client"])).toThrow(/--store-client requires a path argument/);
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
    const list = {
      videos: [
        { id: "a", publish: true, videoId: "abc" },
        { id: "b", publish: false },
      ],
    };
    expect(selectPendingUploads(list)).toEqual([]);
  });
});

describe("recordVideoId", () => {
  test("sets the videoId on the matching entry only, without mutating the input", () => {
    const list = {
      videos: [
        { id: "a", publish: true, videoId: null },
        { id: "b", publish: true, videoId: null },
      ],
    };
    const next = recordVideoId(list, "a", "xyz789");
    expect(next.videos).toEqual([
      { id: "a", publish: true, videoId: "xyz789" },
      { id: "b", publish: true, videoId: null },
    ]);
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

const CLIENT_JSON = JSON.stringify({
  installed: { client_id: "client-123", client_secret: "shh", auth_uri: "https://accounts.google.com/o/oauth2/auth" },
});

describe("resolveClientCredentials", () => {
  let dir;
  beforeEach(() => (dir = makeTempDir()));
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("reads client id and secret from --client-file", async () => {
    const filePath = path.join(dir, "client.json");
    fs.writeFileSync(filePath, CLIENT_JSON);

    const credentials = await resolveClientCredentials({ clientFile: filePath });

    expect(credentials).toEqual({ client_id: "client-123", client_secret: "shh" });
  });

  test("fails naming the expected shape when the file doesn't have an installed client", async () => {
    const filePath = path.join(dir, "client.json");
    fs.writeFileSync(filePath, JSON.stringify({ web: {} }));

    await expect(resolveClientCredentials({ clientFile: filePath })).rejects.toThrow(/"installed"/);
  });

  test("reads client id and secret from Secrets Manager when no file is given", async () => {
    const smClient = fakeSmClient();
    smClient.send.mockResolvedValueOnce({ SecretString: CLIENT_JSON });

    const credentials = await resolveClientCredentials({ smClient });

    expect(credentials).toEqual({ client_id: "client-123", client_secret: "shh" });
    expect(smClient.send.mock.calls[0][0].input).toEqual({ SecretId: CLIENT_SECRET_NAME });
  });

  test("fails naming --store-client when the secret does not exist", async () => {
    const smClient = fakeSmClient();
    smClient.send.mockRejectedValueOnce(notFound());

    await expect(resolveClientCredentials({ smClient })).rejects.toThrow(/--store-client/);
  });
});

describe("storeClientCredentials", () => {
  let dir;
  beforeEach(() => (dir = makeTempDir()));
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("fails naming the expected shape when the downloaded file isn't a Desktop client", async () => {
    const filePath = path.join(dir, "client.json");
    fs.writeFileSync(filePath, JSON.stringify({ web: {} }));
    const smClient = fakeSmClient();

    await expect(storeClientCredentials({ clientFile: filePath, smClient })).rejects.toThrow(/Desktop OAuth client/);
    expect(smClient.send).not.toHaveBeenCalled();
  });

  test("updates the secret when it already exists", async () => {
    const filePath = path.join(dir, "client.json");
    fs.writeFileSync(filePath, CLIENT_JSON);
    const smClient = fakeSmClient();
    smClient.send.mockResolvedValueOnce({});

    await storeClientCredentials({ clientFile: filePath, smClient });

    expect(smClient.send).toHaveBeenCalledTimes(1);
    expect(smClient.send.mock.calls[0][0].input).toEqual({ SecretId: CLIENT_SECRET_NAME, SecretString: CLIENT_JSON });
  });

  test("creates the secret when it doesn't exist yet", async () => {
    const filePath = path.join(dir, "client.json");
    fs.writeFileSync(filePath, CLIENT_JSON);
    const smClient = fakeSmClient();
    smClient.send.mockRejectedValueOnce(notFound()).mockResolvedValueOnce({});

    await storeClientCredentials({ clientFile: filePath, smClient });

    expect(smClient.send).toHaveBeenCalledTimes(2);
    expect(smClient.send.mock.calls[1][0].input).toEqual({
      Name: CLIENT_SECRET_NAME,
      SecretString: CLIENT_JSON,
      Description: "YouTube Data API OAuth Desktop client for the video upload script",
    });
  });
});

function fakeOAuth2ClientImpl(getAccessTokenResult) {
  const instances = [];
  const OAuth2ClientImpl = vi.fn(function FakeOAuth2Client(options) {
    instances.push(this);
    this.options = options;
    this.setCredentials = vi.fn();
    this.getAccessToken = vi.fn().mockResolvedValue(getAccessTokenResult);
  });
  OAuth2ClientImpl.instances = instances;
  return OAuth2ClientImpl;
}

describe("obtainAccessToken", () => {
  let dir;
  beforeEach(() => (dir = makeTempDir()));
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("uses a stored refresh token without running the consent flow", async () => {
    const smClient = fakeSmClient();
    smClient.send
      .mockResolvedValueOnce({ SecretString: CLIENT_JSON }) // client credentials
      .mockResolvedValueOnce({ SecretString: JSON.stringify({ refresh_token: "stored-refresh-token" }) }); // refresh token
    const OAuth2ClientImpl = fakeOAuth2ClientImpl({ token: "fresh-access-token" });
    const runConsentFlow = vi.fn();

    const token = await obtainAccessToken({ smClient, OAuth2ClientImpl, runConsentFlow });

    expect(token).toBe("fresh-access-token");
    expect(runConsentFlow).not.toHaveBeenCalled();
    expect(OAuth2ClientImpl.instances[0].setCredentials).toHaveBeenCalledWith({ refresh_token: "stored-refresh-token" });
  });

  test("runs the consent flow and stores the refresh token when none is stored yet", async () => {
    const smClient = fakeSmClient();
    smClient.send
      .mockResolvedValueOnce({ SecretString: CLIENT_JSON }) // client credentials
      .mockRejectedValueOnce(notFound()) // no stored refresh token
      .mockResolvedValueOnce({}); // writeSecret (update succeeds)
    const OAuth2ClientImpl = fakeOAuth2ClientImpl({ token: "fresh-access-token" });
    const runConsentFlow = vi.fn().mockResolvedValue("new-refresh-token");

    const token = await obtainAccessToken({ smClient, OAuth2ClientImpl, runConsentFlow });

    expect(token).toBe("fresh-access-token");
    expect(runConsentFlow).toHaveBeenCalledWith({ clientCredentials: { client_id: "client-123", client_secret: "shh" }, OAuth2ClientImpl });
    expect(smClient.send.mock.calls[2][0].input).toEqual({
      SecretId: REFRESH_TOKEN_SECRET_NAME,
      SecretString: JSON.stringify({ refresh_token: "new-refresh-token" }),
    });
    expect(OAuth2ClientImpl.instances[0].setCredentials).toHaveBeenCalledWith({ refresh_token: "new-refresh-token" });
  });

  test("fails loudly when Google returns no access token for the stored refresh token", async () => {
    const smClient = fakeSmClient();
    smClient.send
      .mockResolvedValueOnce({ SecretString: CLIENT_JSON })
      .mockResolvedValueOnce({ SecretString: JSON.stringify({ refresh_token: "stored-refresh-token" }) });
    const OAuth2ClientImpl = fakeOAuth2ClientImpl({ token: null });

    await expect(obtainAccessToken({ smClient, OAuth2ClientImpl, runConsentFlow: vi.fn() })).rejects.toThrow(REFRESH_TOKEN_SECRET_NAME);
  });
});

describe("fetchOwnChannel", () => {
  test("returns the signed-in channel's title and handle", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ snippet: { title: "DIY Accounting Submit", customUrl: "@DIYAccountingSubmit" } }] }),
    });

    const channel = await fetchOwnChannel({ accessToken: "token", quotaProject: "diyaccounting-ga4", fetchImpl });

    expect(channel).toEqual({ title: "DIY Accounting Submit", handle: "@DIYAccountingSubmit" });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toContain("/youtube/v3/channels?part=snippet&mine=true");
    expect(options.headers["x-goog-user-project"]).toBe("diyaccounting-ga4");
    expect(options.headers.Authorization).toBe("Bearer token");
  });

  test("fails loudly when no channel is linked to the account", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });

    await expect(fetchOwnChannel({ accessToken: "token", quotaProject: "diyaccounting-ga4", fetchImpl })).rejects.toThrow(
      /no YouTube channel/,
    );
  });
});

describe("normalizeChannelHandle", () => {
  test("lowercases a handle", () => {
    expect(normalizeChannelHandle("@DIYAccountingSubmit")).toBe("@diyaccountingsubmit");
  });

  test("returns null when given null", () => {
    expect(normalizeChannelHandle(null)).toBeNull();
  });

  test("preserves the @ character when lowercasing", () => {
    expect(normalizeChannelHandle("@MiXeD")).toBe("@mixed");
  });
});

describe("channelHandlesMatch", () => {
  test("matches handles case-insensitively", () => {
    expect(channelHandlesMatch("@DIYAccountingSubmit", "@diyaccountingsubmit")).toBe(true);
  });

  test("matches identical handles", () => {
    expect(channelHandlesMatch("@DIYAccountingSubmit", "@DIYAccountingSubmit")).toBe(true);
  });

  test("rejects different handles", () => {
    expect(channelHandlesMatch("@DIYAccountingSubmit", "@SomeoneElse")).toBe(false);
  });

  test("handles null properly when both are null", () => {
    expect(channelHandlesMatch(null, null)).toBe(true);
  });

  test("handles null when one side is null", () => {
    expect(channelHandlesMatch("@DIYAccountingSubmit", null)).toBe(false);
    expect(channelHandlesMatch(null, "@DIYAccountingSubmit")).toBe(false);
  });
});

describe("assertChannelHandleMatches", () => {
  test("passes silently when the handle matches", () => {
    expect(() => assertChannelHandleMatches({ handle: "@DIYAccountingSubmit" }, "@DIYAccountingSubmit")).not.toThrow();
  });

  test("passes silently when the handles match case-insensitively", () => {
    expect(() => assertChannelHandleMatches({ handle: "@diyaccountingsubmit" }, "@DIYAccountingSubmit")).not.toThrow();
  });

  test("throws naming both handles when they differ", () => {
    expect(() => assertChannelHandleMatches({ handle: "@SomeoneElse" }, "@DIYAccountingSubmit")).toThrow(
      /"@SomeoneElse".*"@DIYAccountingSubmit"/s,
    );
  });

  test("throws when the signed-in account has no handle at all", () => {
    expect(() => assertChannelHandleMatches({ handle: null }, "@DIYAccountingSubmit")).toThrow(/\(none\)/);
  });
});

describe("parseConfig", () => {
  test("reads the channel handle, quota project and secret names", () => {
    const toml = `[channel]\nhandle = "@DIYAccountingSubmit"\nquota_project = "diyaccounting-ga4"\n\n[secrets]\noauth_client = "prod/submit/youtube/oauth_client"\nrefresh_token = "prod/submit/youtube/refresh_token"\n`;
    expect(parseConfig(toml)).toEqual({
      channelHandle: "@DIYAccountingSubmit",
      quotaProject: "diyaccounting-ga4",
      clientSecretName: "prod/submit/youtube/oauth_client",
      refreshTokenSecretName: "prod/submit/youtube/refresh_token",
    });
  });

  test("throws when a required field is missing", () => {
    expect(() => parseConfig('[channel]\nhandle = "@x"\n')).toThrow(/youtube\.toml/);
  });

  test("the module's exported constants match the real repo config", () => {
    expect(CHANNEL_HANDLE).toBe("@DIYAccountingSubmit");
    expect(CLIENT_SECRET_NAME).toBe("prod/submit/youtube/oauth_client");
    expect(REFRESH_TOKEN_SECRET_NAME).toBe("prod/submit/youtube/refresh_token");
    expect(DEFAULT_QUOTA_PROJECT).toBe("diyaccounting-ga4");
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

    await expect(
      uploadVideo({ entry, accessToken: "token", quotaProject: "diyaccounting-ga4", publicVideo: false, fetchImpl }),
    ).rejects.toThrow(/Location header/);
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

    const result = await uploadCaption({
      entry,
      videoId: "yt-video-id",
      accessToken: "token",
      quotaProject: "diyaccounting-ga4",
      fetchImpl,
    });

    expect(result).toEqual({ id: "caption-id" });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toContain("/captions?uploadType=multipart");
    expect(options.headers["Content-Type"]).toMatch(/^multipart\/related; boundary=/);
    expect(options.headers["x-goog-user-project"]).toBe("diyaccounting-ga4");
    expect(options.body.toString()).toContain("yt-video-id");
    expect(options.body.toString()).toContain("WEBVTT");
  });

  test("retries a 404 (video not indexed yet) with the backoff and succeeds", async () => {
    const captionFile = path.join(dir, "clip.vtt");
    fs.writeFileSync(captionFile, "WEBVTT\n");
    const entry = { id: "clip", captionFile };
    const notIndexed = { ok: false, status: 404, text: async () => '{"error":{"errors":[{"reason":"videoNotFound"}]}}' };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(notIndexed)
      .mockResolvedValueOnce(notIndexed)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "caption-id" }) });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await uploadCaption({
      entry,
      videoId: "yt-video-id",
      accessToken: "token",
      quotaProject: "diyaccounting-ga4",
      fetchImpl,
      sleep,
    });

    expect(result).toEqual({ id: "caption-id" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual(CAPTION_RETRY_DELAYS_MS);
    expect(CAPTION_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0)).toBe(30_000);
    log.mockRestore();
  });

  test("gives up after three 404s naming the status", async () => {
    const captionFile = path.join(dir, "clip.vtt");
    fs.writeFileSync(captionFile, "WEBVTT\n");
    const entry = { id: "clip", captionFile };
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => "videoNotFound" });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(
      uploadCaption({ entry, videoId: "yt-video-id", accessToken: "token", quotaProject: "diyaccounting-ga4", fetchImpl, sleep }),
    ).rejects.toThrow(/Failed to upload caption for clip: 404 videoNotFound/);

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });

  test("does not retry a non-404 failure", async () => {
    const captionFile = path.join(dir, "clip.vtt");
    fs.writeFileSync(captionFile, "WEBVTT\n");
    const entry = { id: "clip", captionFile };
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "quota" });
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      uploadCaption({ entry, videoId: "yt-video-id", accessToken: "token", quotaProject: "diyaccounting-ga4", fetchImpl, sleep }),
    ).rejects.toThrow(/403 quota/);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe("publishEntry", () => {
  const list = { videos: [{ id: "clip", publish: true, videoId: null }] };
  const entry = list.videos[0];

  test("records the video id on disk, copies the manifest into web/public, then uploads the caption", async () => {
    const order = [];
    const uploadVideoImpl = vi.fn().mockResolvedValue("yt-new");
    const savePublishListImpl = vi.fn((saved) => order.push(["save", saved.videos[0].videoId]));
    const copyVideosManifestImpl = vi.fn(() => order.push(["copy"]));
    const uploadCaptionImpl = vi.fn(async () => order.push(["caption"]));

    const result = await publishEntry({
      entry,
      list,
      accessToken: "token",
      quotaProject: "p",
      publicVideo: false,
      uploadVideoImpl,
      uploadCaptionImpl,
      savePublishListImpl,
      copyVideosManifestImpl,
      log: () => {},
    });

    expect(order).toEqual([["save", "yt-new"], ["copy"], ["caption"]]);
    expect(result.videos[0].videoId).toBe("yt-new");
    expect(uploadCaptionImpl).toHaveBeenCalledWith({ entry, videoId: "yt-new", accessToken: "token", quotaProject: "p" });
  });

  test("a caption failure leaves the video id recorded so a re-run skips the upload", async () => {
    const uploadVideoImpl = vi.fn().mockResolvedValue("yt-new");
    const savePublishListImpl = vi.fn();
    const copyVideosManifestImpl = vi.fn();
    const uploadCaptionImpl = vi.fn().mockRejectedValue(new Error("Failed to upload caption for clip: 404 videoNotFound"));

    await expect(
      publishEntry({
        entry,
        list,
        accessToken: "token",
        quotaProject: "p",
        publicVideo: false,
        uploadVideoImpl,
        uploadCaptionImpl,
        savePublishListImpl,
        copyVideosManifestImpl,
        log: () => {},
      }),
    ).rejects.toThrow(/404/);

    expect(savePublishListImpl).toHaveBeenCalledTimes(1);
    expect(copyVideosManifestImpl).toHaveBeenCalledTimes(1);
    const saved = savePublishListImpl.mock.calls[0][0];
    expect(saved.videos[0].videoId).toBe("yt-new");
    expect(selectPendingUploads(saved)).toEqual([]);
  });
});

describe("selectUploadedVideos", () => {
  test("keeps only the publishable entries that already have a video id", () => {
    const list = {
      videos: [
        { id: "a", publish: true, videoId: "yt-a" },
        { id: "b", publish: true, videoId: null },
        { id: "c", publish: false, videoId: "yt-c" },
      ],
    };
    expect(selectUploadedVideos(list).map((entry) => entry.id)).toEqual(["a"]);
  });
});

describe("setVideoPrivacy", () => {
  test("puts the new privacy status on the video and returns what YouTube recorded", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: { privacyStatus: "public" } }) });

    const status = await setVideoPrivacy({
      videoId: "yt-a",
      privacyStatus: "public",
      accessToken: "token",
      quotaProject: "diyaccounting-ga4",
      fetchImpl,
    });

    expect(status).toBe("public");
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toContain("/videos?part=status");
    expect(options.method).toBe("PUT");
    expect(options.headers["x-goog-user-project"]).toBe("diyaccounting-ga4");
    expect(JSON.parse(options.body)).toEqual({ id: "yt-a", status: { privacyStatus: "public" } });
  });

  test("throws with YouTube's answer when the update is refused", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "forbidden" });

    await expect(
      setVideoPrivacy({ videoId: "yt-a", privacyStatus: "public", accessToken: "token", quotaProject: "diyaccounting-ga4", fetchImpl }),
    ).rejects.toThrow("403 forbidden");
  });
});
