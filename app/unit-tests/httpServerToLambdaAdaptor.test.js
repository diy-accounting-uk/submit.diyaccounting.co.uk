// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/httpServerToLambdaAdaptor.test.js

import { describe, it, expect } from "vitest";
import { buildLambdaEventFromHttpRequest, buildHttpResponseFromLambdaResult } from "../lib/httpServerToLambdaAdaptor.js";

function makeJwt({ sub = "user-123", email = "user@example.com", extra = {} } = {}) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" }))
    .toString("base64")
    .replace(/=+$/g, "");
  const payload = Buffer.from(JSON.stringify({ sub, email, iat: 1_700_000_000, exp: 1_800_000_000, ...extra }))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `${header}.${payload}.`;
}

function makeHttpRequest({
  method = "POST",
  path = "/test/path",
  originalUrl = "/test/path?foo=bar",
  headers = {},
  query = { foo: "bar" },
  params = { id: "123" },
  body = { a: "b" },
  protocol = "https",
} = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [String(k).toLowerCase(), v]));
  return {
    method,
    path,
    originalUrl,
    protocol,
    headers: lower,
    query,
    params,
    body,
    get(name) {
      return lower[String(name).toLowerCase()];
    },
  };
}

describe("unit: httpServerToLambdaAdaptor.buildLambdaEventFromHttpRequest", () => {
  it("builds a Lambda event with headers, params, query and JWT claims", () => {
    const token = makeJwt({ sub: "abc-123", email: "abc@example.com", extra: { custom: "x" } });
    const httpRequest = makeHttpRequest({
      headers: {
        "host": "example.com:8443",
        "referer": "https://referer.test/page",
        "authorization": `Bearer ${token}`,
        "x-extra": "y",
      },
    });

    const evt = buildLambdaEventFromHttpRequest(httpRequest);

    // top-level mapping
    expect(evt.path).toBe("/test/path");
    expect(evt.headers.host).toBe("example.com:8443");
    expect(evt.headers.referer).toBe("https://referer.test/page");
    expect(evt.queryStringParameters).toEqual({ foo: "bar" });
    expect(evt.rawQueryString).toBe("foo=bar");
    expect(evt.pathParameters).toEqual({ id: "123" });
    expect(evt.body).toBe(JSON.stringify({ a: "b" }));

    // requestContext mapping
    expect(evt.requestContext.http.method).toBe("POST");
    expect(evt.requestContext.http.protocol).toBe("https");
    expect(evt.requestContext.http.host).toBe("example.com:8443");
    expect(evt.requestContext.http.path).toBe("/test/path");

    // authorizer context – merged JWT payload plus fixed fields (flat, matching custom authorizer)
    const ctx = evt.requestContext.authorizer.lambda;
    expect(ctx.sub).toBe("abc-123");
    // fixed username/email/scope are present
    expect(ctx["cognito:username"]).toBe("test");
    expect(ctx.email).toBe("test@test.submit.diyaccunting.co.uk");
    expect(ctx.scope).toBe("read write");
  });

  it("does not throw when Authorization header is missing and still builds event", () => {
    const httpRequest = makeHttpRequest({
      headers: { host: "example.com:8443" },
    });
    const evt = buildLambdaEventFromHttpRequest(httpRequest);
    expect(evt.headers.host).toBe("example.com:8443");
    const ctx = evt.requestContext.authorizer.lambda;
    // When no token, our hardening should avoid crashing; fixed fields still present
    expect(ctx["cognito:username"]).toBe("test");
    expect(ctx.email).toBe("test@test.submit.diyaccunting.co.uk");
    expect(ctx.scope).toBe("read write");
  });

  it("prefers x-authorization over authorization when both present", () => {
    const tokenA = makeJwt({ sub: "from-auth" });
    const tokenX = makeJwt({ sub: "from-x-auth" });
    const httpRequest = makeHttpRequest({
      headers: {
        "host": "h:1",
        "authorization": `Bearer ${tokenA}`,
        "x-authorization": `Bearer ${tokenX}`,
      },
    });
    const evt = buildLambdaEventFromHttpRequest(httpRequest);
    const ctx = evt.requestContext.authorizer.lambda;
    expect(ctx.sub).toBe("from-x-auth");
  });

  it("handles malformed Authorization header gracefully", () => {
    const httpRequest = makeHttpRequest({
      headers: { authorization: "NotBearer token", host: "h:1" },
    });
    const evt = buildLambdaEventFromHttpRequest(httpRequest);
    expect(evt.headers.host).toBe("h:1");
    const ctx = evt.requestContext.authorizer.lambda;
    expect(ctx["cognito:username"]).toBe("test");
  });
});

describe("unit: httpServerToLambdaAdaptor.buildHttpResponseFromLambdaResult", () => {
  function makeStubResponse() {
    const state = { setHeaders: null, status: null, json: null, sent: null, ended: false };
    return {
      _state: state,
      set(h) {
        state.setHeaders = h;
      },
      status(code) {
        state.status = code;
        return {
          json(obj) {
            state.json = obj;
            return this;
          },
          send(txt) {
            state.sent = txt;
            return this;
          },
          end() {
            state.ended = true;
            return this;
          },
        };
      },
    };
  }

  it("writes JSON body when lambda result has JSON string body", () => {
    const res = makeStubResponse();
    buildHttpResponseFromLambdaResult({ headers: { a: "b" }, statusCode: 200, body: JSON.stringify({ ok: true }) }, res);
    expect(res._state.setHeaders).toEqual({ a: "b" });
    expect(res._state.status).toBe(200);
    expect(res._state.json).toEqual({ ok: true });
  });

  it("falls back to text when body is not valid JSON", () => {
    const res = makeStubResponse();
    buildHttpResponseFromLambdaResult({ headers: { a: "b" }, statusCode: 202, body: "not-json" }, res);
    expect(res._state.status).toBe(202);
    expect(res._state.sent).toBe("not-json");
  });

  it("ends without body for 304 Not Modified", () => {
    const res = makeStubResponse();
    buildHttpResponseFromLambdaResult({ headers: { a: "b" }, statusCode: 304, body: "{}" }, res);
    expect(res._state.status).toBe(304);
    expect(res._state.ended).toBe(true);
  });
});
