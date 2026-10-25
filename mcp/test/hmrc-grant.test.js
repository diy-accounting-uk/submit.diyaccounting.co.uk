// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// hmrc-grant.test.js -- request_hmrc_authorisation and the token lookup the HMRC tools use,
// with fetch mocked.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hmrcAccessTokenFor, requestHmrcAuthorisation } from "../lib/submit-tools.js";
import { createSession } from "../lib/book-tools.js";
import { TOOLS } from "../lib/server.js";

const GRANT_ID = "11111111-2222-4333-8444-555555555555";
const AUTHORISE_URL = "https://test-api.service.hmrc.gov.uk/oauth/authorize?state=mcp.x.y";

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body), headers: { get: () => null } };
}

function newSession() {
  return createSession({ credentials: { accessToken: async () => "session-access-token", idToken: async () => null } });
}

describe("the HMRC grant tools", () => {
  beforeEach(() => {
    process.env.DIYA_SUBMIT_BASE_URL = "https://submit.diyaccounting.co.uk/";
  });

  afterEach(() => {
    delete process.env.DIYA_SUBMIT_BASE_URL;
    vi.unstubAllGlobals();
  });

  describe("request_hmrc_authorisation", () => {
    it("asks for a grant, keeps its id on the session and answers only the link", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(
        jsonResponse(201, {
          grantId: GRANT_ID,
          url: AUTHORISE_URL,
          expiresAt: "2026-10-25T12:10:00.000Z",
          scope: "read:vat write:vat",
          hmrcAccount: "synthetic",
        }),
      );
      vi.stubGlobal("fetch", mockFetch);
      const session = newSession();

      const answer = await requestHmrcAuthorisation(session, { hmrcAccount: "synthetic" });

      expect(answer).toEqual({
        url: AUTHORISE_URL,
        expiresAt: "2026-10-25T12:10:00.000Z",
        scope: "read:vat write:vat",
        hmrcAccount: "synthetic",
      });
      expect(JSON.stringify(answer)).not.toContain(GRANT_ID);
      expect(session.hmrcGrant).toEqual({ grantId: GRANT_ID, hmrcAccount: "synthetic" });
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://submit.diyaccounting.co.uk/api/v1/mcp/hmrc-grants");
      expect(init.method).toBe("POST");
      expect(init.headers.Authorization).toBe("Bearer session-access-token");
      expect(JSON.parse(init.body)).toEqual({ services: ["vat"], hmrcAccount: "synthetic" });
    });

    it("asks for the live account and VAT when called with nothing", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce(jsonResponse(201, { grantId: GRANT_ID, url: AUTHORISE_URL, hmrcAccount: "live" }));
      vi.stubGlobal("fetch", mockFetch);

      await requestHmrcAuthorisation(newSession());

      expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ services: ["vat"], hmrcAccount: "live" });
    });

    it("refuses an unknown service and an unknown account before any request", async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);
      await expect(requestHmrcAuthorisation(newSession(), { services: ["paye"] })).rejects.toThrow("services");
      await expect(requestHmrcAuthorisation(newSession(), { hmrcAccount: "production" })).rejects.toThrow("hmrcAccount");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("is the handler of the registered tool", () => {
      expect(TOOLS.request_hmrc_authorisation.handler).toBe(requestHmrcAuthorisation);
    });
  });

  describe("the token lookup", () => {
    it("answers the grant's token and account", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce(jsonResponse(200, { status: "granted", accessToken: "hmrc-token", hmrcAccount: "live" })),
      );
      const session = newSession();
      session.hmrcGrant = { grantId: GRANT_ID, hmrcAccount: "live" };

      expect(await hmrcAccessTokenFor(session, "list_vat_obligations")).toEqual({ accessToken: "hmrc-token", hmrcAccount: "live" });
    });

    it("carries the route's own message for an expired grant", async () => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce(
            jsonResponse(404, { message: "This HMRC authorisation has expired or does not exist. Call request_hmrc_authorisation again." }),
          ),
      );
      const session = newSession();
      session.hmrcGrant = { grantId: GRANT_ID, hmrcAccount: "live" };

      await expect(hmrcAccessTokenFor(session, "submit_vat_return")).rejects.toThrow("Call request_hmrc_authorisation again");
    });

    it("names the calling tool and the authorisation tool when no grant is held", async () => {
      await expect(hmrcAccessTokenFor(newSession(), "submit_vat_return")).rejects.toThrow(
        /^submit_vat_return: No HMRC authorisation is held for this session\. Call request_hmrc_authorisation/,
      );
    });
  });
});
