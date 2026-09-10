// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildJwtAuthorizerContext, buildLambdaEvent } from "../../test-helpers/eventBuilders.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ZIP_BASE64 = fs.readFileSync(path.join(__dirname, "../../../fixtures/books/diya-gl-example.zip")).toString("base64");

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

vi.mock("@app/data/dynamoDbBundleRepository.js", () => ({
  getUserBundles: vi.fn().mockResolvedValue([]),
}));

const { ingestHandler: diyaGlListGet } = await import("../../functions/diyaGl/diyaGlListGet.js");
const { ingestHandler: diyaGlVersionGet } = await import("../../functions/diyaGl/diyaGlVersionGet.js");
const { ingestHandler: diyaGlPut } = await import("../../functions/diyaGl/diyaGlPut.js");
const { ingestHandler: diyaGlDelete } = await import("../../functions/diyaGl/diyaGlDelete.js");
const { _setTestSalt } = await import("../../services/subHasher.js");

const ALLOWED_ORIGIN = "https://spreadsheets.diyaccounting.co.uk";
const DISALLOWED_ORIGIN = "https://evil.example";
const BOOK_ID = "11111111-2222-4333-8444-555555555555";
const MALFORMED_BOOK_ID = "not-a-book-id";

function putBody(overrides = {}) {
  return {
    title: "Precision Code Ltd",
    product: "ltd",
    periodCoveredStart: "2025-04-01",
    periodCoveredEnd: "2026-03-31",
    provenance: {},
    zipBase64: FIXTURE_ZIP_BASE64,
    ...overrides,
  };
}

/**
 * Each route with one client mistake it answers 4xx to, and one healthy request that fails in
 * storage for a 5xx. The 5xx cases all reach S3, which the failing mock below makes throw.
 */
const routes = [
  {
    name: "GET /api/v1/books",
    handler: diyaGlListGet,
    clientError: (origin) => buildLambdaEvent({ method: "GET", path: "/api/v1/books", headers: { origin }, authorizer: {} }),
    expectedClientStatus: 401,
    storageFailure: (origin) =>
      buildLambdaEvent({
        method: "GET",
        path: "/api/v1/books",
        headers: { origin },
        authorizer: buildJwtAuthorizerContext("test-sub"),
      }),
  },
  {
    name: "GET /api/v1/books/{bookId}/versions/{version}",
    handler: diyaGlVersionGet,
    clientError: (origin) =>
      buildLambdaEvent({
        method: "GET",
        path: `/api/v1/books/${MALFORMED_BOOK_ID}/versions/latest`,
        pathParameters: { bookId: MALFORMED_BOOK_ID, version: "latest" },
        headers: { origin },
        authorizer: buildJwtAuthorizerContext("test-sub"),
      }),
    expectedClientStatus: 400,
    storageFailure: (origin) =>
      buildLambdaEvent({
        method: "GET",
        path: `/api/v1/books/${BOOK_ID}/versions/latest`,
        pathParameters: { bookId: BOOK_ID, version: "latest" },
        headers: { origin },
        authorizer: buildJwtAuthorizerContext("test-sub"),
      }),
  },
  {
    name: "PUT /api/v1/books/{bookId}",
    handler: diyaGlPut,
    clientError: (origin) =>
      buildLambdaEvent({
        method: "PUT",
        path: `/api/v1/books/${BOOK_ID}`,
        pathParameters: { bookId: BOOK_ID },
        headers: { origin },
        body: putBody({ product: "not-a-product" }),
        authorizer: buildJwtAuthorizerContext("test-sub"),
      }),
    expectedClientStatus: 400,
    storageFailure: (origin) =>
      buildLambdaEvent({
        method: "PUT",
        path: `/api/v1/books/${BOOK_ID}`,
        pathParameters: { bookId: BOOK_ID },
        headers: { origin },
        body: putBody(),
        authorizer: buildJwtAuthorizerContext("test-sub"),
      }),
  },
  {
    name: "DELETE /api/v1/books/{bookId}",
    handler: diyaGlDelete,
    clientError: (origin) =>
      buildLambdaEvent({
        method: "DELETE",
        path: `/api/v1/books/${MALFORMED_BOOK_ID}`,
        pathParameters: { bookId: MALFORMED_BOOK_ID },
        headers: { origin },
        authorizer: buildJwtAuthorizerContext("test-sub"),
      }),
    expectedClientStatus: 400,
    storageFailure: (origin) =>
      buildLambdaEvent({
        method: "DELETE",
        path: `/api/v1/books/${BOOK_ID}`,
        pathParameters: { bookId: BOOK_ID },
        headers: { origin },
        authorizer: buildJwtAuthorizerContext("test-sub"),
      }),
  },
];

