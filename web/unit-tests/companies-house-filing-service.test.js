// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/companies-house-filing-service.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("../public/lib/services/api-client.js", () => ({
  fetchWithIdToken: vi.fn(),
  authorizedFetch: vi.fn(),
}));

import { fetchWithIdToken } from "../public/lib/services/api-client.js";
import { submitMicroEntityAccounts } from "../public/lib/services/companies-house-filing-service.js";

describe("companies-house-filing-service accounts filing refusals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("a refusal for no token left says nothing was sent and carries its status and reason", async () => {
    fetchWithIdToken.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ message: "Token limit reached", reason: "tokens_exhausted", tokensRemaining: 0 }),
    });

    const error = await submitMicroEntityAccounts({}).catch((caught) => caught);

    expect(error.message).toBe(
      "No tokens remaining. Your token allowance has been used, so nothing was sent to Companies House. Tokens refresh at the start of the next period. Visit the Bundles page for more options.",
    );
    expect(error.status).toBe(403);
    expect(error.reason).toBe("tokens_exhausted");
  });

  test("any other refusal keeps the server message and carries its reason", async () => {
    fetchWithIdToken.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ message: "Company number not recognised", reason: "invalid_company" }),
    });

    const error = await submitMicroEntityAccounts({}).catch((caught) => caught);

    expect(error.message).toBe("Company number not recognised");
    expect(error.status).toBe(422);
    expect(error.reason).toBe("invalid_company");
  });
});
