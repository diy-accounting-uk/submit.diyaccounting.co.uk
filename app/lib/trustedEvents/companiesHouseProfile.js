// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/trustedEvents/companiesHouseProfile.js
//
// The one Companies House call the trusted event function makes: GET /company/<number>. It sends
// through the Companies House send module, which records the call, and reads the key with the
// secret cache. The shared Companies House client also pulls in the bundle and practice
// repositories, and the function holds no table for them.

import { readSecret, refreshAfterAuthFailure } from "../cachedSecret.js";
import { DEFAULT_TIMEOUTS } from "../httpFetch.js";
import { sendJsonToCompaniesHouse } from "../../services/companiesHouseSend.js";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === "") throw new Error(`${name} environment variable is required`);
  return value;
}

const authorization = (apiKey) => "Basic " + Buffer.from(apiKey + ":").toString("base64");

/**
 * @param {string} companyNumber
 * @returns {Promise<Object>} the company profile
 */
export async function fetchCompanyProfile(companyNumber) {
  const url = `${requiredEnv("COMPANIES_HOUSE_BASE_URI")}/company/${companyNumber}`;
  const secretArn = requiredEnv("COMPANIES_HOUSE_API_KEY_ARN");
  const send = (apiKey) =>
    sendJsonToCompaniesHouse(
      url,
      { method: "GET", headers: { Authorization: authorization(apiKey), Accept: "application/json" } },
      DEFAULT_TIMEOUTS.SHORT,
      { api: "GET /company/{id}" },
    );

  const apiKey = await readSecret(secretArn);
  let result = await send(apiKey);
  if (result.status === 401) {
    // A 401 means the key was rolled: one more request, only when the secret now holds another key.
    const refreshedKey = await refreshAfterAuthFailure(secretArn, apiKey);
    if (refreshedKey) result = await send(refreshedKey);
  }
  if (!result.ok) throw new Error(`Companies House answered ${result.status}`);
  return result.data;
}
