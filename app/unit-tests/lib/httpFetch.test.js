// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, afterEach, beforeEach } from "vitest";

const loggedLines = [];
vi.mock("@app/lib/logger.js", async (importOriginal) => {
  const actual = await importOriginal();
  const capture =
    (level) =>
    (...args) =>
      loggedLines.push({ level, args });
  const fakeLogger = {
    trace: capture("trace"),
    debug: capture("debug"),
    info: capture("info"),
    warn: capture("warn"),
    error: capture("error"),
    fatal: capture("fatal"),
  };
  return { ...actual, createLogger: () => fakeLogger };
});

const { fetchRetryingNetworkErrors, fetchWithTimeout, fetchTextWithTimeout, HttpTimeoutError } = await import("../../lib/httpFetch.js");

// A fetch that answers only when its signal aborts, as a request that never returns does.
function hangingFetch() {
  return vi.fn(
    (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      }),
  );
}

describe("fetchWithTimeout on a timeout", () => {
  beforeEach(() => {
    loggedLines.length = 0;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("logs and throws the origin and path of a URL with a query, without the query's values", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const url = "https://s3.eu-west-2.amazonaws.com/bucket/doc.xhtml?X-Amz-Signature=SIGNATUREVALUE&X-Amz-Security-Token=TOKENVALUE#part";

    const error = await fetchWithTimeout(url, {}, 5).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(HttpTimeoutError);
    expect(error.url).toBe("https://s3.eu-west-2.amazonaws.com/bucket/doc.xhtml");
    expect(error.message).toBe("Request to https://s3.eu-west-2.amazonaws.com/bucket/doc.xhtml timed out after 5ms");
    const written = JSON.stringify([loggedLines, error.message, error.url, { ...error }]);
    for (const secret of ["SIGNATUREVALUE", "TOKENVALUE", "X-Amz-", "#part"]) expect(written).not.toContain(secret);
    expect(loggedLines).toContainEqual({
      level: "warn",
      args: [expect.objectContaining({ message: "HTTP request timed out", url: "https://s3.eu-west-2.amazonaws.com/bucket/doc.xhtml" })],
    });
  });

  test("logs and throws a URL with each company, transaction or document id named, never its value", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const url = "https://api.company-information.service.gov.uk/company/SC123456/filing-history/MzUxMjI3NTEwN2FkaXF6a2N4";

    const error = await fetchWithTimeout(url, {}, 5).catch((thrown) => thrown);

    const named = "https://api.company-information.service.gov.uk/company/{companyNumber}/filing-history/{transactionId}";
    expect(error.url).toBe(named);
    expect(error.message).toBe(`Request to ${named} timed out after 5ms`);
    expect(loggedLines[0].args[0].url).toBe(named);
    const written = JSON.stringify([loggedLines, error.message, { ...error }]);
    for (const id of ["SC123456", "MzUxMjI3NTEwN2FkaXF6a2N4"]) expect(written).not.toContain(id);
  });
});

describe("fetchRetryingNetworkErrors logging", () => {
  beforeEach(() => {
    loggedLines.length = 0;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("logs a retried URL with its document or agent id named, never its value", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce({ ok: true, status: 200 }));

    await fetchRetryingNetworkErrors(
      "https://document-api.company-information.service.gov.uk/document/AbC-123_xyz/content",
      {},
      {
        sleep: async () => {},
      },
    );

    expect(loggedLines[0].args[0].url).toBe("https://document-api.company-information.service.gov.uk/document/{documentId}/content");
  });

  test("logs a retried URL by its origin and path, without the query", async () => {
    const response = { ok: true, status: 200 };
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(response));

    await fetchRetryingNetworkErrors("https://example.test/a?code=SECRETCODE", {}, { sleep: async () => {} });

    expect(loggedLines[0].args[0].url).toBe("https://example.test/a");
    expect(JSON.stringify(loggedLines)).not.toContain("SECRETCODE");
  });
});

