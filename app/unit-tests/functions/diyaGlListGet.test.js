// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, beforeEach, vi } from "vitest";
import { buildJwtAuthorizerContext, buildLambdaEvent } from "../../test-helpers/eventBuilders.js";

const mockS3Send = vi.fn();

vi.mock("@aws-sdk/client-s3", () => {
  class S3Client {
    send(command) {
      return mockS3Send(command);
    }
  }
  class ListObjectsV2Command {
    constructor(input) {
      this.input = input;
    }
  }
  class GetObjectCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return { S3Client, ListObjectsV2Command, GetObjectCommand };
});

vi.mock("@app/data/dynamoDbBundleRepository.js", () => ({
  getUserBundles: vi.fn().mockResolvedValue([]),
}));

vi.mock("@app/data/dynamoDbPracticeClientRepository.js", () => ({
  getClient: vi.fn(),
}));

const { getUserBundles } = await import("@app/data/dynamoDbBundleRepository.js");
const { getClient } = await import("@app/data/dynamoDbPracticeClientRepository.js");
const { ingestHandler } = await import("../../functions/diyaGl/diyaGlListGet.js");
const { _setTestSalt, _clearSalt } = await import("../../services/subHasher.js");
const { hashSub } = await import("../../services/subHasher.js");

function jsonBody(object) {
  return { transformToString: async () => JSON.stringify(object) };
}

function buildAuthenticatedEvent({ sub = "test-sub", headers = {}, clientId } = {}) {
  return buildLambdaEvent({
    method: "GET",
    path: "/api/v1/books",
    headers,
    queryStringParameters: clientId ? { clientId } : null,
    authorizer: buildJwtAuthorizerContext(sub),
  });
}

