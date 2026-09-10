// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildJwtAuthorizerContext, buildLambdaEvent } from "../../test-helpers/eventBuilders.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ZIP_BASE64 = fs.readFileSync(path.join(__dirname, "../../../fixtures/books/diya-gl-example.zip")).toString("base64");

/**
 * Builds a minimal stored-method (uncompressed) zip with the given member names, for exercising
 * isDiyaGlPackage against member sets the checked-in fixture doesn't cover. CRC correctness
 * doesn't matter here: listZipMemberNames never inflates a member, it only reads names from the
 * central directory.
 */
function buildStoredZip(memberNames) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const name of memberNames) {
    const nameBuf = Buffer.from(name, "utf8");
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localParts.push(localHeader, nameBuf);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length;
  }

  const centralDirStart = offset;
  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(memberNames.length, 8);
  eocd.writeUInt16LE(memberNames.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(centralDirStart, 16);

  return Buffer.concat([...localParts, centralDir, eocd]);
}

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
      this.kind = "get";
    }
  }
  class PutObjectCommand {
    constructor(input) {
      this.input = input;
      this.kind = "put";
    }
  }
  class DeleteObjectCommand {
    constructor(input) {
      this.input = input;
      this.kind = "delete";
    }
  }
  class ListObjectsV2Command {
    constructor(input) {
      this.input = input;
      this.kind = "list";
    }
  }
  return { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command };
});

vi.mock("@app/data/dynamoDbBundleRepository.js", () => ({
  getUserBundles: vi.fn().mockResolvedValue([]),
}));

const { ingestHandler } = await import("../../functions/books/booksPut.js");
const { _setTestSalt, _clearSalt, hashSub } = await import("../../services/subHasher.js");

const BOOK_ID = "11111111-2222-4333-8444-555555555555";

function jsonBody(object) {
  return { transformToString: async () => JSON.stringify(object) };
}

function buildPutEvent({ sub = "test-sub", bookId = BOOK_ID, body, ifMatch } = {}) {
  const requestBody = {
    title: "Precision Code Ltd",
    product: "ltd",
    periodCoveredStart: "2025-04-01",
    periodCoveredEnd: "2026-03-31",
    provenance: { formatVersion: "1", engineVersion: "1.2.3", taxDataHash: null, templateHash: null, reconciledCommit: null },
    zipBase64: FIXTURE_ZIP_BASE64,
    ...body,
  };
  return buildLambdaEvent({
    method: "PUT",
    path: `/api/v1/books/${bookId}`,
    pathParameters: { bookId },
    headers: ifMatch !== undefined ? { "if-match": ifMatch } : {},
    body: requestBody,
    authorizer: buildJwtAuthorizerContext(sub),
  });
}

function metadataKeyFor(sub, bookId) {
  return `users/${hashSub(sub)}/books/${bookId}/metadata.json`;
}

function versionKeyFor(sub, bookId, version) {
  return `users/${hashSub(sub)}/books/${bookId}/v${version}.zip`;
}