describe("fetchRetryingNetworkErrors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("returns the response of the first attempt without waiting", async () => {
    const response = { ok: true };
    const fetchImpl = vi.fn().mockResolvedValue(response);
    const sleep = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);

    await expect(fetchRetryingNetworkErrors("https://example.test/a", { method: "GET" }, { sleep })).resolves.toBe(response);

    expect(fetchImpl).toHaveBeenCalledWith("https://example.test/a", { method: "GET" });
    expect(sleep).not.toHaveBeenCalled();
  });

  test("retries a network failure with a growing wait and returns the later response", async () => {
    const response = { ok: true };
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(response);
    const sleep = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchImpl);

    await expect(fetchRetryingNetworkErrors("https://example.test/a", {}, { sleep })).resolves.toBe(response);

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([500, 1000]);
  });

  test("rethrows the last network failure after three attempts", async () => {
    const failure = new TypeError("fetch failed");
    const fetchImpl = vi.fn().mockRejectedValue(failure);
    vi.stubGlobal("fetch", fetchImpl);

    await expect(fetchRetryingNetworkErrors("https://example.test/a", {}, { sleep: async () => {} })).rejects.toBe(failure);

    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  test("rethrows an error that is not a TypeError at once", async () => {
    const failure = new Error("boom");
    const fetchImpl = vi.fn().mockRejectedValue(failure);
    vi.stubGlobal("fetch", fetchImpl);

    await expect(fetchRetryingNetworkErrors("https://example.test/a", {}, { sleep: async () => {} })).rejects.toBe(failure);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("returns a non-OK response without retrying", async () => {
    const response = { ok: false, status: 503 };
    const fetchImpl = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchImpl);

    await expect(fetchRetryingNetworkErrors("https://example.test/a", {}, { sleep: async () => {} })).resolves.toBe(response);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("fetchTextWithTimeout against a server", () => {
  let server;
  let baseUrl;
  let handler;

  beforeEach(async () => {
    loggedLines.length = 0;
    vi.unstubAllGlobals();
    const { createServer } = await import("node:http");
    server = createServer((request, response) => handler(request, response));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  test("reads a body within the limit", async () => {
    handler = (request, response) => response.end("<html>accounts</html>");
    const read = await fetchTextWithTimeout(`${baseUrl}/doc`, {}, 2000, { maxBytes: 1000 });
    expect(read).toEqual(expect.objectContaining({ text: "<html>accounts</html>", tooLarge: false }));
  });

  test("stops at the limit for a body larger than its stated length, and reads no further", async () => {
    let written = 0;
    handler = (request, response) => {
      response.writeHead(200, { "Content-Type": "text/html" });
      const chunk = "x".repeat(64 * 1024);
      const timer = setInterval(() => {
        if (response.destroyed || written > 50 * 1024 * 1024) return clearInterval(timer);
        written += chunk.length;
        response.write(chunk);
      }, 1);
      response.on("close", () => clearInterval(timer));
    };
    const read = await fetchTextWithTimeout(`${baseUrl}/doc`, {}, 5000, { maxBytes: 256 * 1024 });
    expect(read).toEqual(expect.objectContaining({ text: null, tooLarge: true }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(written).toBeLessThan(5 * 1024 * 1024);
  });

  test("counts the bytes after decompression, so a small compressed body that expands past the limit stops", async () => {
    const { gzipSync } = await import("node:zlib");
    const compressed = gzipSync(Buffer.alloc(2 * 1024 * 1024, 0x61));
    expect(compressed.length).toBeLessThan(64 * 1024);
    handler = (request, response) => {
      response.writeHead(200, { "Content-Type": "text/html", "Content-Encoding": "gzip", "Content-Length": compressed.length });
      response.end(compressed);
    };
    const read = await fetchTextWithTimeout(`${baseUrl}/doc`, {}, 5000, { maxBytes: 1024 * 1024 });
    expect(read.tooLarge).toBe(true);
  });

  test("times out on a body that stalls after its headers", async () => {
    handler = (request, response) => {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.write("<html>");
    };
    const started = Date.now();
    const error = await fetchTextWithTimeout(`${baseUrl}/doc?X-Amz-Signature=SECRET`, {}, 300, { maxBytes: 1000 }).catch(
      (thrown) => thrown,
    );
    expect(error).toBeInstanceOf(HttpTimeoutError);
    expect(Date.now() - started).toBeLessThan(3000);
    expect(error.url).toBe(`${baseUrl}/doc`);
  });
});
