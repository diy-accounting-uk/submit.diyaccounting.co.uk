// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/scenarios/assist.js
// Gov-Test-Scenario handlers and canned report content for the HMRC Assist endpoints

const VAT_NOTICE_700 = { title: "VAT Notice 700", url: "https://www.gov.uk/guidance/vat-notice-700-the-vat-guide" };
const VAT_NOTICE_700_WELSH = { title: "Hysbysiad TAW 700", url: "https://www.gov.uk/guidance/vat-notice-700-the-vat-guide" };

/**
 * The VAT Assist (MTD) feedback messages HMRC publishes as its examples, English and Welsh,
 * numbered as HMRC numbers them.
 */
const VAT_FEEDBACK = {
  english: [
    {
      itemNumber: "1",
      title: "HMRC feedback: VAT due on sales appears low",
      body: "The VAT due on sales figure appears lower than expected based on your total sales value.",
      action: "Please review box 1 and box 6 of your VAT return.",
      links: [VAT_NOTICE_700],
      path: "vatDueSales",
    },
    {
      itemNumber: "2",
      title: "Total value of purchases appears high",
      body: "The total value of purchases appears higher than expected based on your total sales value.",
      action: "Please review box 7 of your VAT return.",
      links: [VAT_NOTICE_700],
      path: "totalValuePurchasesExVAT",
    },
  ],
  welsh: [
    {
      itemNumber: "1",
      title: "Mae TAW sy'n ddyledus ar werthiannau yn ymddangos yn isel",
      body: "Mae'r ffigur TAW sy'n ddyledus ar werthiannau yn ymddangos yn is na'r disgwyl yn seiliedig ar gyfanswm eich gwerthiannau.",
      action: "Adolygwch flwch 1 a blwch 6 eich ffurflen TAW.",
      links: [VAT_NOTICE_700_WELSH],
      path: "vatDueSales",
    },
    {
      itemNumber: "2",
      title: "Mae cyfanswm pryniannau'n uchel",
      body: "Mae cyfanswm y pryniannau'n ymddangos yn uwch na'r disgwyl.",
      action: "Adolygwch flwch 7 o'ch ffurflen TAW.",
      links: [VAT_NOTICE_700_WELSH],
      path: "totalValuePurchasesExVAT",
    },
  ],
};

const VAT_NO_FEEDBACK = {
  english: [
    {
      itemNumber: "0",
      title: "HMRC feedback: HMRC Assist has not returned any messages.",
      body: "This is not a complete check of your return or confirmation that your return is accurate. Your return has not been submitted at this stage.",
      action: "Consider any further checks before finalising your return.",
      links: [{ title: "Go to GOV.UK for more information on HMRC Assist", url: "https://www.gov.uk" }],
    },
  ],
  welsh: [
    {
      itemNumber: "0",
      title: "Nid yw HMRC Assist wedi dychwelyd unrhyw negeseuon.",
      body: "Nid yw hwn yn wiriad cyflawn o'ch datganiad nac yn gadarnhad bod eich datganiad yn gywir. Nid yw eich datganiad wedi'i gyflwyno ar y cam hwn.",
      action: "Ystyriwch unrhyw wiriadau pellach cyn cwblhau eich datganiad.",
      links: [{ title: "Ewch i GOV.UK am ragor o wybodaeth am HMRC Assist", url: "https://www.gov.uk" }],
    },
  ],
};

function copyFeedback(list) {
  return list.map((message) => ({ ...message, links: message.links.map((link) => ({ ...link })) }));
}

/**
 * The English messages of HMRC's default VAT scenario (one feedback message), in the shape the
 * app normalises a report to.
 */
export function vatDefaultMessages() {
  return copyFeedback(VAT_FEEDBACK.english.slice(0, 1)).map(({ itemNumber: _itemNumber, ...message }) => message);
}

/**
 * The English messages of HMRC's multiple-feedback VAT scenario, in the shape the app
 * normalises a report to.
 */
export function vatMultipleMessages() {
  return copyFeedback(VAT_FEEDBACK.english).map(({ itemNumber: _itemNumber, ...message }) => message);
}

/**
 * The feedback arrays of a VAT feedback response.
 * @param {"default"|"multiple"|"none"} kind
 * @returns {{englishFeedback: object[], welshFeedback: object[]}}
 */
