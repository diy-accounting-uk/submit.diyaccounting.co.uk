// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/system-tests/diyaGlStorage.system.test.js
//
// Drives all four DIYA-GL storage handlers in sequence against an in-memory fake S3 that enforces
// the same conditional-write semantics (IfMatch/IfNoneMatch -> PreconditionFailed) real S3 does,
// so the optimistic-concurrency path is exercised end to end rather than through per-call mocks.

import { describe, test, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildJwtAuthorizerContext, buildLambdaEvent } from "../test-helpers/eventBuilders.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ZIP_BASE64 = fs.readFileSync(path.join(__dirname, "../../fixtures/books/diya-gl-example.zip")).toString("base64");

class PreconditionFailedError extends Error {
  constructor() {
    super("At least one of the pre-conditions you specified did not hold");
    this.name = "PreconditionFailed";
  }
}

class NoSuchKeyError extends Error {
  constructor() {
    super("The specified key does not exist");
    this.name = "NoSuchKey";
  }
}

/** A minimal in-memory stand-in for the subset of S3 the DIYA-GL repository uses. */
class FakeBucket {
  constructor() {
    this.objects = new Map(); // Key -> { body: Buffer, etag: string }
    this.etagCounter = 0;
  }

  nextETag() {
    // No trailing "-<digits>": normaliseETag strips that as a real multipart-upload suffix, and
    // a hyphen-then-counter format here would collide with it.
    this.etagCounter += 1;
    return `fakeetag${this.etagCounter}`;
  }

  getObject(key) {
    const object = this.objects.get(key);
    if (!object) throw new NoSuchKeyError();
    return object;
  }

  putObject(key, body, { ifMatch, ifNoneMatch } = {}) {
    const existing = this.objects.get(key);
    if (ifNoneMatch === "*" && existing) throw new PreconditionFailedError();
    if (ifMatch && (!existing || existing.etag !== ifMatch)) throw new PreconditionFailedError();
    const etag = this.nextETag();
    this.objects.set(key, { body, etag });
    return etag;
  }

  deleteObject(key) {
    this.objects.delete(key);
  }

  listKeys(prefix) {
    return [...this.objects.keys()].filter((key) => key.startsWith(prefix));
  }
}

const fakeBucket = new FakeBucket();

vi.mock("@aws-sdk/client-s3", () => {
  class S3Client {
    async send(command) {
      const name = command.constructor.name;
      if (name === "GetObjectCommand") {
        const object = fakeBucket.getObject(command.input.Key);
        return {
          ETag: `"${object.etag}"`,
          Body: {
            transformToString: async () => object.body.toString("utf8"),
            transformToByteArray: async () => new Uint8Array(object.body),
          },
        };
      }
      if (name === "PutObjectCommand") {
        const body = Buffer.isBuffer(command.input.Body) ? command.input.Body : Buffer.from(command.input.Body);
        const etag = fakeBucket.putObject(command.input.Key, body, {
          ifMatch: command.input.IfMatch,
          ifNoneMatch: command.input.IfNoneMatch,
        });
        return { ETag: `"${etag}"` };
      }
      if (name === "DeleteObjectCommand") {
        fakeBucket.deleteObject(command.input.Key);
        return {};
      }
      if (name === "DeleteObjectsCommand") {
        for (const object of command.input.Delete.Objects) {
          fakeBucket.deleteObject(object.Key);
        }
        return { Deleted: command.input.Delete.Objects };
      }
      if (name === "ListObjectsV2Command") {
        const prefix = command.input.Prefix;
        const keys = fakeBucket.listKeys(prefix);
        if (command.input.Delimiter) {
          const childPrefixes = new Set();
          for (const key of keys) {
            const rest = key.slice(prefix.length);
            const slashIndex = rest.indexOf(command.input.Delimiter);
            if (slashIndex >= 0) {
              childPrefixes.add(prefix + rest.slice(0, slashIndex + 1));
            }
          }
          return { CommonPrefixes: [...childPrefixes].map((Prefix) => ({ Prefix })) };
        }
        return { Contents: keys.map((Key) => ({ Key })) };
      }
      throw new Error(`FakeBucket: unsupported command ${name}`);
    }
  }
  class GetObjectCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class PutObjectCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class DeleteObjectCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class DeleteObjectsCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class ListObjectsV2Command {
    constructor(input) {
      this.input = input;
    }
  }
  return { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command };
});

const { ingestHandler: booksListGet } = await import("../functions/books/booksListGet.js");
const { ingestHandler: booksVersionGet } = await import("../functions/books/booksVersionGet.js");
const { ingestHandler: booksPut } = await import("../functions/books/booksPut.js");
const { ingestHandler: booksDelete } = await import("../functions/books/booksDelete.js");

