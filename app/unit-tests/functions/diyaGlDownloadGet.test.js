// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, beforeEach, vi } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildJwtAuthorizerContext, buildLambdaEvent } from "../../test-helpers/eventBuilders.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// A DIYA-GL zip as the storage route holds one: the Precision Code book with its report.
async function storedZipOf(dir) {
  const { loadDiyaGlData } = await import("@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-loader.js");
  const { writeDiyaGlZip } = await import("@diy-accounting-uk/diya-gl/dist/app/lib/diya-gl-interchange.js");
  const { buildFileReportDocument } = await import("@diy-accounting-uk/diya-gl/dist/app/bin/export.js");
  const { productModule } = await import("@diy-accounting-uk/diya-gl/dist/app/lib/products.js");
  const { book, lines } = loadDiyaGlData(dir);
  const report = buildFileReportDocument(book, lines, "ltd", productModule("ltd"));
  return Buffer.from(await writeDiyaGlZip({ book, lines, report }));
}
const FIXTURE_ZIP = await storedZipOf(path.join(__dirname, "../../../fixtures/diya-gl/precision-code-ltd"));

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
  return { S3Client, GetObjectCommand, PutObjectCommand };
});

const mockGetSignedUrl = vi.fn(
  async (client, command, { expiresIn }) => `https://signed.example/${command.input.Key}?expires=${expiresIn}`,
);
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: (...args) => mockGetSignedUrl(...args) }));

vi.mock("@app/data/dynamoDbPracticeClientRepository.js", () => ({ getClient: vi.fn() }));

const mockPublishActivityEvent = vi.fn().mockResolvedValue({ published: true });
vi.mock("@app/lib/activityAlert.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, publishActivityEvent: (...args) => mockPublishActivityEvent(...args) };
});

const { getClient } = await import("@app/data/dynamoDbPracticeClientRepository.js");
const { ingestHandler } = await import("../../functions/diyaGl/diyaGlDownloadGet.js");
const { _setTestSalt, hashSub } = await import("../../services/subHasher.js");

const BOOK_ID = "11111111-2222-4333-8444-555555555555";

function metadata(overrides = {}) {
  return {
    bookId: BOOK_ID,
    title: "Precision Code Ltd",
    product: "ltd",
    latestVersion: 2,
    latestETag: "zip-v2",
    versions: [
      { version: 1, etag: "zip-v1" },
      { version: 2, etag: "zip-v2" },
    ],
    retention: "resident",
    expiresAt: null,
    ...overrides,
  };
}

function storeHolding(stored, sub = "test-sub") {
  const prefix = `users/${hashSub(sub)}/books/${BOOK_ID}/`;
  mockS3Send.mockImplementation(async (command) => {
    if (command.kind === "get" && command.input.Key === `${prefix}metadata.json`) {
      return { Body: { transformToString: async () => JSON.stringify(stored) }, ETag: '"meta"' };
    }
    if (command.kind === "get" && command.input.Key.startsWith(`${prefix}v`)) {
      return { Body: { transformToByteArray: async () => FIXTURE_ZIP }, ETag: '"zip"' };
    }
    if (command.kind === "get") {
      const error = new Error("not found");
      error.name = "NoSuchKey";
      throw error;
    }
    if (command.kind === "put") return { ETag: '"download"' };
    throw new Error(`Unexpected command ${command.kind} ${command.input.Key}`);
  });
  return prefix;
}

function downloadEvent({ version = "latest", format, clientId, sub = "test-sub" } = {}) {
  return buildLambdaEvent({
    method: "GET",
    path: `/api/v1/books/${BOOK_ID}/versions/${version}/download`,
    pathParameters: { bookId: BOOK_ID, version },
    queryStringParameters: { ...(format ? { format } : {}), ...(clientId ? { clientId } : {}) },
    authorizer: buildJwtAuthorizerContext(sub, "test", "test@test.submit.diyaccounting.co.uk"),
  });
}

