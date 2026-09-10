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
  class GetObjectCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return { S3Client, GetObjectCommand };
});

const { ingestHandler } = await import("../../functions/books/booksVersionGet.js");
const { _setTestSalt, _clearSalt } = await import("../../services/subHasher.js");
const { hashSub } = await import("../../services/subHasher.js");

const BOOK_ID = "11111111-2222-4333-8444-555555555555";

function jsonBody(object) {
  return { transformToString: async () => JSON.stringify(object) };
}

function bytesBody(buffer) {
  return { transformToByteArray: async () => new Uint8Array(buffer) };
}

function buildAuthenticatedEvent({ sub = "test-sub", bookId = BOOK_ID, version = "latest", headers = {} } = {}) {
  return buildLambdaEvent({
    method: "GET",
    path: `/api/v1/books/${bookId}/versions/${version}`,
    pathParameters: { bookId, version },
    headers,
    authorizer: buildJwtAuthorizerContext(sub),
  });
}

describe("booksVersionGet", () => {
  beforeEach(() => {
    mockS3Send.mockReset();
    process.env.BOOKS_BUCKET_NAME = "test-books-bucket";
    process.env.BOOKS_ALLOWED_ORIGINS = "https://spreadsheets.diyaccounting.co.uk";
    _setTestSalt("test-salt");
  });

  test("resolves latest to the metadata's latestVersion and returns it with an ETag header", async () => {
    const hashedSub = hashSub("test-sub");
    const metadata = { bookId: BOOK_ID, latestVersion: 3, latestETag: "abc" };
    mockS3Send.mockImplementation((command) => {
      const key = command.input.Key;
      if (key === `users/${hashedSub}/books/${BOOK_ID}/metadata.json`) {
        return { ETag: '"meta-etag"', Body: jsonBody(metadata) };
      }
      if (key === `users/${hashedSub}/books/${BOOK_ID}/v3.zip`) {
        return { ETag: '"zip-etag"', Body: bytesBody(Buffer.from("zip-bytes")) };
      }
      const error = new Error("not found");
      error.name = "NoSuchKey";
      throw error;
    });

    const result = await ingestHandler(buildAuthenticatedEvent({}));

    expect(result.statusCode).toBe(200);
    expect(result.headers.ETag).toBe('"zip-etag"');
    const body = JSON.parse(result.body);
    expect(body.version).toBe(3);
    expect(body.etag).toBe("zip-etag");
    expect(Buffer.from(body.zipBase64, "base64").toString()).toBe("zip-bytes");
  });

  test("404s an unknown book", async () => {
    mockS3Send.mockImplementation(() => {
      const error = new Error("not found");
      error.name = "NoSuchKey";
      throw error;
    });

    const result = await ingestHandler(buildAuthenticatedEvent({}));

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).code).toBe("book-not-found");
  });

  test("404s not 403 for another user's book", async () => {
    // The caller's own hashed sub never has this book's metadata under it, so it looks
    // identical to an unknown book - a cross-user read must never leak a 403.
    mockS3Send.mockImplementation(() => {
      const error = new Error("not found");
      error.name = "NoSuchKey";
      throw error;
    });

    const result = await ingestHandler(buildAuthenticatedEvent({ sub: "someone-elses-sub" }));

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).code).toBe("book-not-found");
  });

  test("404s a pruned or nonexistent version", async () => {
    const hashedSub = hashSub("test-sub");
    const metadata = { bookId: BOOK_ID, latestVersion: 5, versions: [{ version: 5 }] };
    mockS3Send.mockImplementation((command) => {
      const key = command.input.Key;
      if (key === `users/${hashedSub}/books/${BOOK_ID}/metadata.json`) {
        return { ETag: '"meta-etag"', Body: jsonBody(metadata) };
      }
      const error = new Error("not found");
      error.name = "NoSuchKey";
      throw error;
    });

    const result = await ingestHandler(buildAuthenticatedEvent({ version: "1" }));

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).code).toBe("version-not-found");
  });

  test("400s an invalid bookId", async () => {
    const result = await ingestHandler(buildAuthenticatedEvent({ bookId: "../../other" }));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).code).toBe("invalid-book-id");
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  test("400s a version that is neither latest nor a positive integer", async () => {
    const hashedSub = hashSub("test-sub");
    const metadata = { bookId: BOOK_ID, latestVersion: 2 };
    mockS3Send.mockImplementation((command) => {
      const key = command.input.Key;
      if (key === `users/${hashedSub}/books/${BOOK_ID}/metadata.json`) {
        return { ETag: '"meta-etag"', Body: jsonBody(metadata) };
      }
      const error = new Error("not found");
      error.name = "NoSuchKey";
      throw error;
    });

    const result = await ingestHandler(buildAuthenticatedEvent({ version: "not-a-number" }));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).code).toBe("invalid-request");
  });

  test("rejects an unauthenticated call", async () => {
    const event = buildLambdaEvent({
      method: "GET",
      path: `/api/v1/books/${BOOK_ID}/versions/latest`,
      pathParameters: { bookId: BOOK_ID, version: "latest" },
      authorizer: {},
    });

    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(401);
  });
});
