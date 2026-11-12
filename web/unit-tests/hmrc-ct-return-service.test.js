// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/hmrc-ct-return-service.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("../public/lib/services/api-client.js", () => ({
  fetchWithIdToken: vi.fn(),
  authorizedFetch: vi.fn(),
}));

import { fetchWithIdToken } from "../public/lib/services/api-client.js";
import { submitCtReturn } from "../public/lib/services/hmrc-ct-return-service.js";

describe("hmrc-ct-return-service return refusals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("a refusal for no token left says nothing was sent to HMRC and carries its status and reason", async () => {
    fetchWithIdToken.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ message: "Token limit reached", reason: "tokens_exhausted", tokensRemaining: 0 }),
    });

    const error = await submitCtReturn({}).catch((caught) => caught);

    expect(error.message).toBe(
      "No tokens remaining. Your token allowance has been used, so nothing was sent to HMRC. Tokens refresh at the start of the next period. Visit the Bundles page for more options.",
    );
    expect(error.status).toBe(403);
    expect(error.reason).toBe("tokens_exhausted");
  });

  test("any other refusal keeps the server message and carries its reason", async () => {
    fetchWithIdToken.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ message: "The figures changed after you reviewed them", reason: "boxes_differ" }),
    });

    const error = await submitCtReturn({}).catch((caught) => caught);

    expect(error.message).toBe("The figures changed after you reviewed them");
    expect(error.status).toBe(409);
    expect(error.reason).toBe("boxes_differ");
  });
});