export function vatFeedbackLists(kind) {
  const count = kind === "multiple" ? 2 : 1;
  if (kind === "none") {
    return { englishFeedback: copyFeedback(VAT_NO_FEEDBACK.english), welshFeedback: copyFeedback(VAT_NO_FEEDBACK.welsh) };
  }
  return {
    englishFeedback: copyFeedback(VAT_FEEDBACK.english.slice(0, count)),
    welshFeedback: copyFeedback(VAT_FEEDBACK.welsh.slice(0, count)),
  };
}

function invalidRequest(code, message, path) {
  return { status: 400, body: { code: "INVALID_REQUEST", message: "Invalid request", errors: [{ code, message, path }] } };
}

/**
 * The INVALID_REQUEST answer for a mandatory box the request left out.
 * @param {string} field - the request field that is missing
 */
export function missingFieldError(field) {
  return invalidRequest("MANDATORY_FIELD_MISSING", "a mandatory field is missing", `/${field}`);
}

const VAT_ERRORS = {
  VRN_INVALID: { status: 400, body: { code: "VRN_INVALID", message: "The provided VRN is invalid" } },
  PERIOD_KEY_INVALID: {
    status: 400,
    body: { code: "PERIOD_KEY_INVALID", message: "The supplied period key does not match an open obligation" },
  },
  INVALID_REQUEST_PERIOD_KEY_FORMAT: invalidRequest("PERIOD_KEY_INVALID", "period key should be a 4 character string", "/periodKey"),
  INVALID_REQUEST_MANDATORY_FIELD_MISSING: invalidRequest("MANDATORY_FIELD_MISSING", "a mandatory field is missing", "/totalVatDue"),
  REPORT_ID_INVALID: { status: 400, body: { code: "REPORT_ID_INVALID", message: "The provided report ID is invalid" } },
  CORRELATION_ID_INVALID: { status: 400, body: { code: "CORRELATION_ID_INVALID", message: "The provided correlation ID is invalid" } },
  PRESENTED_DATE_TIME_INVALID: {
    status: 400,
    body: { code: "PRESENTED_DATE_TIME_INVALID", message: "The presentedDateTime query parameter is missing or invalid" },
  },
  ACKNOWLEDGEMENT_VALIDATION_FAILED: {
    status: 400,
    body: { code: "ACKNOWLEDGEMENT_VALIDATION_FAILED", message: "The acknowledgement request failed validation" },
  },
  FEEDBACK_INVALID_CREDENTIALS: {
    status: 401,
    body: { code: "INVALID_CREDENTIALS", message: "Invalid Authentication information provided" },
  },
  ACKNOWLEDGE_INVALID_CREDENTIALS: {
    status: 401,
    body: { code: "INVALID_CREDENTIALS", message: "Invalid authentication information provided." },
  },
  VRN_NOT_FOUND: {
    status: 404,
    body: { code: "VRN_NOT_FOUND", message: "The remote endpoint has indicated that the VRN could not be found." },
  },
  INTERNAL_SERVER_ERROR: { status: 500, body: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred." } },
  SERVICE_UNAVAILABLE: { status: 503, body: { code: "SERVICE_UNAVAILABLE", message: "The service is currently unavailable" } },
  TAX_PERIOD_NOT_ENDED: {
    status: 403,
    body: {
      code: "TAX_PERIOD_NOT_ENDED",
      message: "The remote endpoint has indicated that the submission is for a tax period that has not ended",
    },
  },
  RULE_INSOLVENT_TRADER: {
    status: 403,
    body: { code: "RULE_INSOLVENT_TRADER", message: "The remote endpoint has indicated that the Trader is insolvent" },
  },
  CLIENT_OR_AGENT_NOT_AUTHORISED: {
    status: 403,
    body: { code: "CLIENT_OR_AGENT_NOT_AUTHORISED", message: "The client and/or agent is not authorised" },
  },
  NOT_FOUND: {
    status: 404,
    body: { code: "MATCHING_RESOURCE_NOT_FOUND", message: "A resource with the name in the request can not be found in the API." },
  },
};

export const vatErrors = VAT_ERRORS;

/**
 * Get the VAT feedback-request response for a Gov-Test-Scenario header.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {null|{status: number, body: object}|{feedback: "multiple"|"none"}}
 */
export function getVatFeedbackScenarioResponse(scenario) {
  if (!scenario) return null;
  switch (scenario.toUpperCase()) {
    case "MULTIPLE_FEEDBACK":
      return { feedback: "multiple" };
    case "NO_FEEDBACK":
      return { feedback: "none" };
    case "INVALID_VRN":
      return VAT_ERRORS.VRN_INVALID;
    case "INVALID_PERIODKEY":
      return VAT_ERRORS.INVALID_REQUEST_PERIOD_KEY_FORMAT;
    case "INVALID_REQUEST":
      return VAT_ERRORS.INVALID_REQUEST_MANDATORY_FIELD_MISSING;
    case "TAX_PERIOD_NOT_ENDED":
      return VAT_ERRORS.TAX_PERIOD_NOT_ENDED;
    case "INSOLVENT_TRADER":
      return VAT_ERRORS.RULE_INSOLVENT_TRADER;
    default:
      return null;
  }
}

/**
 * Get the VAT acknowledge response for a Gov-Test-Scenario header.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {null|{status: number, body: object}}
 */
export function getVatAcknowledgeScenarioResponse(scenario) {
  if (!scenario) return null;
  switch (scenario.toUpperCase()) {
    case "INVALID_VRN":
      return VAT_ERRORS.VRN_INVALID;
    case "INVALID_REPORTID":
      return VAT_ERRORS.REPORT_ID_INVALID;
    case "INVALID_CORRELATIONID":
      return VAT_ERRORS.CORRELATION_ID_INVALID;
    case "INVALID_DATETIME":
      return VAT_ERRORS.PRESENTED_DATE_TIME_INVALID;
    case "INVALID_CREDENTIALS":
      return VAT_ERRORS.ACKNOWLEDGE_INVALID_CREDENTIALS;
    case "NOT_AUTHORISED":
      return VAT_ERRORS.CLIENT_OR_AGENT_NOT_AUTHORISED;
    case "ACKNOWLEDGEMENT_VALIDATION_FAILED":
      return VAT_ERRORS.ACKNOWLEDGEMENT_VALIDATION_FAILED;
    case "NOT_FOUND":
      return VAT_ERRORS.NOT_FOUND;
    default:
      return null;
  }
}

const ITSA_MESSAGES = [
  {
    title: "Review your self-employment income",
    body: "Your turnover appears low compared to similar businesses.",
    action: "If the figures are correct, you do not need to change anything.",
    links: [{ title: "Go to GOV.UK to learn more about working out your business income", url: "https://www.gov.uk/income-tax" }],
    path: "/individuals/business/self-employment/{nino}/{businessId}/cumulative/{taxYear}",
  },
  {
    title: "Review your allowable expenses",
    body: "Your expenses appear high compared to your turnover.",
    action: "If the figures are correct, you do not need to change anything.",
    links: [
      { title: "Go to GOV.UK to learn more about simplified expenses", url: "https://www.gov.uk/simpler-income-tax-simplified-expenses" },
    ],
    path: "/individuals/business/self-employment/{nino}/{businessId}/cumulative/{taxYear}",
  },
];

export const ITSA_NO_MESSAGES_CALCULATION_ID = "620490b4-06e3-4fef-a555-6fd0877dc7ca";
export const ITSA_NOT_FOUND_CALCULATION_ID = "640490b4-06e3-4fef-a555-6fd0877dc7ca";

export function itsaDefaultMessages() {
  return ITSA_MESSAGES.map((message) => ({ ...message, links: message.links.map((link) => ({ ...link })) }));
}

const NOT_FOUND = { status: 404, body: { code: "MATCHING_RESOURCE_NOT_FOUND", message: "Matching resource not found" } };
const NOT_AUTHORISED = {
  status: 403,
  body: { code: "CORRELATION_ID_NOT_AUTHORISED", message: "The correlation id was not issued for this report" },
};

/**
 * Get the report-request response for a Gov-Test-Scenario header.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {null|{status: number, body?: object}}
 */
export function getReportScenarioResponse(scenario) {
  if (!scenario) return null;
  switch (scenario.toUpperCase()) {
    case "NO_MESSAGES":
      return { status: 204 };
    case "NOT_FOUND":
      return NOT_FOUND;
    default:
      return null;
  }
}

/**
 * Get the acknowledge response for a Gov-Test-Scenario header.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {null|{status: number, body?: object}}
 */
export function getAcknowledgeScenarioResponse(scenario) {
  if (!scenario) return null;
  switch (scenario.toUpperCase()) {
    case "CORRELATION_ID_NOT_AUTHORISED":
      return NOT_AUTHORISED;
    case "NOT_FOUND":
      return NOT_FOUND;
    default:
      return null;
  }
}

export const acknowledgeErrors = { NOT_FOUND, NOT_AUTHORISED };
