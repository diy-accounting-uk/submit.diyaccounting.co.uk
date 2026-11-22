// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseChangeOfNameXml.js
// Builds the ChangeOfName form body (companiesHouseXmlGateway.js wraps it in the FormSubmission
// envelope): the notice of a change of company name, the online form of Companies House's NM01.
// ChangeOfName-v2-6.xsd takes how the name was changed (MethodOfChange), the proposed name, the
// date of the meeting that passed the resolution, whether the same-day service is asked for, and
// NoticeGiven, which the schema fixes at true.
//
// A letter that gives permission for a sensitive word, or says the holder of the same name does not
// object, is not part of this body: it travels as a Document of the envelope, whose Category names
// it (supportingDocumentFor).

import { escapeXmlText } from "../lib/xmlDom.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// How a company changes its name, and the schema's code for each. The schema's third code, LLP, is
// for a limited liability partnership, which this site does not file for.
export const NAME_CHANGE_METHODS = {
  resolution: "RESOLUTION",
  articles: "ARTICLES",
};

// The letters that may travel with the form, and the envelope's Document category for each.
export const NAME_SUPPORTING_DOCUMENTS = {
  "sensitive-word-permission": { category: "SUPPNAMEAUTH", filename: "name-permission.pdf" },
  "same-as-no-objection": { category: "SUPPEXISTNAME", filename: "name-no-objection.pdf" },
};

// baseTypes-v2-10.xsd's companyNameString, as ChangeOfName restricts it: three characters of the
// first set, then up to 157 of the same set and * = # % +. Upper case only.
const NAME_CHARACTERS =
  "-,.:; 0-9A-Z&@$£¥€'\"«»‘’“”?!/\\\\()\\[\\]{}<>ÀÁÂÃÄÅĀĂĄÆǼÇĆĈĊČÞĎÐÈÉÊËĒĔĖĘĚĜĞĠĢĤĦÌÍÎÏĨĪĬĮİĴĶĹĻĽĿŁÑŃŅŇŊÒÓÔÕÖØŌŎŐǾŒŔŖŘŚŜŞŠŢŤŦÙÚÛÜŨŪŬŮŰŲŴẀẂẄỲÝŶŸŹŻŽ";
const PROPOSED_NAME = new RegExp(`^[${NAME_CHARACTERS}]{3}[${NAME_CHARACTERS}*=#%+]{0,157}$`, "u");

/**
 * Whether a name fits the schema's ProposedCompanyName: 3 to 160 characters of its character set.
 * @param {string} name
 * @returns {boolean}
 */
export function isValidProposedCompanyName(name) {
  return typeof name === "string" && PROPOSED_NAME.test(name);
}

/**
 * Build the ChangeOfName form's root element (namespace http://xmlgw.companieshouse.gov.uk).
 *
 * @param {object} input
 * @param {string} input.method - a key of NAME_CHANGE_METHODS
 * @param {string} input.proposedName - the new name, in upper case
 * @param {string} [input.meetingDate] - ISO date the resolution was passed; required for a resolution
 * @param {boolean} [input.sameDay] - asks for the same-day service
 * @returns {string} the ChangeOfName element's XML
 */
export function buildChangeOfNameBody({ method, proposedName, meetingDate, sameDay = false }) {
  const methodCode = NAME_CHANGE_METHODS[method];
  if (!methodCode) throw new Error(`unknown method ${method}`);
  if (!isValidProposedCompanyName(proposedName)) {
    throw new Error("proposedName must be 3 to 160 characters of the Companies House company name character set, in upper case");
  }
  if (methodCode === "RESOLUTION" && !meetingDate) throw new Error("a change by resolution needs its meetingDate");
  if (meetingDate && !ISO_DATE.test(meetingDate)) throw new Error("meetingDate must be YYYY-MM-DD");
  const meetingXml = meetingDate ? `<MeetingDate>${meetingDate}</MeetingDate>` : "";
  return (
    `<ChangeOfName xmlns="http://xmlgw.companieshouse.gov.uk" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="http://xmlgw.companieshouse.gov.uk http://xmlgw.companieshouse.gov.uk/v1-0/schema/forms/ChangeOfName-v2-6.xsd">` +
    `<MethodOfChange>${methodCode}</MethodOfChange><ProposedCompanyName>${escapeXmlText(proposedName)}</ProposedCompanyName>` +
    `${meetingXml}<SameDay>${sameDay ? "true" : "false"}</SameDay><NoticeGiven>true</NoticeGiven>` +
    `</ChangeOfName>`
  );
}

/**
 * The envelope's Document for a supporting letter, as buildFormSubmission takes it.
 *
 * @param {object} input
 * @param {string} input.kind - a key of NAME_SUPPORTING_DOCUMENTS
 * @param {string} input.contentBase64 - the PDF, base64
 * @param {string} input.date - ISO date of the filing
 * @returns {{data: string, date: string, filename: string, contentType: string, category: string}}
 */
export function supportingDocumentFor({ kind, contentBase64, date }) {
  const document = NAME_SUPPORTING_DOCUMENTS[kind];
  if (!document) throw new Error(`unknown supporting document ${kind}`);
  return { data: contentBase64, date, filename: document.filename, contentType: "application/pdf", category: document.category };
}
