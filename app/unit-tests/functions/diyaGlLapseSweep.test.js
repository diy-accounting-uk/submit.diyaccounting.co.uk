// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, beforeEach, vi } from "vitest";

const mockDynamoSend = vi.fn();
const mockS3Send = vi.fn();

const dynamoDbModule = {
  QueryCommand: class QueryCommand {
    constructor(params) {
      this.params = params;
    }
  },
};

vi.mock("@app/lib/dynamoDbClient.js", () => ({
  executeDynamoDbCommand: (commandBuilder) => mockDynamoSend(commandBuilder(dynamoDbModule)),
  getResourceName: (envVarName, throwIfMissing = false) => {
    const value = process.env[envVarName];
    if (!value && throwIfMissing) {
      throw new Error(`${envVarName} environment variable is required`);
    }
    return value || "";
  },
}));

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

const { handler } = await import("../../functions/diyaGl/diyaGlLapseSweep.js");

function jsonBody(object) {
  return { transformToString: async () => JSON.stringify(object) };
}

/**
 * Wires the S3 mock to serve `listBooks` (a bookId listing under each owner's prefix, then one
 * metadata read per book) and `deleteBook` (a listing of the book's own objects, then one
 * DeleteObjectsCommand) against an in-memory fixture of owner -> books.
 */
function fixtureS3(booksByOwner) {
  mockS3Send.mockImplementation(async (command) => {
    if (command.constructor.name === "ListObjectsV2Command") {
      const { Prefix, Delimiter } = command.input;
      if (Delimiter === "/") {
        const ownerPrefix = Prefix.match(/^users\/(.+)\/books\/$/)[1];
        const books = booksByOwner[ownerPrefix] || [];
        return { CommonPrefixes: books.map((book) => ({ Prefix: `${Prefix}${book.bookId}/` })) };
      }
      return { Contents: [{ Key: `${Prefix}metadata.json` }, { Key: `${Prefix}v1.zip` }] };
    }
    if (command.constructor.name === "GetObjectCommand") {
      const match = command.input.Key.match(/^users\/(.+)\/books\/(.+)\/metadata\.json$/);
      const [, ownerPrefix, bookId] = match;
      const book = (booksByOwner[ownerPrefix] || []).find((candidate) => candidate.bookId === bookId);
      return { Body: jsonBody(book), ETag: '"etag"' };
    }
    if (command.constructor.name === "DeleteObjectsCommand") {
      return {};
    }
    throw new Error(`unexpected S3 command: ${command.constructor.name}`);
  });
}

function deletedKeysFor(ownerPrefix, bookId) {
  return mockS3Send.mock.calls
    .map(([command]) => command)
    .filter((command) => command.constructor.name === "DeleteObjectsCommand")
    .flatMap((command) => command.input.Delete.Objects.map((object) => object.Key))
    .filter((key) => key.startsWith(`users/${ownerPrefix}/books/${bookId}/`));
}

describe("diyaGlLapseSweep", () => {
  beforeEach(() => {
    mockDynamoSend.mockReset();
    mockS3Send.mockReset();
    process.env.DIYA_GL_BUCKET_NAME = "test-books-bucket";
    process.env.BUNDLE_DYNAMODB_TABLE_NAME = "test-bundle-table";
    delete process.env.DIYA_GL_BUNDLE_ID;
    delete process.env.DIYA_GL_LAPSE_GRACE_DAYS;
  });

  test("throws when the bucket name is missing", async () => {
    delete process.env.DIYA_GL_BUCKET_NAME;
    await expect(handler({})).rejects.toThrow("DIYA_GL_BUCKET_NAME environment variable is required");
  });

  test("throws when the bundle table name is missing", async () => {
    delete process.env.BUNDLE_DYNAMODB_TABLE_NAME;
    await expect(handler({})).rejects.toThrow("BUNDLE_DYNAMODB_TABLE_NAME environment variable is required");
  });

  test("deletes every resident book for a lapsed owner and reports the count", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Items: [{ hashedSub: "owner1" }] });
    fixtureS3({ owner1: [{ bookId: "book-1", retention: "resident" }] });

    const result = await handler({ now: "2026-09-20T00:00:00.000Z" });

    expect(deletedKeysFor("owner1", "book-1")).toEqual(
      expect.arrayContaining(["users/owner1/books/book-1/metadata.json", "users/owner1/books/book-1/v1.zip"]),
    );
    expect(result).toEqual({ ownerCount: 1, deletedBookCount: 1 });
  });

  test("leaves a sandbox book alone while deleting the owner's resident book", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Items: [{ hashedSub: "owner1" }] });
    fixtureS3({
      owner1: [
        { bookId: "book-resident", retention: "resident" },
        { bookId: "book-sandbox", retention: "sandbox" },
      ],
    });

    const result = await handler({ now: "2026-09-20T00:00:00.000Z" });

    expect(deletedKeysFor("owner1", "book-resident").length).toBeGreaterThan(0);
    expect(deletedKeysFor("owner1", "book-sandbox")).toEqual([]);
    expect(result.deletedBookCount).toBe(1);
  });

  test("queries only owners whose bundle expired before the grace cutoff", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Items: [] });

    await handler({ now: "2026-09-20T00:00:00.000Z" });

    expect(mockDynamoSend).toHaveBeenCalledTimes(1);
    const command = mockDynamoSend.mock.calls[0][0];
    expect(command.params).toMatchObject({
      TableName: "test-bundle-table",
      IndexName: "bundleId-expiry-index",
      KeyConditionExpression: "bundleId = :bundleId AND expiry < :before",
      ExpressionAttributeValues: { ":bundleId": "resident", ":before": "2026-08-21T00:00:00.000Z" },
    });
  });

  test("honors a configured lapse grace period and bundle id", async () => {
    process.env.DIYA_GL_LAPSE_GRACE_DAYS = "10";
    process.env.DIYA_GL_BUNDLE_ID = "custom-books-bundle";
    mockDynamoSend.mockResolvedValueOnce({ Items: [] });

    await handler({ now: "2026-09-20T00:00:00.000Z" });

    const command = mockDynamoSend.mock.calls[0][0];
    expect(command.params).toMatchObject({
      ExpressionAttributeValues: { ":bundleId": "custom-books-bundle", ":before": "2026-09-10T00:00:00.000Z" },
    });
  });

  test("pages through the index and de-duplicates an owner seen on more than one page", async () => {
    mockDynamoSend
      .mockResolvedValueOnce({
        Items: [{ hashedSub: "owner1" }],
        LastEvaluatedKey: { bundleId: "resident", expiry: "a" },
      })
      .mockResolvedValueOnce({ Items: [{ hashedSub: "owner1" }, { hashedSub: "owner2" }] });
    fixtureS3({
      owner1: [{ bookId: "book-1", retention: "resident" }],
      owner2: [{ bookId: "book-2", retention: "resident" }],
    });

    const result = await handler({ now: "2026-09-20T00:00:00.000Z" });

    expect(mockDynamoSend).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ownerCount: 2, deletedBookCount: 2 });
    // owner1's book listing (Delimiter "/") is fetched exactly once despite appearing on both pages.
    const owner1Listings = mockS3Send.mock.calls
      .map(([command]) => command)
      .filter(
        (command) =>
          command.constructor.name === "ListObjectsV2Command" &&
          command.input.Delimiter === "/" &&
          command.input.Prefix === "users/owner1/books/",
      );
    expect(owner1Listings).toHaveLength(1);
  });
});