describe("booksPut", () => {
  beforeEach(() => {
    mockS3Send.mockReset();
    process.env.BOOKS_BUCKET_NAME = "test-books-bucket";
    process.env.BOOKS_ALLOWED_ORIGINS = "https://spreadsheets.diyaccounting.co.uk";
    process.env.BOOKS_MAX_BYTES = "2097152";
    process.env.BOOKS_MAX_PER_USER = "20";
    process.env.BOOKS_VERSIONS_KEPT = "30";
    delete process.env.BOOKS_ENTITLEMENT_ENFORCED;
    _setTestSalt("test-salt");
  });

  test("creates version 1 for a new book with no If-Match", async () => {
    const metaKey = metadataKeyFor("test-sub", BOOK_ID);
    const v1Key = versionKeyFor("test-sub", BOOK_ID, 1);
    mockS3Send.mockImplementation((command) => {
      if (command.kind === "get" && command.input.Key === metaKey) {
        const error = new Error("not found");
        error.name = "NoSuchKey";
        throw error;
      }
      if (command.kind === "list") {
        return { CommonPrefixes: [] };
      }
      if (command.kind === "put" && command.input.Key === v1Key) {
        return { ETag: '"zip-v1-etag"' };
      }
      if (command.kind === "put" && command.input.Key === metaKey) {
        return { ETag: '"meta-v1-etag"' };
      }
      throw new Error(`Unexpected command ${command.kind} ${command.input.Key}`);
    });

    const result = await ingestHandler(buildPutEvent({}));

    expect(result.statusCode).toBe(200);
    expect(result.headers.ETag).toBe('"zip-v1-etag"');
    const body = JSON.parse(result.body);
    expect(body.metadata.latestVersion).toBe(1);
    expect(body.metadata.createdAt).toBeTruthy();
    expect(body.metadata.entitlementAtPut.reason).toBe("not-enforced");
  });

  test("writes the next version when If-Match matches the current latestETag", async () => {
    const metaKey = metadataKeyFor("test-sub", BOOK_ID);
    const v3Key = versionKeyFor("test-sub", BOOK_ID, 3);
    const existingMetadata = {
      bookId: BOOK_ID,
      latestVersion: 2,
      latestETag: "abc",
      versions: [
        { version: 1, etag: "v1etag", size: 10, createdAt: "2026-01-01T00:00:00.000Z" },
        { version: 2, etag: "abc", size: 12, createdAt: "2026-02-01T00:00:00.000Z" },
      ],
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    mockS3Send.mockImplementation((command) => {
      if (command.kind === "get" && command.input.Key === metaKey) {
        return { ETag: '"meta-etag"', Body: jsonBody(existingMetadata) };
      }
      if (command.kind === "put" && command.input.Key === v3Key) {
        return { ETag: '"zip-v3-etag"' };
      }
      if (command.kind === "put" && command.input.Key === metaKey) {
        return { ETag: '"meta-v2-etag"' };
      }
      throw new Error(`Unexpected command ${command.kind} ${command.input.Key}`);
    });

    const result = await ingestHandler(buildPutEvent({ ifMatch: "abc" }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.metadata.latestVersion).toBe(3);
    expect(body.metadata.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  test("412s on a stale If-Match, carrying the true latestETag", async () => {
    const metaKey = metadataKeyFor("test-sub", BOOK_ID);
    const existingMetadata = { bookId: BOOK_ID, latestVersion: 2, latestETag: "abc", versions: [] };
    mockS3Send.mockImplementation((command) => {
      if (command.kind === "get" && command.input.Key === metaKey) {
        return { ETag: '"meta-etag"', Body: jsonBody(existingMetadata) };
      }
      throw new Error(`Unexpected command ${command.kind}`);
    });

    const result = await ingestHandler(buildPutEvent({ ifMatch: "stale" }));

    expect(result.statusCode).toBe(412);
    const body = JSON.parse(result.body);
    expect(body.code).toBe("etag-mismatch");
    expect(body.latestETag).toBe("abc");
  });

  test("412s an existing book put with no If-Match header", async () => {
    const metaKey = metadataKeyFor("test-sub", BOOK_ID);
    const existingMetadata = { bookId: BOOK_ID, latestVersion: 1, latestETag: "abc", versions: [] };
    mockS3Send.mockImplementation((command) => {
      if (command.kind === "get" && command.input.Key === metaKey) {
        return { ETag: '"meta-etag"', Body: jsonBody(existingMetadata) };
      }
      throw new Error(`Unexpected command ${command.kind}`);
    });

    const result = await ingestHandler(buildPutEvent({}));

    expect(result.statusCode).toBe(412);
    expect(JSON.parse(result.body).code).toBe("etag-mismatch");
  });

  test("412s a new book put that carries an If-Match header", async () => {
    const metaKey = metadataKeyFor("test-sub", BOOK_ID);
    mockS3Send.mockImplementation((command) => {
      if (command.kind === "get" && command.input.Key === metaKey) {
        const error = new Error("not found");
        error.name = "NoSuchKey";
        throw error;
      }
      if (command.kind === "list") {
        return { CommonPrefixes: [] };
      }
      throw new Error(`Unexpected command ${command.kind}`);
    });

    const result = await ingestHandler(buildPutEvent({ ifMatch: "anything" }));

    expect(result.statusCode).toBe(412);
    expect(JSON.parse(result.body).code).toBe("etag-mismatch");
  });

  test("413s an oversized zip with no S3 write", async () => {
    process.env.BOOKS_MAX_BYTES = "10";

    const result = await ingestHandler(buildPutEvent({}));

    expect(result.statusCode).toBe(413);
    expect(JSON.parse(result.body).code).toBe("book-too-large");
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  test("422s a package missing required members", async () => {
    const incompleteZipBase64 = buildStoredZip(["book.toml", "report.json"]).toString("base64");

    const result = await ingestHandler(buildPutEvent({ body: { zipBase64: incompleteZipBase64 } }));

    expect(result.statusCode).toBe(422);
    expect(JSON.parse(result.body).code).toBe("not-a-diya-gl-package");
  });

  test("422s random bytes that aren't a zip at all", async () => {
    const randomBytes = Buffer.from("just some random bytes, not a zip file structure at all here").toString("base64");

    const result = await ingestHandler(buildPutEvent({ body: { zipBase64: randomBytes } }));

    expect(result.statusCode).toBe(422);
    expect(JSON.parse(result.body).code).toBe("not-a-diya-gl-package");
  });

  test("403s subscription-required when entitlement is enforced and unmet, with no S3 write", async () => {
    process.env.BOOKS_ENTITLEMENT_ENFORCED = "true";

    const result = await ingestHandler(buildPutEvent({}));

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).code).toBe("subscription-required");
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  test("403s book-limit-reached at 20 existing books for a new book", async () => {
    const metaKey = metadataKeyFor("test-sub", BOOK_ID);
    const twentyBookIds = Array.from({ length: 20 }, (_, i) => `book-${i}`);
    mockS3Send.mockImplementation((command) => {
      if (command.kind === "get" && command.input.Key === metaKey) {
        const error = new Error("not found");
        error.name = "NoSuchKey";
        throw error;
      }
      if (command.kind === "get") {
        // One of the 20 existing books' own metadata reads, made by listBooks' per-book count.
        return { ETag: '"etag"', Body: jsonBody({ bookId: "existing", updatedAt: "2026-01-01T00:00:00.000Z" }) };
      }
      if (command.kind === "list") {
        const prefix = command.input.Prefix;
        return { CommonPrefixes: twentyBookIds.map((id) => ({ Prefix: `${prefix}${id}/` })) };
      }
      throw new Error(`Unexpected command ${command.kind}`);
    });

    const result = await ingestHandler(buildPutEvent({}));

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).code).toBe("book-limit-reached");
  });

  test("400s a bookId that is not a UUID, with no S3 call", async () => {
    const result = await ingestHandler(buildPutEvent({ bookId: "../../other" }));

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).code).toBe("invalid-book-id");
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  test("prunes the oldest version beyond 30 kept, keeping versions at 30 and latestVersion climbing", async () => {
    process.env.BOOKS_VERSIONS_KEPT = "30";
    const metaKey = metadataKeyFor("test-sub", BOOK_ID);
    const thirtyVersions = Array.from({ length: 30 }, (_, i) => ({
      version: i + 1,
      etag: `etag-${i + 1}`,
      size: 100,
      createdAt: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
    }));
    const existingMetadata = { bookId: BOOK_ID, latestVersion: 30, latestETag: "etag-30", versions: thirtyVersions, createdAt: "2026-01-01T00:00:00.000Z" };
    const v31Key = versionKeyFor("test-sub", BOOK_ID, 31);
    const v1Key = versionKeyFor("test-sub", BOOK_ID, 1);
    let deletedKey = null;

    mockS3Send.mockImplementation((command) => {
      if (command.kind === "get" && command.input.Key === metaKey) {
        return { ETag: '"meta-etag"', Body: jsonBody(existingMetadata) };
      }
      if (command.kind === "put" && command.input.Key === v31Key) {
        return { ETag: '"zip-v31-etag"' };
      }
      if (command.kind === "delete" && command.input.Key === v1Key) {
        deletedKey = command.input.Key;
        return {};
      }
      if (command.kind === "put" && command.input.Key === metaKey) {
        return { ETag: '"meta-v2-etag"' };
      }
      throw new Error(`Unexpected command ${command.kind} ${command.input.Key}`);
    });

    const result = await ingestHandler(buildPutEvent({ ifMatch: "etag-30" }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.metadata.latestVersion).toBe(31);
    expect(body.metadata.versions).toHaveLength(30);
    expect(body.metadata.versions[0].version).toBe(2);
    expect(deletedKey).toBe(v1Key);
  });

  test("retries a metadata write race once, then succeeds", async () => {
    const metaKey = metadataKeyFor("test-sub", BOOK_ID);
    const v1Key = versionKeyFor("test-sub", BOOK_ID, 1);
    const v2Key = versionKeyFor("test-sub", BOOK_ID, 2);
    let getCallCount = 0;
    let metaPutCallCount = 0;

    mockS3Send.mockImplementation((command) => {
      if (command.kind === "get" && command.input.Key === metaKey) {
        getCallCount += 1;
        // Calls 1 and 2 are resolveOwnerPrefix's own existence probe and the handler's initial
        // read, both before any write is attempted: the book truly doesn't exist yet. Call 3 is
        // the retry's re-read after the race, by which point another writer has created v1.
        if (getCallCount <= 2) {
          const error = new Error("not found");
          error.name = "NoSuchKey";
          throw error;
        }
        return {
          ETag: '"meta-etag-after-race"',
          Body: jsonBody({ bookId: BOOK_ID, latestVersion: 1, latestETag: "zip-v1-etag", versions: [{ version: 1, etag: "zip-v1-etag", size: 5, createdAt: "2026-01-01T00:00:00.000Z" }], createdAt: "2026-01-01T00:00:00.000Z" }),
        };
      }
      if (command.kind === "list") {
        return { CommonPrefixes: [] };
      }
      if (command.kind === "put" && command.input.Key === v1Key) {
        return { ETag: '"zip-v1-etag"' };
      }
      if (command.kind === "put" && command.input.Key === v2Key) {
        return { ETag: '"zip-v2-etag"' };
      }
      if (command.kind === "put" && command.input.Key === metaKey) {
        metaPutCallCount += 1;
        if (metaPutCallCount === 1) {
          const error = new Error("Precondition Failed");
          error.name = "PreconditionFailed";
          throw error;
        }
        return { ETag: '"meta-etag-2"' };
      }
      throw new Error(`Unexpected command ${command.kind} ${command.input.Key}`);
    });

    const result = await ingestHandler(buildPutEvent({}));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.metadata.latestVersion).toBe(2);
  });

  test("gives up with 409 write-conflict when both attempts race", async () => {
    const metaKey = metadataKeyFor("test-sub", BOOK_ID);
    mockS3Send.mockImplementation((command) => {
      if (command.kind === "get" && command.input.Key === metaKey) {
        const error = new Error("not found");
        error.name = "NoSuchKey";
        throw error;
      }
      if (command.kind === "list") {
        return { CommonPrefixes: [] };
      }
      if (command.kind === "put" && command.input.Key.endsWith(".zip")) {
        const error = new Error("Precondition Failed");
        error.name = "PreconditionFailed";
        throw error;
      }
      throw new Error(`Unexpected command ${command.kind} ${command.input.Key}`);
    });

    const result = await ingestHandler(buildPutEvent({}));

    expect(result.statusCode).toBe(409);
    expect(JSON.parse(result.body).code).toBe("write-conflict");
  });

  test("rejects an unauthenticated call", async () => {
    const event = buildLambdaEvent({
      method: "PUT",
      path: `/api/v1/books/${BOOK_ID}`,
      pathParameters: { bookId: BOOK_ID },
      body: { title: "x", product: "ltd", zipBase64: FIXTURE_ZIP_BASE64, provenance: {} },
      authorizer: {},
    });

    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(401);
  });

  test("answers an OPTIONS preflight without a token", async () => {
    const event = { requestContext: { http: { method: "OPTIONS" } }, headers: { origin: "https://spreadsheets.diyaccounting.co.uk" } };

    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(204);
    expect(result.headers["Access-Control-Allow-Origin"]).toBe("https://spreadsheets.diyaccounting.co.uk");
  });
});