describe("diyaGlListGet", () => {
  beforeEach(() => {
    mockS3Send.mockReset();
    getClient.mockReset();
    process.env.DIYA_GL_BUCKET_NAME = "test-books-bucket";
    process.env.DIYA_GL_ALLOWED_ORIGINS = "https://spreadsheets.diyaccounting.co.uk";
    delete process.env.DIYA_GL_RESIDENT_TIER;
    getUserBundles.mockReset().mockResolvedValue([]);
    _setTestSalt("test-salt");
  });

  test("returns an empty list and the tier-disabled entitlement when the caller has no books", async () => {
    mockS3Send.mockImplementation((command) => handleCommand(command, { commonPrefixes: [] }));

    const result = await ingestHandler(buildAuthenticatedEvent({}));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      entitlement: { reason: "tier-disabled", expiry: null, residentTier: false },
      books: [],
    });
  });

  test("returns books newest first", async () => {
    const older = { bookId: "book-a", updatedAt: "2026-01-01T00:00:00.000Z", retention: "sandbox", expiresAt: null };
    const newer = { bookId: "book-b", updatedAt: "2026-06-01T00:00:00.000Z", retention: "sandbox", expiresAt: null };
    mockS3Send.mockImplementation((command) =>
      handleCommand(command, {
        commonPrefixes: ["book-a", "book-b"],
        metadataByBookId: { "book-a": older, "book-b": newer },
      }),
    );

    const result = await ingestHandler(buildAuthenticatedEvent({}));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).books.map((b) => b.bookId)).toEqual(["book-b", "book-a"]);
  });

  test("leaves out a sandbox book past its expiresAt", async () => {
    const live = {
      bookId: "book-live",
      updatedAt: "2026-01-01T00:00:00.000Z",
      retention: "sandbox",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const expired = {
      bookId: "book-expired",
      updatedAt: "2026-01-01T00:00:00.000Z",
      retention: "sandbox",
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    };
    mockS3Send.mockImplementation((command) =>
      handleCommand(command, {
        commonPrefixes: ["book-live", "book-expired"],
        metadataByBookId: { "book-live": live, "book-expired": expired },
      }),
    );

    const result = await ingestHandler(buildAuthenticatedEvent({}));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).books.map((b) => b.bookId)).toEqual(["book-live"]);
  });

  test("reports the lapse expiry for a resident book under an expired subscription", async () => {
    process.env.DIYA_GL_RESIDENT_TIER = "true";
    const bundleExpiry = "2026-01-01T00:00:00.000Z";
    getUserBundles.mockResolvedValue([{ bundleId: "resident", subscriptionStatus: "canceled", expiry: bundleExpiry }]);
    const residentBook = { bookId: "book-resident", updatedAt: "2025-12-01T00:00:00.000Z", retention: "resident", expiresAt: null };
    mockS3Send.mockImplementation((command) =>
      handleCommand(command, { commonPrefixes: ["book-resident"], metadataByBookId: { "book-resident": residentBook } }),
    );

    const result = await ingestHandler(buildAuthenticatedEvent({}));

    expect(result.statusCode).toBe(200);
    const responseBody = JSON.parse(result.body);
    expect(responseBody.entitlement).toEqual({ reason: "expired", expiry: bundleExpiry, residentTier: true });
    expect(responseBody.books[0].expiresAt).toBe("2026-01-31T00:00:00.000Z");
  });

  test("rejects an unauthenticated call", async () => {
    const event = buildLambdaEvent({ method: "GET", path: "/api/v1/books", authorizer: {} });

    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(401);
  });

  test("answers an OPTIONS preflight from an allow-listed origin without a token", async () => {
    const event = { requestContext: { http: { method: "OPTIONS" } }, headers: { origin: "https://spreadsheets.diyaccounting.co.uk" } };

    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(204);
    expect(result.headers["Access-Control-Allow-Origin"]).toBe("https://spreadsheets.diyaccounting.co.uk");
  });

  test("answers an OPTIONS preflight from an unlisted origin with no CORS header", async () => {
    const event = { requestContext: { http: { method: "OPTIONS" } }, headers: { origin: "https://evil.example" } };

    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(204);
    expect(result.headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  test("lists the client's own books when a clientId belonging to the caller is given", async () => {
    getClient.mockResolvedValue({ clientId: "client-1" });
    const hashedSub = hashSub("test-sub");
    const clientPrefix = `${hashedSub}/clients/client-1`;
    const book = { bookId: "book-a", updatedAt: "2026-01-01T00:00:00.000Z", retention: "sandbox", expiresAt: null };
    mockS3Send.mockImplementation((command) => {
      if (command.constructor.name === "ListObjectsV2Command") {
        expect(command.input.Prefix).toBe(`users/${clientPrefix}/books/`);
        return { CommonPrefixes: [{ Prefix: `users/${clientPrefix}/books/book-a/` }] };
      }
      return { ETag: '"abc123"', Body: jsonBody(book) };
    });

    const result = await ingestHandler(buildAuthenticatedEvent({ clientId: "client-1" }));

    expect(result.statusCode).toBe(200);
    expect(getClient).toHaveBeenCalledWith("test-sub", "client-1");
  });

  test("403s a clientId that does not belong to the caller's practice", async () => {
    getClient.mockResolvedValue(null);

    const result = await ingestHandler(buildAuthenticatedEvent({ clientId: "not-mine" }));

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).code).toBe("client-not-found");
    expect(mockS3Send).not.toHaveBeenCalled();
  });
});

function handleCommand(command, { commonPrefixes = [], metadataByBookId = {} }) {
  if (command.constructor.name === "ListObjectsV2Command") {
    return { CommonPrefixes: commonPrefixes.map((bookId) => ({ Prefix: `${command.input.Prefix}${bookId}/` })) };
  }
  if (command.constructor.name === "GetObjectCommand") {
    const bookId = command.input.Key.split("/")[3];
    const metadata = metadataByBookId[bookId];
    if (!metadata) {
      const error = new Error("not found");
      error.name = "NoSuchKey";
      throw error;
    }
    return { ETag: '"abc123"', Body: jsonBody(metadata) };
  }
  throw new Error(`Unexpected command ${command.constructor.name}`);
}
