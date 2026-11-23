// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseRecordLocationXml.js
// Builds the RecordChangeOfLocation form body (companiesHouseXmlGateway.js wraps it in the
// FormSubmission envelope): the notice that company records have moved to the company's single
// alternative inspection location (SAIL), which Companies House makes a form AD03, or back to the
// registered office, which it makes a form AD04. RecordChangeofLocation-v3-0.xsd takes one
// direction and a RegisterList for each record moved; a move to the registered office may instead
// set RemoveSAILAddressInd, which moves every record there and takes the SAIL address off the
// public record.

// The records the schema's RecordType names, in the schema's order.
export const RECORD_TYPES = [
  "MEMBER",
  "DIRCONTRACT",
  "DIRINDEM",
  "RESMEET",
  "DEB",
  "CHARGEEWNI",
  "CHARGESC",
  "OWNSHRPURCH",
  "OWNSHRCAP",
  "INVEST",
  "INTEREST",
];

export const RECORD_DESTINATIONS = ["sail", "registered-office"];

function registerLists(records) {
  return records.map((record) => `<RegisterList><RecordType>${record}</RecordType></RegisterList>`).join("");
}

/**
 * Build the RecordChangeOfLocation form's root element (namespace http://xmlgw.companieshouse.gov.uk).
 *
 * @param {object} input
 * @param {"sail"|"registered-office"} input.destination - where the records are kept from now on
 * @param {string[]} [input.records] - RECORD_TYPES values, each once; at least one, unless
 *   removeSailAddress is set
 * @param {boolean} [input.removeSailAddress] - with destination registered-office only: every
 *   record moves there and the SAIL address comes off the public record
 * @returns {string} the RecordChangeOfLocation element's XML
 */
export function buildRecordChangeOfLocationBody({ destination, records = [], removeSailAddress = false }) {
  if (!RECORD_DESTINATIONS.includes(destination)) throw new Error(`unknown destination ${destination}`);
  const unknown = records.find((record) => !RECORD_TYPES.includes(record));
  if (unknown) throw new Error(`unknown record type ${unknown}`);
  if (new Set(records).size !== records.length) throw new Error("a record type is named twice");
  if (removeSailAddress && destination !== "registered-office") {
    throw new Error("the SAIL address is removed only by a move to the registered office");
  }
  if (removeSailAddress && records.length > 0) throw new Error("removing the SAIL address moves every record, so none is named");
  if (!removeSailAddress && records.length === 0) throw new Error("name at least one record that has moved");
  const ordered = RECORD_TYPES.filter((record) => records.includes(record));
  const moved = removeSailAddress ? `<RemoveSAILAddressInd>true</RemoveSAILAddressInd>` : registerLists(ordered);
  const body =
    destination === "sail"
      ? `<MoveToSAILAddress>true</MoveToSAILAddress>${moved}`
      : `<MoveToRegisteredOffice>true</MoveToRegisteredOffice>${moved}`;
  return (
    `<RecordChangeOfLocation xmlns="http://xmlgw.companieshouse.gov.uk" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xsi:schemaLocation="http://xmlgw.companieshouse.gov.uk http://xmlgw.companieshouse.gov.uk/v1-0/schema/forms/RecordChangeofLocation-v3-0.xsd">` +
    `${body}</RecordChangeOfLocation>`
  );
}
