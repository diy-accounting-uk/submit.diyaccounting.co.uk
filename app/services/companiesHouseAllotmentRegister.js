// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseAllotmentRegister.js
// A return of allotment states the company's capital after the allotment, so the capital before it
// is that statement less the shares allotted. That capital is checked against the capital the
// register holds, read with the company data request the confirmation statement form reads (the
// company authentication code goes to that one request and is kept nowhere), and the read is charged
// to the account's share of the Companies House lookups.

import {
  buildCompanyDataRequest,
  parseCompanyDataResponse,
  parseGatewayResponse,
  postToGateway,
  resolvePresenterCredentials,
} from "./companiesHouseXmlGateway.js";
import { LOOKUP_CALLS, lookupLimitResponse, lookupRefusalSeconds } from "./companiesHouseLookupLimit.js";
import {
  hasInvalidCompanyAuthenticationCodeError,
  INVALID_COMPANY_AUTHENTICATION_CODE_MESSAGE,
  INVALID_COMPANY_AUTHENTICATION_CODE_REASON,
} from "../lib/companiesHouseGatewayErrors.js";
import { http400BadRequestResponse, http502BadGatewayResponse } from "../lib/httpResponseHelper.js";
import { createLogger } from "../lib/logger.js";
import { fromMillionths, multiplyMillionths, toMillionths } from "../../web/public/lib/share-capital.js";

const logger = createLogger({ source: "app/services/companiesHouseAllotmentRegister.js" });

export const CAPITAL_MISMATCH_REASON = "capital-before-differs-from-register";

const classKey = (currency, shareClass) => `${currency} ${String(shareClass).trim().toLowerCase()}`;

/**
 * The capital before the allotment that a return states: each class of its statement of capital
 * less the shares allotted in it, leaving out a class the allotment starts, and each currency's total
 * unpaid less what is unpaid on the shares allotted.
 * @param {Array<{currency: string, totalAmountUnpaid: string, shares: Array<object>}>} statementOfCapital - after the allotment
 * @param {Array<object>} allotments
 * @returns {Map<string, {currency: string, totalAmountUnpaid: bigint, classes: Map<string, {shareClass: string, number: bigint, nominal: bigint}>}>}
 *   by currency
 */
export function capitalBeforeAllotment(statementOfCapital, allotments) {
  const before = new Map();
  for (const capital of statementOfCapital) {
    const classes = new Map();
    for (const share of capital.shares) {
      classes.set(classKey(capital.currency, share.shareClass), {
        shareClass: share.shareClass,
        number: toMillionths(share.numShares),
        nominal: toMillionths(share.aggregateNominalValue),
      });
    }
    before.set(capital.currency, { currency: capital.currency, totalAmountUnpaid: toMillionths(capital.totalAmountUnpaid), classes });
  }
  for (const allotment of allotments) {
    const capital = before.get(allotment.currency);
    const held = capital.classes.get(classKey(allotment.currency, allotment.shareClass));
    const number = toMillionths(allotment.numShares);
    held.number -= number;
    held.nominal -= multiplyMillionths(number, toMillionths(allotment.nominalValue));
    capital.totalAmountUnpaid -= multiplyMillionths(number, toMillionths(allotment.amountUnpaidPerShare));
  }
  for (const capital of before.values()) {
    for (const [key, held] of capital.classes) if (held.number === 0n && held.nominal === 0n) capital.classes.delete(key);
  }
  return before;
}

function registerCapitals(statementsOfCapital) {
  const register = new Map();
  for (const capital of statementsOfCapital) {
    const classes = new Map();
    for (const share of capital.shares) {
      classes.set(classKey(capital.shareCurrency, share.shareClass), {
        shareClass: share.shareClass,
        number: toMillionths(share.numShares) ?? 0n,
        nominal: toMillionths(share.aggregateNominalValue) ?? 0n,
      });
    }
    register.set(capital.shareCurrency, {
      currency: capital.shareCurrency,
      totalAmountUnpaid: toMillionths(capital.totalAmountUnpaid) ?? 0n,
      classes,
    });
  }
  return register;
}

const NONE = { number: 0n, nominal: 0n };
const figures = (held) => `${fromMillionths(held.number)} shares of aggregate nominal value ${fromMillionths(held.nominal)}`;

