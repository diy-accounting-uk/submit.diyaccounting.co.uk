// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/test-helpers/dueListRouteDoubles.js
// The pieces the due list route tests share: an event for a route and its parsed answer.

export function dueListEvent({ method = "GET", path = "/api/v1/due-list", pathParameters = {}, body } = {}) {
  return {
    requestContext: { http: { method, path } },
    pathParameters,
    headers: { "host": "localhost", "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

export const responseBody = (response) => JSON.parse(response.body);
