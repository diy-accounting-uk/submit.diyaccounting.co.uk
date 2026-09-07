// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

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
  class ListObjectsV2Command {
    constructor(input) {
      this.input = input;
    }
  }
  class DeleteObjectsCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return { S3Client, GetObjectCommand, ListObjectsV2Command, DeleteObjectsCommand };
});

const { ingestHandler } = await import("../../functions/books/booksDelete.js");
const { _setTestSalt, _clearSalt } = await import("../../services/subHasher.js");
const { hashSub } = await import("../../services/subHasher.js");

const BOOK_ID = "11111111-2222-4333-8444-555555555555";

function jsonBody(object) {
  return { transformToString: async () => JSON.stringify(object) };
}

function buildAuthenticatedEvent({ sub = "test-sub", bookId = BOOK_ID } = {}) {
  return buildLambdaEvent({
    method: "DELETE",
    path: `/api/v1/books/${bookId}`,
    pathParameters: { bookId },
    authorizer: buildJwtAuthorizerContext(sub),
  });
}

describe("booksDelete", () => {
  beforeEach(() => {
    mockS3Send.mockReset();
    process.env.BOOKS_BUCKET_NAME = "test-books-bucket";
    _setTestSalt("test-salt");
  });

  test("removes every object under the book's prefix", async () => {
    const hashedSub = hashSub("test-sub");
    const metadataKey = `users/${hashedSub}/books/${BOOK_ID}/metadata.json`;
    const objects = [
      metadataKey,
      `users/${hashedSub}/books/${BOOK_ID}/v1.zip`,
      `users/${hashedSub}/books/${BOOK_ID}/v2.zip`,
      `users/${hashedSub}/books/${BOOK_ID}/v3.zip`,
    ];
    mockS3Send.mockImplementation((command) => {
      if (command.constructor.name === "GetObjectCommand") {
        if (command.input.Key === metadataKey) {
          return { ETag: '"meta-etag"', Body: jsonBody({ bookId: BOOK_ID }) };
        }
        const error = new Error("not found");
        error.name = "NoSuchKey";
        throw error;
      }
      if (command.constructor.name === "ListObjectsV2Command") {
        return { Contents: objects.map((Key) => ({ Key })) };
      }
      if (command.constructor.name === "DeleteObjectsCommand") {
        return { Deleted: command.input.Delete.Objects };
      }
      throw new Error(`Unexpected command ${command.constructor.name}`);
    });

    const result = await ingestHandler(buildAuthenticatedEvent({}));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ bookId: BOOK_ID, deletedObjects: 4 });
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

  test("400s an invalid bookId", async () => {
    const result = await ingestHandler(buildAuthenticatedEvent({ bookId: "not-a-uuid" }));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).code).toBe("invalid-book-id");
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  test("rejects an unauthenticated call", async () => {
    const event = buildLambdaEvent({
      method: "DELETE",
      path: `/api/v1/books/${BOOK_ID}`,
      pathParameters: { bookId: BOOK_ID },
      authorizer: {},
    });

    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(401);
  });
});