describe("DIYA-GL storage error responses", () => {
  beforeEach(() => {
    mockS3Send.mockReset();
    process.env.DIYA_GL_BUCKET_NAME = "test-books-bucket";
    process.env.DIYA_GL_ALLOWED_ORIGINS = ALLOWED_ORIGIN;
    process.env.DIYA_GL_MAX_BYTES = "2097152";
    process.env.DIYA_GL_MAX_PER_USER = "20";
    process.env.DIYA_GL_VERSIONS_KEPT = "30";
    delete process.env.DIYA_GL_ENTITLEMENT_ENFORCED;
    _setTestSalt("test-salt");
  });

  for (const route of routes) {
    describe(route.name, () => {
      test(`answers ${route.expectedClientStatus} to an allow-listed origin with the origin echoed back`, async () => {
        const result = await route.handler(route.clientError(ALLOWED_ORIGIN));

        expect(result.statusCode).toBe(route.expectedClientStatus);
        expect(result.headers["Access-Control-Allow-Origin"]).toBe(ALLOWED_ORIGIN);
        expect(result.headers.Vary).toBe("Origin");
      });

      test(`answers ${route.expectedClientStatus} to an unlisted origin with no CORS header`, async () => {
        const result = await route.handler(route.clientError(DISALLOWED_ORIGIN));

        expect(result.statusCode).toBe(route.expectedClientStatus);
        expect(result.headers["Access-Control-Allow-Origin"]).toBeUndefined();
      });

      test("answers 500 to an allow-listed origin with the origin echoed back", async () => {
        mockS3Send.mockImplementation(() => {
          throw new Error("S3 is unavailable");
        });

        const result = await route.handler(route.storageFailure(ALLOWED_ORIGIN));

        expect(result.statusCode).toBe(500);
        expect(result.headers["Access-Control-Allow-Origin"]).toBe(ALLOWED_ORIGIN);
        expect(result.headers.Vary).toBe("Origin");
      });

      test("answers 500 to an unlisted origin with no CORS header", async () => {
        mockS3Send.mockImplementation(() => {
          throw new Error("S3 is unavailable");
        });

        const result = await route.handler(route.storageFailure(DISALLOWED_ORIGIN));

        expect(result.statusCode).toBe(500);
        expect(result.headers["Access-Control-Allow-Origin"]).toBeUndefined();
      });
    });
  }

  test("a book write whose zip cannot be read still answers with the CORS header", async () => {
    const event = buildLambdaEvent({
      method: "PUT",
      path: `/api/v1/books/${BOOK_ID}`,
      pathParameters: { bookId: BOOK_ID },
      headers: { origin: ALLOWED_ORIGIN },
      body: putBody(),
      authorizer: buildJwtAuthorizerContext("test-sub"),
    });
    // A throw from the zip reader used to escape the handler entirely, leaving API Gateway to
    // answer "Internal Server Error" with no CORS header, which the browser reports as a CORS
    // failure rather than as the 500 it is.
    vi.spyOn(Buffer, "from").mockImplementationOnce(() => {
      throw new Error("cannot decode");
    });

    const result = await diyaGlPut(event);

    expect(result.statusCode).toBe(500);
    expect(result.headers["Access-Control-Allow-Origin"]).toBe(ALLOWED_ORIGIN);
    expect(JSON.parse(result.body).code).toBe("storage-error");
  });
});
