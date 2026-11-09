// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/corsOrigins.js
//
// The origins that may read an API response in a browser: the environment's own site origins.
// The environment comes from ENVIRONMENT_NAME, which every deployed Lambda and each local run sets.

import { getHeader } from "./httpResponseHelper.js";

const OWN_ORIGINS_BY_ENVIRONMENT = {
  prod: ["https://submit.diyaccounting.co.uk"],
  ci: ["https://ci-submit.diyaccounting.co.uk"],
  proxy: ["https://local.submit.diyaccounting.co.uk:3443"],
  simulator: ["http://localhost:3000"],
  test: ["https://test"],
};

// A ci deployment is served at https://<deployment>.submit.diyaccounting.co.uk.
const CI_DEPLOYMENT_ORIGIN = /^https:\/\/[a-z0-9-]+\.submit\.diyaccounting\.co\.uk$/;

/**
 * Says whether an origin is one of the current environment's own site origins.
 *
 * @param {string|null|undefined} origin - the request's Origin header
 * @returns {boolean}
 */
export function isAllowedCorsOrigin(origin) {
  if (!origin) return false;
  const environmentName = process.env.ENVIRONMENT_NAME;
  if ((OWN_ORIGINS_BY_ENVIRONMENT[environmentName] || []).includes(origin)) return true;
  return environmentName === "ci" && CI_DEPLOYMENT_ORIGIN.test(origin);
}

/**
 * The CORS response headers for a request: the caller's Origin echoed back only when it is an own
 * origin of this environment, with Vary: Origin so a cache does not serve one origin's response to
 * another. A missing or foreign Origin gets no Access-Control-Allow-Origin.
 *
 * @param {object} headers - the incoming request's headers (event.headers)
 * @returns {object}
 */
export function corsOriginHeaders(headers) {
  const origin = getHeader(headers, "origin");
  if (!isAllowedCorsOrigin(origin)) return { Vary: "Origin" };
  return { "Access-Control-Allow-Origin": origin, "Vary": "Origin" };
}