/**
 * Each difference between the capital before the allotment that a return states and the register's
 * capital, as a sentence that names the class and the two figures.
 * @param {ReturnType<typeof capitalBeforeAllotment>} before
 * @param {Array<object>} statementsOfCapital - the register's, as parseCompanyDataResponse answers them
 * @returns {string[]}
 */
export function capitalMismatches(before, statementsOfCapital) {
  const register = registerCapitals(statementsOfCapital);
  const mismatches = [];
  for (const currency of new Set([...register.keys(), ...before.keys()])) {
    const stated = before.get(currency) ?? { totalAmountUnpaid: 0n, classes: new Map() };
    const held = register.get(currency) ?? { totalAmountUnpaid: 0n, classes: new Map() };
    for (const key of new Set([...held.classes.keys(), ...stated.classes.keys()])) {
      const registerClass = held.classes.get(key) ?? NONE;
      const statedClass = stated.classes.get(key) ?? NONE;
      if (registerClass.number === statedClass.number && registerClass.nominal === statedClass.nominal) continue;
      const shareClass = (stated.classes.get(key) ?? held.classes.get(key)).shareClass;
      mismatches.push(
        `Before the allotment the ${currency} ${shareClass} shares are ${figures(statedClass)} in this return, ` +
          `and ${figures(registerClass)} on the Companies House register`,
      );
    }
    if (stated.totalAmountUnpaid !== held.totalAmountUnpaid) {
      mismatches.push(
        `Before the allotment the total amount unpaid in ${currency} is ${fromMillionths(stated.totalAmountUnpaid)} in this return, ` +
          `and ${fromMillionths(held.totalAmountUnpaid)} on the Companies House register`,
      );
    }
  }
  return mismatches;
}

/**
 * The refusal of a return whose capital before the allotment differs from the register's, or of a
 * read the account's share does not allow or Companies House does not answer; undefined when the two
 * agree.
 * @param {{form: object, request: object, headers: object, userSub: string, ownPresenter?: {presenterId: string, presenterCode: string},
 *   gatewayHeaders: object}} filing
 * @returns {Promise<object|undefined>} an HTTP response
 */
export async function refuseCapitalUnlikeRegister({ form, request, headers, userSub, ownPresenter, gatewayHeaders }) {
  const refusalSeconds = await lookupRefusalSeconds(userSub, LOOKUP_CALLS.companyData);
  if (refusalSeconds) return lookupLimitResponse(request, headers, refusalSeconds);
  let parsed;
  let companyData;
  try {
    const { presenterId, presenterCode } = ownPresenter ?? (await resolvePresenterCredentials());
    const xml = buildCompanyDataRequest({
      presenterId,
      presenterCode,
      companyNumber: form.companyNumber,
      companyAuthenticationCode: form.companyAuthCode,
      madeUpDate: form.dateSigned,
      gatewayTest: process.env.COMPANIES_HOUSE_GATEWAY_TEST === "true",
    });
    const response = await postToGateway(xml, gatewayHeaders);
    parsed = parseGatewayResponse(response.data);
    companyData = parsed.errors?.length ? undefined : parseCompanyDataResponse(response.data);
  } catch (error) {
    logger.warn({ message: "The company's share capital could not be read from Companies House", error: error.message });
    return http502BadGatewayResponse({
      request,
      headers: { ...headers },
      message: "Companies House did not give the company's share capital, so the return was not sent",
    });
  }
  if (parsed.errors?.length) {
    if (hasInvalidCompanyAuthenticationCodeError(parsed.errors)) {
      return http400BadRequestResponse({
        request,
        headers: { ...headers },
        message: INVALID_COMPANY_AUTHENTICATION_CODE_MESSAGE,
        error: { reason: INVALID_COMPANY_AUTHENTICATION_CODE_REASON },
      });
    }
    logger.warn({ message: "Companies House rejected the company data request", errors: parsed.errors });
    return http502BadGatewayResponse({
      request,
      headers: { ...headers },
      message: "Companies House did not give the company's share capital, so the return was not sent",
    });
  }
  const mismatches = capitalMismatches(
    capitalBeforeAllotment(form.statementOfCapital, form.allotments),
    companyData?.statementsOfCapital ?? [],
  );
  if (mismatches.length === 0) return undefined;
  return http400BadRequestResponse({
    request,
    headers: { ...headers },
    message: mismatches.join(". ") + ".",
    error: { reason: CAPITAL_MISMATCH_REASON, mismatches },
  });
}