const BOOK_ID = "11111111-2222-4333-8444-555555555555";
const SUB = "system-test-books-user";

function buildEvent({ method, path: urlPath, pathParameters, headers = {}, body }) {
  return buildLambdaEvent({
    method,
    path: urlPath,
    pathParameters,
    headers,
    body,
    authorizer: buildJwtAuthorizerContext(SUB),
  });
}

function putBody(overrides = {}) {
  return {
    title: "Precision Code Ltd",
    product: "ltd",
    periodCoveredStart: "2025-04-01",
    periodCoveredEnd: "2026-03-31",
    provenance: { formatVersion: "1", engineVersion: "1.0.0", taxDataHash: null, templateHash: null, reconciledCommit: null },
    zipBase64: FIXTURE_ZIP_BASE64,
    ...overrides,
  };
}

describe("System: DIYA-GL storage end to end", () => {
  beforeEach(() => {
    fakeBucket.objects.clear();
    process.env.BOOKS_BUCKET_NAME = "system-test-books-bucket";
    process.env.BOOKS_ALLOWED_ORIGINS = "https://spreadsheets.diyaccounting.co.uk";
    process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"system-test-salt"}}';
    delete process.env.BOOKS_ENTITLEMENT_ENFORCED;
  });

  test("create, read, put-with-etag, stale-etag-conflict, then delete", async () => {
    // 1. Create the book (no If-Match: it doesn't exist yet).
    const createResult = await booksPut(
      buildEvent({ method: "PUT", path: `/api/v1/books/${BOOK_ID}`, pathParameters: { bookId: BOOK_ID }, body: putBody() }),
    );
    expect(createResult.statusCode).toBe(200);
    const created = JSON.parse(createResult.body);
    expect(created.metadata.latestVersion).toBe(1);
    const firstETag = created.metadata.latestETag;

    // 2. List: the new book shows up.
    const listResult = await booksListGet(buildEvent({ method: "GET", path: "/api/v1/books" }));
    expect(listResult.statusCode).toBe(200);
    expect(JSON.parse(listResult.body).books.map((b) => b.bookId)).toContain(BOOK_ID);

    // 3. Read latest: bytes round-trip.
    const readResult = await booksVersionGet(
      buildEvent({
        method: "GET",
        path: `/api/v1/books/${BOOK_ID}/versions/latest`,
        pathParameters: { bookId: BOOK_ID, version: "latest" },
      }),
    );
    expect(readResult.statusCode).toBe(200);
    const read = JSON.parse(readResult.body);
    expect(read.zipBase64).toBe(FIXTURE_ZIP_BASE64);
    expect(read.etag).toBe(firstETag);

    // 4. Put again with the correct If-Match: writes version 2.
    const secondPutResult = await booksPut(
      buildEvent({
        method: "PUT",
        path: `/api/v1/books/${BOOK_ID}`,
        pathParameters: { bookId: BOOK_ID },
        headers: { "if-match": firstETag },
        body: putBody({ title: "Precision Code Ltd (updated)" }),
      }),
    );
    expect(secondPutResult.statusCode).toBe(200);
    expect(JSON.parse(secondPutResult.body).metadata.latestVersion).toBe(2);

    // 5. Put with the now-stale first ETag: 412, carrying the true latest ETag and version.
    const staleResult = await booksPut(
      buildEvent({
        method: "PUT",
        path: `/api/v1/books/${BOOK_ID}`,
        pathParameters: { bookId: BOOK_ID },
        headers: { "if-match": firstETag },
        body: putBody(),
      }),
    );
    expect(staleResult.statusCode).toBe(412);
    const staleBody = JSON.parse(staleResult.body);
    expect(staleBody.code).toBe("etag-mismatch");
    expect(staleBody.latestVersion).toBe(2);

    // 6. Delete: removes every object.
    const deleteResult = await booksDelete(
      buildEvent({ method: "DELETE", path: `/api/v1/books/${BOOK_ID}`, pathParameters: { bookId: BOOK_ID } }),
    );
    expect(deleteResult.statusCode).toBe(200);
    expect(JSON.parse(deleteResult.body).deletedObjects).toBeGreaterThan(0);

    // 7. Confirmed gone: a read now 404s.
    const afterDeleteResult = await booksVersionGet(
      buildEvent({
        method: "GET",
        path: `/api/v1/books/${BOOK_ID}/versions/latest`,
        pathParameters: { bookId: BOOK_ID, version: "latest" },
      }),
    );
    expect(afterDeleteResult.statusCode).toBe(404);
  });
});
