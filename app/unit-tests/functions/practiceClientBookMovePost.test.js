// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, beforeEach, vi } from "vitest";
import { buildJwtAuthorizerContext, buildLambdaEvent } from "../../test-helpers/eventBuilders.js";

vi.mock("@app/data/dynamoDbPracticeClientRepository.js", () => ({
  getClient: vi.fn(),
}));

vi.mock("@app/data/s3DiyaGlRepository.js", async () => {
  const actual = await vi.importActual("@app/data/s3DiyaGlRepository.js");
  return { ...actual, moveBookToClient: vi.fn() };
});

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

const { getClient } = await import("@app/data/dynamoDbPracticeClientRepository.js");
const { moveBookToClient, BookNotFoundError, DestinationBookExistsError } = await import("@app/data/s3DiyaGlRepository.js");
const { ingestHandler } = await import("../../functions/practice/practiceClientBookMovePost.js");
const { _setTestSalt } = await import("../../services/subHasher.js");

const BOOK_ID = "11111111-2222-4333-8444-555555555555";
const CLIENT_ID = "c1";

function buildAuthenticatedEvent({ sub = "practice-sub", clientId = CLIENT_ID, bookId = BOOK_ID, appClientId } = {}) {
  return buildLambdaEvent({
    method: "POST",
    path: `/api/v1/practice/clients/${clientId}/books/${bookId}/move`,
    authorizer: buildJwtAuthorizerContext(
      sub,
      "test",
      "test@test.submit.diyaccounting.co.uk",
      appClientId ? { client_id: appClientId } : {},
    ),
    pathParameters: { clientId, bookId },
  });
}

describe("practiceClientBookMovePost", () => {
  beforeEach(() => {
    process.env.PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME = "test-practice-clients-table";
    getClient.mockReset();
    moveBookToClient.mockReset();
    mockPublishActivityEvent.mockClear();
    mockSsmSend.mockReset();
    _setTestSalt("test-salt");
  });

  test("moves the book and answers the repository's result", async () => {
    getClient.mockResolvedValue({ clientId: CLIENT_ID, archivedAt: null });
    moveBookToClient.mockResolvedValue({ bookId: BOOK_ID, clientId: CLIENT_ID, movedObjectCount: 2 });

    const result = await ingestHandler(buildAuthenticatedEvent({}));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ bookId: BOOK_ID, clientId: CLIENT_ID, movedObjectCount: 2 });
    expect(moveBookToClient).toHaveBeenCalledWith("practice-sub", CLIENT_ID, BOOK_ID);
  });

  test("publishes book-moved with the resolved app client", async () => {
    getClient.mockResolvedValue({ clientId: CLIENT_ID, archivedAt: null });
    moveBookToClient.mockResolvedValue({ bookId: BOOK_ID, clientId: CLIENT_ID, movedObjectCount: 3 });
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
        event: "book-moved",
        appClient: "submit",
        clientId: CLIENT_ID,
        detail: expect.objectContaining({ bookId: BOOK_ID, movedObjectCount: 3 }),
      }),
    );
  });

  test("answers 404 for a client that does not belong to this practice", async () => {
    getClient.mockResolvedValue(null);

    const result = await ingestHandler(buildAuthenticatedEvent({}));

    expect(result.statusCode).toBe(404);
    expect(moveBookToClient).not.toHaveBeenCalled();
  });

  test("answers 404 for an archived client", async () => {
    getClient.mockResolvedValue({ clientId: CLIENT_ID, archivedAt: "2026-01-01T00:00:00.000Z" });

    const result = await ingestHandler(buildAuthenticatedEvent({}));

    expect(result.statusCode).toBe(404);
    expect(moveBookToClient).not.toHaveBeenCalled();
  });

  test("answers 404 when the practice has no such book of its own", async () => {
    getClient.mockResolvedValue({ clientId: CLIENT_ID, archivedAt: null });
    moveBookToClient.mockRejectedValue(new BookNotFoundError("No book found"));

    const result = await ingestHandler(buildAuthenticatedEvent({}));

    expect(result.statusCode).toBe(404);
  });

  test("answers 409 when the destination already holds a book with this id", async () => {
    getClient.mockResolvedValue({ clientId: CLIENT_ID, archivedAt: null });
    moveBookToClient.mockRejectedValue(new DestinationBookExistsError("Client already has a book"));

    const result = await ingestHandler(buildAuthenticatedEvent({}));

    expect(result.statusCode).toBe(409);
  });

  test("answers 500 for any other failure", async () => {
    getClient.mockResolvedValue({ clientId: CLIENT_ID, archivedAt: null });
    moveBookToClient.mockRejectedValue(new Error("Copy verification failed"));

    const result = await ingestHandler(buildAuthenticatedEvent({}));

    expect(result.statusCode).toBe(500);
  });

  test("rejects a missing clientId path parameter", async () => {
    const event = buildLambdaEvent({
      method: "POST",
      path: `/api/v1/practice/clients//books/${BOOK_ID}/move`,
      authorizer: buildJwtAuthorizerContext("practice-sub"),
      pathParameters: { bookId: BOOK_ID },
    });

    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(400);
    expect(moveBookToClient).not.toHaveBeenCalled();
  });

  test("rejects a bookId that is not a valid book id", async () => {
    const result = await ingestHandler(buildAuthenticatedEvent({ bookId: "not-a-book-id" }));

    expect(result.statusCode).toBe(400);
    expect(moveBookToClient).not.toHaveBeenCalled();
  });

  test("rejects an unauthenticated call", async () => {
    const event = buildLambdaEvent({
      method: "POST",
      path: `/api/v1/practice/clients/${CLIENT_ID}/books/${BOOK_ID}/move`,
      authorizer: {},
      pathParameters: { clientId: CLIENT_ID, bookId: BOOK_ID },
    });

    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(401);
    expect(moveBookToClient).not.toHaveBeenCalled();
  });
});
