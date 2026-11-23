// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseAllotmentOfSharesXml.js
// Builds the ReturnofAllotmentShares form body (companiesHouseXmlGateway.js wraps it in the
// FormSubmission envelope): the return of an allotment of shares, the online form of Companies
// House's SH01. ReturnofAllotmentShares-v3-0.xsd takes the date or period of the allotment, the
// company's statement of capital as it stands after the allotment (a Capital for each currency,
// with a Shares for each class), and an Allotment for each class of shares allotted, with the
// consideration when the shares are paid up otherwise than in cash.
//
// The totals of each Capital are added up here from its classes, so a statement cannot state a
// total its classes do not make.

import { escapeXmlText } from "../lib/xmlDom.js";
import { sumDecimals, toMillionths } from "../../web/public/lib/share-capital.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function decimal(value, name) {
  if (toMillionths(value) === null) throw new Error(`${name} must be a number of at most six decimal places`);
  return String(value).trim();
}

function allotmentXml(allotment) {
  return (
    `<Allotment><ShareClass>${escapeXmlText(allotment.shareClass)}</ShareClass>` +
    `<NumShares>${decimal(allotment.numShares, "numShares")}</NumShares>` +
    `<AmountPaidDuePerShare>${decimal(allotment.amountPaidPerShare, "amountPaidPerShare")}</AmountPaidDuePerShare>` +
    `<AmountUnpaidPerShare>${decimal(allotment.amountUnpaidPerShare, "amountUnpaidPerShare")}</AmountUnpaidPerShare>` +
    `<ShareCurrency>${escapeXmlText(allotment.currency)}</ShareCurrency>` +
    `<ShareValue>${decimal(allotment.nominalValue, "nominalValue")}</ShareValue>` +
    (allotment.consideration ? `<Consideration>${escapeXmlText(allotment.consideration)}</Consideration>` : "") +
    `</Allotment>`
  );
}

function capitalXml(capital) {
  if (!capital.shares?.length) throw new Error("a statement of capital needs at least one class of shares");
  const sharesXml = capital.shares
    .map(
      (share) =>
        `<Shares><ShareClass>${escapeXmlText(share.shareClass)}</ShareClass>` +
        `<PrescribedParticulars>${escapeXmlText(share.prescribedParticulars)}</PrescribedParticulars>` +
        `<NumShares>${decimal(share.numShares, "numShares")}</NumShares>` +
        `<AggregateNominalValue>${decimal(share.aggregateNominalValue, "aggregateNominalValue")}</AggregateNominalValue></Shares>`,
    )
    .join("");
  return (
    `<Capital><TotalAmountUnpaid>${decimal(capital.totalAmountUnpaid, "totalAmountUnpaid")}</TotalAmountUnpaid>` +
    `<TotalNumberOfIssuedShares>${sumDecimals(capital.shares.map((share) => share.numShares))}</TotalNumberOfIssuedShares>` +
    `<ShareCurrency>${escapeXmlText(capital.currency)}</ShareCurrency>` +
    `<TotalAggregateNominalValue>${sumDecimals(capital.shares.map((share) => share.aggregateNominalValue))}</TotalAggregateNominalValue>` +
    `${sharesXml}</Capital>`
  );
}

/**
 * Build the ReturnofAllotmentShares form's root element (namespace http://xmlgw.companieshouse.gov.uk).
 *
 * @param {object} input
 * @param {string} input.startDate - ISO date the shares were allotted, or the first day of the period
 * @param {string} [input.endDate] - ISO date, the last day of a period of allotments
 * @param {Array<{currency: string, totalAmountUnpaid: string, shares: Array<{shareClass: string,
 *   prescribedParticulars: string, numShares: string, aggregateNominalValue: string}>}>} input.statementOfCapital -
 *   the capital after the allotment, one entry for each currency
 * @param {Array<{shareClass: string, numShares: string, amountPaidPerShare: string, amountUnpaidPerShare: string,
 *   currency: string, nominalValue: string, consideration?: string}>} input.allotments - consideration states
 *   what the shares were allotted for when they are paid up otherwise than in cash
 * @returns {string} the ReturnofAllotmentShares element's XML
 */
export function buildAllotmentOfSharesBody({ startDate, endDate, statementOfCapital, allotments }) {
  if (!ISO_DATE.test(startDate ?? "")) throw new Error("startDate must be YYYY-MM-DD");
  if (endDate !== undefined && endDate !== null && !ISO_DATE.test(endDate)) throw new Error("endDate must be YYYY-MM-DD");
  if (!statementOfCapital?.length) throw new Error("a return of allotment needs the statement of capital");
  if (!allotments?.length) throw new Error("a return of allotment needs at least one allotment");
  return (
    `<ReturnofAllotmentShares xmlns="http://xmlgw.companieshouse.gov.uk" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="http://xmlgw.companieshouse.gov.uk http://xmlgw.companieshouse.gov.uk/v1-0/schema/forms/ReturnofAllotmentShares-v3-0.xsd">` +
    `<StartPeriodSharesAllotted>${startDate}</StartPeriodSharesAllotted>` +
    (endDate ? `<EndPeriodSharesAllotted>${endDate}</EndPeriodSharesAllotted>` : "") +
    `<StatementOfCapital>${statementOfCapital.map(capitalXml).join("")}</StatementOfCapital>` +
    `${allotments.map(allotmentXml).join("")}</ReturnofAllotmentShares>`
  );
}
