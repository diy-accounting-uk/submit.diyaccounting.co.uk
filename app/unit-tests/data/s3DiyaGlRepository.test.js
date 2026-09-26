// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockS3Send = vi.fn();

vi.mock("@aws-sdk/client-s3", () => {
  class ListObjectsV2Command {
    constructor(input) {
      this.input = input;
      this.kind = "list";
    }
  }
  class CopyObjectCommand {
    constructor(input) {
      this.input = input;
      this.kind = "copy";
    }
  }
  class DeleteObjectsCommand {
    constructor(input) {
      this.input = input;
      this.kind = "deleteMany";
    }
  }
  class GetObjectCommand {
    constructor(input) {
      this.input = input;
      this.kind = "get";
    }
  }
  class PutObjectCommand {
    constructor(input) {
      this.input = input;
      this.kind = "put";
    }
  }
  class S3Client {
    send(command) {
      return mockS3Send(command);
    }
  }
  return { S3Client, ListObjectsV2Command, CopyObjectCommand, DeleteObjectsCommand, GetObjectCommand, PutObjectCommand };
});

const {
  moveBookToClient,
  BookNotFoundError,
  DestinationBookExistsError,
  isBookVisible,
  retagBookObjects,
  setOwnerBooksRetention,
  _resetS3Client,
} = await import("@app/data/s3DiyaGlRepository.js");
const { hashSub, _setTestSalt } = await import("../../services/subHasher.js");

const BOOK_ID = "11111111-2222-4333-8444-555555555555";
const CLIENT_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const PRACTICE_SUB = "practice-sub";

function notFoundError() {
  const error = new Error("not found");
  error.name = "NoSuchKey";
  return error;
}

describe("data/s3DiyaGlRepository isBookVisible", () => {
  const now = Date.parse("2026-06-15T00:00:00.000Z");

  test("is true for a resident book with no expiresAt", () => {
    expect(isBookVisible({ retention: "resident", expiresAt: null }, now)).toBe(true);
  });

  test("is true for a sandbox book whose expiresAt is still in the future", () => {
    expect(isBookVisible({ retention: "sandbox", expiresAt: "2026-06-16T00:00:00.000Z" }, now)).toBe(true);
  });

  test("is false for a sandbox book whose expiresAt has passed", () => {
    expect(isBookVisible({ retention: "sandbox", expiresAt: "2026-06-14T00:00:00.000Z" }, now)).toBe(false);
  });

  test("is true for a sandbox book with no expiresAt yet recorded", () => {
    expect(isBookVisible({ retention: "sandbox", expiresAt: null }, now)).toBe(true);
  });
});

