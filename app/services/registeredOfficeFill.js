// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/registeredOfficeFill.js
// The accounts state the company's registered office. A request that omits it takes the office
// from the Companies House company profile, the same address parts the company profile GET returns.

import { getCompanyProfile } from "../functions/companies-house/companiesHouseCompanyGet.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger({ source: "app/services/registeredOfficeFill.js" });

/**
 * Set accounts.registeredOffice from the company profile when the request left it out.
 * @param {{companyNumber: string, registeredOffice?: object}} accounts - changed in place
 * @param {string[]} errorMessages - receives "Missing registeredOffice" when the profile has none
 */
export async function fillRegisteredOffice(accounts, errorMessages) {
  if (accounts.registeredOffice?.addressLine1) return;
  let office;
  try {
    const { profile } = await getCompanyProfile(accounts.companyNumber);
    office = profile?.registeredOffice;
  } catch (error) {
    logger.warn({ message: "Company profile lookup for the registered office failed", error: error.message });
  }
  if (office?.addressLine1) {
    accounts.registeredOffice = office;
  } else {
    errorMessages.push("Missing registeredOffice - the request did not carry it and the Companies House profile holds none");
  }
}
