// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/ct600-agent.test.js
import { describe, test, expect } from "vitest";
import { clientChoices, clientFilingStop, agentRequestFields } from "../public/lib/ct600-agent.js";

const ACTIVE = { clientId: "c1", displayName: "Precision Code Ltd", identifiers: { utr: "1234567890", companyNumber: "00000099" } };

describe("ct600-agent", () => {
  test("lists each client that is not archived with its company number", () => {
    const choices = clientChoices([
      ACTIVE,
      { ...ACTIVE, clientId: "c2", archivedAt: "2026-01-01" },
      { clientId: "c3", displayName: "No Number" },
    ]);
    expect(choices).toEqual([
      { clientId: "c1", label: "Precision Code Ltd (00000099)" },
      { clientId: "c3", label: "No Number" },
    ]);
  });

  test("stops a client with no UTR and names the client", () => {
    expect(clientFilingStop({ ...ACTIVE, identifiers: { companyNumber: "00000099", utr: null } })).toBe(
      "Add the company's UTR to Precision Code Ltd on Practice clients",
    );
  });

  test("stops a client with no company number", () => {
    expect(clientFilingStop({ ...ACTIVE, identifiers: { utr: "1234567890", companyNumber: null } })).toContain("company number");
  });

  test("does not stop a client with both", () => {
    expect(clientFilingStop(ACTIVE)).toBeNull();
  });

  test("adds the client id and the agent to a client request only", () => {
    expect(agentRequestFields(ACTIVE, { practiceName: " Example LLP ", authorisationConfirmed: true })).toEqual({
      clientId: "c1",
      agent: { practiceName: "Example LLP", authorisationConfirmed: true },
    });
    expect(agentRequestFields(null, { practiceName: "x", authorisationConfirmed: true })).toEqual({});
  });
});
