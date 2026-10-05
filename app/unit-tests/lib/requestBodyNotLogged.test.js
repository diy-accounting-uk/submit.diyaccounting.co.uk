// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect, vi, beforeEach } from "vitest";

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

const { extractRequest } = await import("@app/lib/httpResponseHelper.js");
const { processSqsRecords } = await import("@app/lib/sqsWorkerHelper.js");
const { decodeJwtNoVerify } = await import("@app/lib/jwtHelper.js");

const personalName = "Zebediah Quillfeather";
const postalAddress = "17 Marmalade Lane, Nowhereton";
const vatFigure = "4815162342.99";
const bodyJson = JSON.stringify({ name: personalName, address: postalAddress, vatDueSales: vatFigure });

function allLoggedText() {
  return JSON.stringify(loggedLines);
}

describe("extractRequest logging", () => {
  beforeEach(() => {
    loggedLines.length = 0;
  });

  it("logs no body content for a string body", () => {
    extractRequest({
      headers: { "host": "submit.example.test", "content-type": "application/json", "x-request-id": "req-1" },
      rawPath: "/api/v1/thing",
      requestContext: { requestId: "ctx-1" },
      body: bodyJson,
    });
    const text = allLoggedText();
    for (const secret of [personalName, postalAddress, vatFigure]) {
      expect(text).not.toContain(secret);
    }
    expect(loggedLines.length).toBeGreaterThan(0);
  });

  it("logs the body length and content type and keeps the request line", () => {
    extractRequest({
      headers: { "host": "submit.example.test", "content-type": "application/json" },
      rawPath: "/api/v1/thing",
      queryStringParameters: { a: "b" },
      requestContext: { requestId: "ctx-2" },
      body: bodyJson,
    });
    const logged = loggedLines.find((l) => l.args[0]?.message === "Processing request with event").args[0];
    expect(logged.request).toContain("/api/v1/thing?a=b");
    expect(logged.event.bodyLength).toBe(bodyJson.length);
    expect(logged.event.bodyContentType).toBe("application/json");
    expect(logged.event.body).toBeUndefined();
    expect(logged.event.requestContext.requestId).toBe("ctx-2");
  });

  it("logs no body content for an object body", () => {
    extractRequest({
      headers: { host: "submit.example.test" },
      rawPath: "/x",
      body: { name: personalName, address: postalAddress, vatDueSales: vatFigure },
    });
    const text = allLoggedText();
    for (const secret of [personalName, postalAddress, vatFigure]) {
      expect(text).not.toContain(secret);
    }
  });

  it("logs no body content when the URL cannot be built", () => {
    extractRequest({
      headers: { referer: "not a url", host: "submit.example.test" },
      rawPath: "/x",
      body: bodyJson,
    });
    const warning = loggedLines.find((l) => l.level === "warn");
    expect(warning).toBeDefined();
    const text = allLoggedText();
    for (const secret of [personalName, postalAddress, vatFigure]) {
      expect(text).not.toContain(secret);
    }
  });

  it("logs no body content when headers are missing", () => {
    extractRequest({ rawPath: "/x", body: bodyJson });
    const text = allLoggedText();
    for (const secret of [personalName, postalAddress, vatFigure]) {
      expect(text).not.toContain(secret);
    }
  });
});

describe("processSqsRecords logging", () => {
  beforeEach(() => {
    loggedLines.length = 0;
  });

  it("logs no message body content when the record lacks ids", async () => {
    const queueLogger = {
      info: (...args) => loggedLines.push({ level: "info", args }),
      warn: (...args) => loggedLines.push({ level: "warn", args }),
      error: (...args) => loggedLines.push({ level: "error", args }),
    };
    const processRecord = vi.fn();
    await processSqsRecords(
      { Records: [{ messageId: "m-1", body: JSON.stringify({ name: personalName, address: postalAddress, vatDueSales: vatFigure }) }] },
      { requiredEnv: [], logger: queueLogger, errorPolicy: "retry", processRecord },
    );
    expect(processRecord).not.toHaveBeenCalled();
    expect(loggedLines.some((l) => l.level === "error")).toBe(true);
    const text = allLoggedText();
    for (const secret of [personalName, postalAddress, vatFigure]) {
      expect(text).not.toContain(secret);
    }
  });
});

describe("decodeJwtNoVerify logging", () => {
  beforeEach(() => {
    loggedLines.length = 0;
  });

  it("logs the claim names and none of their values", () => {
    const claims = { sub: "user-sub-1", name: personalName, address: postalAddress };
    const encode = (part) => Buffer.from(JSON.stringify(part)).toString("base64url");
    const token = `${encode({ alg: "none" })}.${encode(claims)}.sig`;
    expect(decodeJwtNoVerify(token)).toEqual(claims);
    const text = allLoggedText();
    expect(text).not.toContain(personalName);
    expect(text).not.toContain(postalAddress);
    expect(text).toContain("address");
  });
});