describe("diyaGlDownloadGet", () => {
  beforeEach(() => {
    mockS3Send.mockReset();
    mockGetSignedUrl.mockClear();
    mockPublishActivityEvent.mockClear();
    getClient.mockReset();
    process.env.DIYA_GL_BUCKET_NAME = "test-books-bucket";
    process.env.DIYA_GL_ALLOWED_ORIGINS = "https://spreadsheets.diyaccounting.co.uk";
    _setTestSalt("test-salt");
  });

  test("links the stored zip of the latest version where it is, for five minutes, with no write", async () => {
    const prefix = storeHolding(metadata());

    const result = await ingestHandler(downloadEvent({ format: "diya-gl-zip" }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body).toMatchObject({ format: "diya-gl-zip", version: 2, filename: "Precision-Code-Ltd-v2.zip" });
    expect(body.url).toBe(`https://signed.example/${prefix}v2.zip?expires=300`);
    expect(mockGetSignedUrl.mock.calls[0][1].input.ResponseContentDisposition).toBe('attachment; filename="Precision-Code-Ltd-v2.zip"');
    expect(mockS3Send.mock.calls.filter(([command]) => command.kind === "put")).toHaveLength(0);
  });

  test("builds a DIYA-GL book as JSON from a named version, keeps it under downloads/ and links it", async () => {
    storeHolding(metadata());

    const result = await ingestHandler(downloadEvent({ version: "1", format: "json" }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body).toMatchObject({ format: "json", version: 1, filename: "Precision-Code-Ltd-diya-gl.json" });
    const put = mockS3Send.mock.calls.map(([command]) => command).find((command) => command.kind === "put");
    expect(put.input.Key).toMatch(new RegExp(`^downloads/${hashSub("test-sub")}/[0-9a-f-]{36}/Precision-Code-Ltd-diya-gl\\.json$`));
    expect(put.input.ContentType).toBe("application/json");
    expect(JSON.parse(put.input.Body.toString("utf8")).book).toBeDefined();
    expect(body.url).toBe(`https://signed.example/${put.input.Key}?expires=300`);
    expect(mockPublishActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "book-downloaded", detail: { product: "ltd", format: "json", version: 1 } }),
    );
  });

  test("answers a company's set of workbooks as a 422 for xlsx, naming the package zip", async () => {
    storeHolding(metadata());

    const result = await ingestHandler(downloadEvent({ format: "xlsx" }));

    expect(result.statusCode).toBe(422);
    expect(JSON.parse(result.body).code).toBe("workbook-set-downloads-as-zip");
  });

  test("404s a version no longer kept", async () => {
    storeHolding(metadata());
    const result = await ingestHandler(downloadEvent({ version: "7", format: "json" }));
    expect(result.statusCode).toBe(404);
  });

  test("404s a book another account holds, since the key is under the caller's own prefix", async () => {
    storeHolding(metadata(), "owner-sub");
    const result = await ingestHandler(downloadEvent({ format: "json", sub: "someone-else" }));
    expect(result.statusCode).toBe(404);
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  test("404s an expired sandbox book", async () => {
    storeHolding(metadata({ retention: "sandbox", expiresAt: "2020-01-01T00:00:00.000Z" }));
    const result = await ingestHandler(downloadEvent({ format: "json" }));
    expect(result.statusCode).toBe(404);
  });

  test("403s a clientId that is not the caller's practice's client", async () => {
    getClient.mockResolvedValue(null);
    const result = await ingestHandler(downloadEvent({ format: "json", clientId: "client-1" }));
    expect(result.statusCode).toBe(403);
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  test("400s a format it does not build", async () => {
    const result = await ingestHandler(downloadEvent({ format: "pdf" }));
    expect(result.statusCode).toBe(400);
  });

  test("rejects an unauthenticated call", async () => {
    const event = downloadEvent({ format: "json" });
    delete event.requestContext.authorizer;
    const result = await ingestHandler(event);
    expect(result.statusCode).toBe(401);
  });
});