describe("data/s3DiyaGlRepository moveBookToClient", () => {
  let sourcePrefix;
  let destinationPrefix;

  beforeEach(async () => {
    _resetS3Client();
    mockS3Send.mockReset();
    process.env.DIYA_GL_BUCKET_NAME = "test-diya-gl-bucket";
    _setTestSalt("test-salt");
    const hashedSub = hashSub(PRACTICE_SUB);
    sourcePrefix = `users/${hashedSub}/books/${BOOK_ID}/`;
    destinationPrefix = `users/${hashedSub}/clients/${CLIENT_ID}/books/${BOOK_ID}/`;
  });

  function queueSuccessfulMove() {
    mockS3Send.mockImplementation((command) => {
      if (command.kind === "get" && command.input.Key === `${destinationPrefix}metadata.json`) {
        // resolveOwnerPrefix / metadataExists on the destination: not found, so the move proceeds.
        return Promise.reject(notFoundError());
      }
      if (command.kind === "get" && command.input.Key === `${sourcePrefix}metadata.json`) {
        // resolveOwnerPrefix's own metadataExists probe on the source, via the current salt.
        return Promise.resolve({ Body: { transformToString: async () => "{}" }, ETag: '"meta-etag"' });
      }
      if (command.kind === "list") {
        return Promise.resolve({
          Contents: [
            { Key: `${sourcePrefix}metadata.json`, ETag: '"meta-etag"' },
            { Key: `${sourcePrefix}v1.zip`, ETag: '"v1-etag"' },
          ],
        });
      }
      if (command.kind === "copy") {
        const suffix = command.input.Key.slice(destinationPrefix.length);
        const etag = suffix === "metadata.json" ? '"meta-etag"' : '"v1-etag"';
        return Promise.resolve({ CopyObjectResult: { ETag: etag } });
      }
      if (command.kind === "deleteMany") {
        return Promise.resolve({});
      }
      throw new Error(`Unexpected command in test: ${command.kind} ${JSON.stringify(command.input)}`);
    });
  }

  test("copies every object then deletes the source, verifying each copy's ETag first", async () => {
    queueSuccessfulMove();

    const result = await moveBookToClient(PRACTICE_SUB, CLIENT_ID, BOOK_ID);

    expect(result).toEqual({ bookId: BOOK_ID, clientId: CLIENT_ID, movedObjectCount: 2 });

    const copyCommands = mockS3Send.mock.calls.map((call) => call[0]).filter((command) => command.kind === "copy");
    expect(copyCommands).toHaveLength(2);
    expect(copyCommands.map((command) => command.input.Key).sort()).toEqual(
      [`${destinationPrefix}metadata.json`, `${destinationPrefix}v1.zip`].sort(),
    );
    for (const command of copyCommands) {
      expect(command.input.Bucket).toBe("test-diya-gl-bucket");
      expect(command.input.CopySource).toMatch(/^test-diya-gl-bucket\/users\//);
    }

    const deleteCommand = mockS3Send.mock.calls.map((call) => call[0]).find((command) => command.kind === "deleteMany");
    expect(deleteCommand.input.Delete.Objects.map((object) => object.Key).sort()).toEqual(
      [`${sourcePrefix}metadata.json`, `${sourcePrefix}v1.zip`].sort(),
    );

    // Every copy must be issued, and verified, before the single delete call.
    const deleteIndex = mockS3Send.mock.calls.findIndex((call) => call[0].kind === "deleteMany");
    const lastCopyIndex = mockS3Send.mock.calls.map((call) => call[0].kind).lastIndexOf("copy");
    expect(deleteIndex).toBeGreaterThan(lastCopyIndex);
  });

  test("refuses when the destination already holds a book with this id", async () => {
    mockS3Send.mockImplementation((command) => {
      if (command.kind === "get" && command.input.Key === `${destinationPrefix}metadata.json`) {
        return Promise.resolve({ Body: { transformToString: async () => "{}" }, ETag: '"dest-etag"' });
      }
      if (command.kind === "get" && command.input.Key === `${sourcePrefix}metadata.json`) {
        return Promise.resolve({ Body: { transformToString: async () => "{}" }, ETag: '"meta-etag"' });
      }
      throw new Error(`Unexpected command in test: ${command.kind}`);
    });

    await expect(moveBookToClient(PRACTICE_SUB, CLIENT_ID, BOOK_ID)).rejects.toThrow(DestinationBookExistsError);
  });

  test("refuses when the practice has no such book of its own", async () => {
    mockS3Send.mockImplementation((command) => {
      if (command.kind === "get") {
        return Promise.reject(notFoundError());
      }
      if (command.kind === "list") {
        return Promise.resolve({ Contents: [] });
      }
      throw new Error(`Unexpected command in test: ${command.kind}`);
    });

    await expect(moveBookToClient(PRACTICE_SUB, CLIENT_ID, BOOK_ID)).rejects.toThrow(BookNotFoundError);
  });

  test("throws and deletes nothing when a copy's ETag does not match the source", async () => {
    mockS3Send.mockImplementation((command) => {
      if (command.kind === "get" && command.input.Key === `${destinationPrefix}metadata.json`) {
        return Promise.reject(notFoundError());
      }
      if (command.kind === "get" && command.input.Key === `${sourcePrefix}metadata.json`) {
        return Promise.resolve({ Body: { transformToString: async () => "{}" }, ETag: '"meta-etag"' });
      }
      if (command.kind === "list") {
        return Promise.resolve({ Contents: [{ Key: `${sourcePrefix}metadata.json`, ETag: '"meta-etag"' }] });
      }
      if (command.kind === "copy") {
        return Promise.resolve({ CopyObjectResult: { ETag: '"wrong-etag"' } });
      }
      throw new Error(`Unexpected command in test: ${command.kind}`);
    });

    await expect(moveBookToClient(PRACTICE_SUB, CLIENT_ID, BOOK_ID)).rejects.toThrow(/Copy verification failed/);

    const deleteCalled = mockS3Send.mock.calls.some((call) => call[0].kind === "deleteMany");
    expect(deleteCalled).toBe(false);
  });
});

describe("data/s3DiyaGlRepository retagBookObjects", () => {
  const OWNER_PREFIX = "owner-hash";
  const bookPrefix = `users/${OWNER_PREFIX}/books/${BOOK_ID}/`;

  beforeEach(() => {
    _resetS3Client();
    mockS3Send.mockReset();
    process.env.DIYA_GL_BUCKET_NAME = "test-diya-gl-bucket";
  });

  test("copies every object under the book's prefix onto itself with the new tag, across pages", async () => {
    const firstPage = [{ Key: `${bookPrefix}metadata.json` }, { Key: `${bookPrefix}v1.zip` }];
    const secondPage = [{ Key: `${bookPrefix}v2.zip` }];
    mockS3Send.mockImplementation((command) => {
      if (command.kind === "list") {
        return command.input.ContinuationToken
          ? Promise.resolve({ Contents: secondPage })
          : Promise.resolve({ Contents: firstPage, NextContinuationToken: "page-2" });
      }
      if (command.kind === "copy") {
        return Promise.resolve({ CopyObjectResult: { ETag: '"etag"' } });
      }
      throw new Error(`Unexpected command in test: ${command.kind}`);
    });

    const count = await retagBookObjects(OWNER_PREFIX, BOOK_ID, "sandbox");

    expect(count).toBe(3);
    const copyCommands = mockS3Send.mock.calls.map((call) => call[0]).filter((command) => command.kind === "copy");
    expect(copyCommands).toHaveLength(3);
    expect(copyCommands.map((command) => command.input.Key).sort()).toEqual(
      [`${bookPrefix}metadata.json`, `${bookPrefix}v1.zip`, `${bookPrefix}v2.zip`].sort(),
    );
    for (const command of copyCommands) {
      expect(command.input.Bucket).toBe("test-diya-gl-bucket");
      expect(command.input.CopySource).toBe(`test-diya-gl-bucket/${command.input.Key}`);
      expect(command.input.MetadataDirective).toBe("COPY");
      expect(command.input.TaggingDirective).toBe("REPLACE");
      expect(command.input.Tagging).toBe("retention=sandbox");
    }
  });

  test("retags nothing and issues no copy when the book has no objects", async () => {
    mockS3Send.mockImplementation((command) => {
      if (command.kind === "list") {
        return Promise.resolve({ Contents: [] });
      }
      throw new Error(`Unexpected command in test: ${command.kind}`);
    });

    const count = await retagBookObjects(OWNER_PREFIX, BOOK_ID, "resident");

    expect(count).toBe(0);
    expect(mockS3Send.mock.calls.some((call) => call[0].kind === "copy")).toBe(false);
  });
});

describe("data/s3DiyaGlRepository setOwnerBooksRetention", () => {
  const OWNER_PREFIX = "owner-hash";
  const booksPrefix = `users/${OWNER_PREFIX}/books/`;

  beforeEach(() => {
    _resetS3Client();
    mockS3Send.mockReset();
    process.env.DIYA_GL_BUCKET_NAME = "test-diya-gl-bucket";
  });

  function metadataGetResponse(metadata, etag = '"meta-etag"') {
    return { ETag: etag, Body: { transformToString: async () => JSON.stringify(metadata) } };
  }

  test("moves a resident book to sandbox: retags its objects and rewrites its metadata content", async () => {
    const metadata = { bookId: BOOK_ID, retention: "resident", expiresAt: null, latestVersion: 1 };
    const bookObjectPrefix = `${booksPrefix}${BOOK_ID}/`;
    mockS3Send.mockImplementation((command) => {
      if (command.kind === "list" && command.input.Delimiter === "/") {
        return Promise.resolve({ CommonPrefixes: [{ Prefix: bookObjectPrefix }] });
      }
      if (command.kind === "get" && command.input.Key === `${bookObjectPrefix}metadata.json`) {
        return Promise.resolve(metadataGetResponse(metadata));
      }
      if (command.kind === "list") {
        return Promise.resolve({ Contents: [{ Key: `${bookObjectPrefix}metadata.json` }, { Key: `${bookObjectPrefix}v1.zip` }] });
      }
      if (command.kind === "copy") {
        return Promise.resolve({ CopyObjectResult: { ETag: '"etag"' } });
      }
      if (command.kind === "put") {
        return Promise.resolve({ ETag: '"new-meta-etag"' });
      }
      throw new Error(`Unexpected command in test: ${command.kind} ${JSON.stringify(command.input)}`);
    });

    const expiresAt = "2026-08-01T00:00:00.000Z";
    const changed = await setOwnerBooksRetention(OWNER_PREFIX, "sandbox", { expiresAt });

    expect(changed).toEqual([{ bookId: BOOK_ID, objectCount: 2 }]);
    const putCommand = mockS3Send.mock.calls.map((call) => call[0]).find((command) => command.kind === "put");
    expect(putCommand.input.Key).toBe(`${bookObjectPrefix}metadata.json`);
    expect(putCommand.input.Tagging).toBe("retention=sandbox");
    const writtenBody = JSON.parse(putCommand.input.Body);
    expect(writtenBody).toEqual({ ...metadata, retention: "sandbox", expiresAt });
    expect(putCommand.input.IfMatch).toBe("meta-etag");
  });

  test("skips a book already on the target tier", async () => {
    const metadata = { bookId: BOOK_ID, retention: "sandbox", expiresAt: null, latestVersion: 1 };
    const bookObjectPrefix = `${booksPrefix}${BOOK_ID}/`;
    mockS3Send.mockImplementation((command) => {
      if (command.kind === "list" && command.input.Delimiter === "/") {
        return Promise.resolve({ CommonPrefixes: [{ Prefix: bookObjectPrefix }] });
      }
      if (command.kind === "get" && command.input.Key === `${bookObjectPrefix}metadata.json`) {
        return Promise.resolve(metadataGetResponse(metadata));
      }
      throw new Error(`Unexpected command in test: ${command.kind}`);
    });

    const changed = await setOwnerBooksRetention(OWNER_PREFIX, "sandbox", { expiresAt: "2026-08-01T00:00:00.000Z" });

    expect(changed).toEqual([]);
    expect(mockS3Send.mock.calls.some((call) => call[0].kind === "copy" || call[0].kind === "put")).toBe(false);
  });

  test("leaves a book's content alone when its metadata changed concurrently after the retag", async () => {
    const metadata = { bookId: BOOK_ID, retention: "resident", expiresAt: null, latestVersion: 1 };
    const bookObjectPrefix = `${booksPrefix}${BOOK_ID}/`;
    mockS3Send.mockImplementation((command) => {
      if (command.kind === "list" && command.input.Delimiter === "/") {
        return Promise.resolve({ CommonPrefixes: [{ Prefix: bookObjectPrefix }] });
      }
      if (command.kind === "get" && command.input.Key === `${bookObjectPrefix}metadata.json`) {
        return Promise.resolve(metadataGetResponse(metadata));
      }
      if (command.kind === "list") {
        return Promise.resolve({ Contents: [{ Key: `${bookObjectPrefix}metadata.json` }] });
      }
      if (command.kind === "copy") {
        return Promise.resolve({ CopyObjectResult: { ETag: '"etag"' } });
      }
      if (command.kind === "put") {
        const error = new Error("precondition failed");
        error.name = "PreconditionFailed";
        return Promise.reject(error);
      }
      throw new Error(`Unexpected command in test: ${command.kind}`);
    });

    const changed = await setOwnerBooksRetention(OWNER_PREFIX, "sandbox", { expiresAt: "2026-08-01T00:00:00.000Z" });

    expect(changed).toEqual([]);
  });
});
