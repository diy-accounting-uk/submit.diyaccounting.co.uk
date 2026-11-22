// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHousePscStatementXml.js
// Builds the PSCStatementNotification and PSCStatementWithdrawal form bodies
// (companiesHouseXmlGateway.js wraps each in the FormSubmission envelope): the online forms of
// Companies House's PSC08 (a PSC statement) and PSC09 (an update to one: the statement is no
// longer true). PSCBaseTypes-v1-4.xsd's PSCStatementNotificationType holds one statement, a company
// statement, a PSC statement or a statement linked to a named PSC; the notification adds the
// relevant date, the withdrawal the date it was withdrawn and, for a restrictions notice, why.
//
// Three statements Companies House no longer takes on a notification (the schema's own notes say
// "CANNOT BE USED ON PSCStatementNotification SCHEMA") stay on the register from before, so they
// can be withdrawn.

import { entityNameXml, individualIdentificationXml, optionalElement, pscElementName } from "./companiesHousePscParticularsXml.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Each statement: the element it is given in, and whether a notification may give it.
 * PSC_LINKED statements also name the PSC they are about.
 */
export const PSC_STATEMENTS = {
  NO_INDIVIDUAL_OR_ENTITY_WITH_SIGNFICANT_CONTROL: { element: "CompanyStatement", notifiable: true },
  STEPS_TO_FIND_PSC_NOT_YET_COMPLETED: { element: "CompanyStatement", notifiable: false },
  PSC_EXISTS_BUT_NOT_IDENTIFIED: { element: "PSCStatement", notifiable: false },
  PSC_DETAILS_NOT_CONFIRMED: { element: "PSCStatement", notifiable: false },
  PSC_CONTACTED_BUT_NO_RESPONSE: { element: "PSCStatement", notifiable: true },
  RESTRICTIONS_NOTICE_ISSUED_TO_PSC: { element: "PSCStatement", notifiable: true },
  AWAITING_CONFIRMATION_FROM_PSC: { element: "PSCStatement", notifiable: true },
  PSC_HAS_FAILED_TO_CONFIRM_CHANGED_DETAILS: { element: "PSCLinkedStatement", notifiable: true },
};

/** Why a restrictions notice was withdrawn, as RestrictionsNoticeWithdrawalReasonType has it. */
export const RESTRICTIONS_WITHDRAWAL_REASONS = ["RESTRICTIONS_NOTICE_WITHDRAWN_BY_COMPANY", "RESTRICTIONS_NOTICE_WITHDRAWN_BY_COURT_ORDER"];

const RESTRICTIONS_NOTICE = "RESTRICTIONS_NOTICE_ISSUED_TO_PSC";

/** Whether a statement names the PSC it is about. */
export const isLinkedStatement = (statement) => PSC_STATEMENTS[statement]?.element === "PSCLinkedStatement";

// The statement's choice of PSCStatementNotificationType: the statement, and for a linked
// statement the PSC by the particulars the register shows.
function statementXml(input) {
  const definition = PSC_STATEMENTS[input.statement];
  if (!definition) throw new Error(`unknown PSC statement ${input.statement}`);
  if (definition.element !== "PSCLinkedStatement") {
    return optionalElement(definition.element, input.statement);
  }
  const elementName = pscElementName(input.kind);
  const particulars = elementName === "Individual" ? individualIdentificationXml(input) : entityNameXml(elementName, input.name);
  return `<PSCLinkedStatement>${optionalElement("Statement", input.statement)}<${elementName}>${particulars}</${elementName}></PSCLinkedStatement>`;
}

function root(name, content) {
  return (
    `<${name} xmlns="http://xmlgw.companieshouse.gov.uk" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="http://xmlgw.companieshouse.gov.uk http://xmlgw.companieshouse.gov.uk/v1-0/schema/forms/${name}-v1-2.xsd">` +
    `${content}</${name}>`
  );
}

/**
 * Build the PSCStatementNotification form's root element (namespace http://xmlgw.companieshouse.gov.uk).
 *
 * @param {object} input
 * @param {string} input.statement - a key of PSC_STATEMENTS whose notifiable is true
 * @param {string} [input.kind] - for a linked statement, a key of PSC_KIND_ELEMENTS, with the PSC's
 *   particulars as companiesHousePscParticularsXml.js reads them (title, surname, forename,
 *   otherForenames, dobMonth, dobYear, or name)
 * @param {string} input.relevantDate - ISO date, as PSC08 section 2 describes it
 * @returns {string} the PSCStatementNotification element's XML
 */
export function buildPscStatementNotificationBody(input) {
  if (PSC_STATEMENTS[input.statement] && !PSC_STATEMENTS[input.statement].notifiable) {
    throw new Error(`${input.statement} cannot be given on a notification, only withdrawn`);
  }
  if (!ISO_DATE.test(input.relevantDate ?? "")) throw new Error("relevantDate must be YYYY-MM-DD");
  return root("PSCStatementNotification", `${statementXml(input)}<RelevantDate>${input.relevantDate}</RelevantDate>`);
}

/**
 * Build the PSCStatementWithdrawal form's root element (namespace http://xmlgw.companieshouse.gov.uk).
 *
 * @param {object} input
 * @param {string} input.statement - a key of PSC_STATEMENTS, the statement no longer true
 * @param {string} [input.kind] - for a linked statement, the PSC as for buildPscStatementNotificationBody
 * @param {string} input.withdrawalDate - ISO date, PSC09 section 2's relevant date
 * @param {string} [input.restrictionsWithdrawalReason] - one of RESTRICTIONS_WITHDRAWAL_REASONS, only
 *   with RESTRICTIONS_NOTICE_ISSUED_TO_PSC
 * @returns {string} the PSCStatementWithdrawal element's XML
 */
export function buildPscStatementWithdrawalBody(input) {
  if (!ISO_DATE.test(input.withdrawalDate ?? "")) throw new Error("withdrawalDate must be YYYY-MM-DD");
  const reason = input.restrictionsWithdrawalReason;
  if (reason !== undefined && reason !== null) {
    if (input.statement !== RESTRICTIONS_NOTICE) throw new Error(`a restrictions withdrawal reason goes only with ${RESTRICTIONS_NOTICE}`);
    if (!RESTRICTIONS_WITHDRAWAL_REASONS.includes(reason)) throw new Error(`unknown restrictions withdrawal reason ${reason}`);
  }
  return root(
    "PSCStatementWithdrawal",
    `${statementXml(input)}<WithdrawalDate>${input.withdrawalDate}</WithdrawalDate>` +
      optionalElement("RestrictionsNoticeWithdrawalReason", reason),
  );
}
