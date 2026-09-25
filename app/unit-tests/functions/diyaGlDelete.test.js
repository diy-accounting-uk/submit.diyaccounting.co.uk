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

vi.mock("@app/data/dynamoDbPracticeClientRepository.js", () => ({
  getClient: vi.fn(),
}));

const mockPublishActivityEvent = vi.fn().mockResolvedValue({ published: true });
vi.mock("@app/lib/activityAlert.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, publishActivityEvent: (...args) => mockPublishActivityEvent(...args) };
});

const mockSsmSend = vi.fn();
vi.mock("@aws-sdk/client-ssm", () => ({
  SSMClient: class {
    send(...args) {
      return mockSsmSend(...args);
    }
  },
  GetParameterCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

const { ingestHandler } = await import("../../functions/diyaGl/diyaGlDelete.js");
const { _setTestSalt, _clearSalt } = await import("../../services/subHasher.js");
const { hashSub } = await import("../../services/subHasher.js");
const { getClient } = await import("@app/data/dynamoDbPracticeClientRepository.js");

const BOOK_ID = "11111111-2222-4333-8444-555555555555";

function jsonBody(object) {
  return { transformToString: async () => JSON.stringify(object) };
}

function buildAuthenticatedEvent({ sub = "test-sub", bookId = BOOK_ID, clientId, appClientId } = {}) {
  return buildLambdaEvent({
    method: "DELETE",
    path: `/api/v1/books/${bookId}`,
    pathParameters: { bookId },
    queryStringParameters: clientId ? { clientId } : null,
    authorizer: buildJwtAuthorizerContext(
      sub,
      "test",
      "test@test.submit.diyaccounting.co.uk",
      appClientId ? { client_id: appClientId } : {},
    ),
  });
}

describe("diyaGlDelete", () => {
  beforeEach(() => {
    mockS3Send.mockReset();
    getClient.mockReset();
    mockPublishActivityEvent.mockClear();
    mockSsmSend.mockReset();
    process.env.DIYA_GL_BUCKET_NAME = "test-books-bucket";
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

  test("publishes book-deleted with the product, retention and resolved app client", async () => {
    const hashedSub = hashSub("test-sub");
    const metadataKey = `users/${hashedSub}/books/${BOOK_ID}/metadata.json`;
    const objects = [metadataKey, `users/${hashedSub}/books/${BOOK_ID}/v1.zip`];
    mockS3Send.mockImplementation((command) => {
      if (command.constructor.name === "GetObjectCommand") {
        if (command.input.Key === metadataKey) {
          return { ETag: '"meta-etag"', Body: jsonBody({ bookId: BOOK_ID, product: "vat", retention: "sandbox" }) };
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
    mockSsmSend.mockImplementation((command) => {
      if (command.input.Name === "/submit/ci/submit-app-client-id") {
        return Promise.resolve({ Parameter: { Value: "submit-client-id" } });
      }
      return Promise.reject(new Error("unexpected parameter"));
    });
    process.env.ENVIRONMENT_NAME = "ci";

    const result = await ingestHandler(buildAuthenticatedEvent({ appClientId: "submit-client-id" }));

    expect(result.statusCode).toBe(200);
    expect(mockPublishActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "book-deleted",
        appClient: "submit",
        detail: expect.objectContaining({ product: "vat", retention: "sandbox" }),
      }),
    );
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

  test("removes objects under the client's own book prefix when a clientId belonging to the caller is given", async () => {
    getClient.mockResolvedValue({ clientId: "client-1", hashedSub: hashSub("test-sub") });
    const hashedSub = hashSub("test-sub");
    const clientPrefix = `${hashedSub}/clients/client-1`;
    const metadataKey = `users/${clientPrefix}/books/${BOOK_ID}/metadata.json`;
    const objects = [metadataKey, `users/${clientPrefix}/books/${BOOK_ID}/v1.zip`];
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

    const result = await ingestHandler(buildAuthenticatedEvent({ clientId: "client-1" }));

    expect(result.statusCode).toBe(200);
    expect(getClient).toHaveBeenCalledWith("test-sub", "client-1");
  });

  test("403s a clientId that does not belong to the caller's practice", async () => {
    getClient.mockResolvedValue(null);

    const result = await ingestHandler(buildAuthenticatedEvent({ clientId: "not-mine" }));

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).code).toBe("client-not-found");
    expect(mockS3Send).not.toHaveBeenCalled();
  });
});
