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
  class S3Client {
    send(command) {
      return mockS3Send(command);
    }
  }
  return { S3Client, ListObjectsV2Command, CopyObjectCommand, DeleteObjectsCommand, GetObjectCommand };
});

const { moveBookToClient, BookNotFoundError, DestinationBookExistsError, _resetS3Client } = await import("@app/data/s3DiyaGlRepository.js");
const { hashSub, _setTestSalt } = await import("../../services/subHasher.js");

const BOOK_ID = "11111111-2222-4333-8444-555555555555";
const CLIENT_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const PRACTICE_SUB = "practice-sub";

function notFoundError() {
  const error = new Error("not found");
  error.name = "NoSuchKey";
  return error;
}

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
