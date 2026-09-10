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

const { ingestHandler } = await import("../../functions/diyaGl/diyaGlListGet.js");
const { _setTestSalt, _clearSalt } = await import("../../services/subHasher.js");

function jsonBody(object) {
  return { transformToString: async () => JSON.stringify(object) };
}

function buildAuthenticatedEvent({ sub = "test-sub", headers = {} } = {}) {
  return buildLambdaEvent({
    method: "GET",
    path: "/api/v1/books",
    headers,
    authorizer: buildJwtAuthorizerContext(sub),
  });
}

describe("diyaGlListGet", () => {
  beforeEach(() => {
    mockS3Send.mockReset();
    process.env.DIYA_GL_BUCKET_NAME = "test-books-bucket";
    process.env.DIYA_GL_ALLOWED_ORIGINS = "https://spreadsheets.diyaccounting.co.uk";
    _setTestSalt("test-salt");
  });

  test("returns an empty list when the caller has no books", async () => {
    mockS3Send.mockImplementation((command) => handleCommand(command, { commonPrefixes: [] }));

    const result = await ingestHandler(buildAuthenticatedEvent({}));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ books: [] });
  });

  test("returns books newest first", async () => {
    const older = { bookId: "book-a", updatedAt: "2026-01-01T00:00:00.000Z" };
    const newer = { bookId: "book-b", updatedAt: "2026-06-01T00:00:00.000Z" };
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
