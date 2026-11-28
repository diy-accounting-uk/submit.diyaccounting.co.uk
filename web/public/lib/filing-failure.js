// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/filing-failure.js
// What kind of failure a filing met, from the status and the body of the answer, and what the
// person does next. Six kinds: a fault in Submit; Submit's own HMRC or Companies House credentials
// refused; the person's own credentials or account refused; a business error HMRC or Companies
// House answered; HMRC unable to take the request; Companies House not answering when Submit read
// the company, before anything was sent. A 502 that carries their errors is their answer and takes
// its kind by its error numbers; an MTD API's answer takes it by HMRC's status and codes. A Stripe
// journey adds two kinds: no answer from Submit at all, and a request the site's firewall blocked.

function siteText(id, english, values) {
  if (globalThis.siteText) return globalThis.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

export const FAILURE_KINDS = {
  submitFault: "submit-fault",
  submitCredentials: "submit-credentials",
  yourCredentials: "your-credentials",
  businessError: "business-error",
  notAnswering: "not-answering",
  connection: "connection",
  blocked: "blocked",
  serviceUnavailable: "service-unavailable",
};

export const HELP_HREF = "/help.html";

// HMRC's GovTalk number for a Government Gateway user ID or password it did not accept.
const HMRC_AUTHENTICATION_FAILURE = "1046";
// HMRC's GovTalk number for a message that does not validate against the GovTalk schema: Submit
// built it wrongly.
const HMRC_SCHEMA_FAULT = "1001";
// Companies House's GovTalk numbers for the presenter account Submit files under: its
// authentication, the account itself and its credit for the fee.
const COMPANIES_HOUSE_PRESENTER_ERRORS = new Set(["502", "5003", "5006", "9984"]);
// The code a Companies House route answers with when it could not read the company before sending,
// so nothing was sent.
const COMPANY_UNREAD = "company-unread";
// Companies House's GovTalk number for a form Submit built wrongly.
const COMPANIES_HOUSE_SOFTWARE_FAULT = "505";

function serviceName(service) {
  return service === "companiesHouse" ? siteText("ct.failure-service-ch", "Companies House") : siteText("ct.failure-service-hmrc", "HMRC");
}

// The codes HMRC's MTD APIs give when they do not accept the authorisation a request carries.
const HMRC_AUTHORISATION_CODES = new Set([
  "CLIENT_OR_AGENT_NOT_AUTHORISED",
  "INVALID_CREDENTIALS",
  "MISSING_CREDENTIALS",
  "INVALID_BEARER_TOKEN",
  "UNAUTHORIZED",
]);

/** The errors HMRC or Companies House gave, as the server passes them on. */
export function serviceErrorsOf(error) {
  const errors = error?.body?.error?.errors ?? error?.body?.errors;
  if (Array.isArray(errors)) return errors;
  return hmrcApiErrorsOf(error);
}

// HMRC's MTD APIs answer {code, message} or {code, message, errors: [{code, message}]}, which the
// server passes on as error.responseBody beside HMRC's status.
function hmrcApiErrorsOf(error) {
  const body = error?.body?.error?.responseBody;
  if (!body || typeof body !== "object") return [];
  let entries = [];
  if (Array.isArray(body.errors) && body.errors.length > 0) entries = body.errors;
  else if (body.code) entries = [body];
  return entries.map((entry) => ({ code: String(entry.code ?? ""), text: entry.message, location: entry.code }));
}

// GovTalk answers carry an error's words in text, Companies House's filing API in error.
function errorText(entry) {
  const text = String(entry?.text ?? entry?.message ?? entry?.error ?? "").trim();
  const location = String(entry?.location ?? "").trim();
  return location ? siteText("ct.failure-error-at", "{text} ({location})", { text, location }) : text;
}

function signInNext() {
  return { label: siteText("widget.sign-in-again", "Sign in again"), href: "/auth/login.html" };
}

function bundlesNext() {
  return { label: siteText("widget.add-a-bundle", "Add a bundle"), href: "/bundles.html" };
}

function helpNext() {
  return { label: siteText("ct.failure-help", "Help"), href: HELP_HREF };
}

function yourCredentials(service, cause, next) {
  return { kind: FAILURE_KINDS.yourCredentials, service, cause, next };
}

/**
 * The kind of a filing's failure and its next step.
 * @param {{status?: number, reason?: string, message?: string, body?: object, requestId?: string}} error - the client's error for the
 *   answer; for HMRC's MTD APIs, body.error carries hmrcResponseCode and responseBody
 * @param {{service: "hmrc"|"companiesHouse"}} where - the service the request was for
 * @returns {{kind: string, service: string, cause: string, next: {label: string, href: string}|null, errors?: string[], requestId?: string}}
 */
export function classifyFilingFailure(error, { service }) {
  const status = error?.status;
  const reason = error?.reason ?? error?.body?.reason;
  const errors = serviceErrorsOf(error);
  const numbers = errors.map((entry) => String(entry?.number ?? ""));
  const hmrcStatus = error?.body?.error?.hmrcResponseCode;

  if (
    service === "hmrc" &&
    (reason === "hmrc_scope_insufficient" ||
      hmrcStatus === 401 ||
      errors.some((entry) => HMRC_AUTHORISATION_CODES.has(String(entry?.code ?? ""))))
  ) {
    return yourCredentials(
      "hmrc",
      siteText(
        "itsa.failure-hmrc-authorisation",
        "HMRC did not accept the authorisation Submit holds for you. Send again, and sign in to HMRC when it asks.",
      ),
      null,
    );
  }
  if (service === "hmrc" && typeof hmrcStatus === "number" && (hmrcStatus === 429 || hmrcStatus >= 500)) {
    return {
      kind: FAILURE_KINDS.serviceUnavailable,
      service,
      cause: siteText("itsa.failure-hmrc-unavailable", "HMRC could not take the request just now. Try again later."),
      next: null,
      errors: errors.map(errorText).filter(Boolean),
    };
  }
  if (service === "hmrc" && typeof hmrcStatus === "number" && errors.length > 0) return businessError(service, errors);

  if (status === 401) {
    return yourCredentials(service, siteText("widget.failure-sign-in-expired", "Your sign-in has expired."), signInNext());
  }
  if (reason === "tokens_exhausted") {
    return yourCredentials(service, siteText("widget.failure-no-tokens", "You have no tokens left."), bundlesNext());
  }
  if (status === 403 || reason === "BUNDLE_ENTITLEMENT_REQUIRED") {
    return yourCredentials(service, siteText("widget.failure-no-bundle", "Your account has no bundle that allows this."), bundlesNext());
  }
  if (
    reason === "invalid-company-authentication-code" ||
    errors.some((entry) => /^invalid\s+companyauthenticationcode\b/i.test(String(entry?.text ?? "").trim()))
  ) {
    return yourCredentials(
      "companiesHouse",
      siteText(
        "ct.failure-auth-code",
        "Companies House did not accept the company authentication code. Check the 6 to 8 characters in the letter Companies House sent the company, and enter it again.",
      ),
      null,
    );
  }
  if (service === "hmrc" && numbers.includes(HMRC_AUTHENTICATION_FAILURE)) {
    return yourCredentials(
      "hmrc",
      siteText(
        "ct.failure-gateway",
        "HMRC did not accept the Government Gateway user ID or password. Check both, and that the user ID has Corporation Tax for this company.",
      ),
      null,
    );
  }
  if (errors.length > 0) {
    const vendorRefused = service === "hmrc" && errors.some((entry) => /vendor|software|product/i.test(String(entry?.text ?? "")));
    if (vendorRefused || (service === "companiesHouse" && numbers.some((number) => COMPANIES_HOUSE_PRESENTER_ERRORS.has(number)))) {
      return {
        kind: FAILURE_KINDS.submitCredentials,
        service,
        cause: siteText(
          "ct.failure-our-credentials",
          "{service} refused Submit's own credentials. Nothing is wrong with your account. Try again later.",
          { service: serviceName(service) },
        ),
        next: null,
        errors: errors.map(errorText).filter(Boolean),
      };
    }
    if (
      (service === "companiesHouse" && numbers.includes(COMPANIES_HOUSE_SOFTWARE_FAULT)) ||
      (service === "hmrc" && numbers.includes(HMRC_SCHEMA_FAULT))
    ) {
      return submitFault(error);
    }
    return businessError(service, errors);
  }
  if (error?.body?.code === COMPANY_UNREAD) {
    return {
      kind: FAILURE_KINDS.notAnswering,
      service: "companiesHouse",
      cause: siteText(
        "ct.failure-not-answering",
        "{service} did not answer when Submit read the company, so nothing was sent. Try again later.",
        { service: serviceName("companiesHouse") },
      ),
      next: null,
    };
  }
  // No answer at all, or a 5xx: nothing says the answers were refused, so it is not a refusal.
  if (typeof status !== "number" || status >= 500) return submitFault(error);
  return {
    kind: FAILURE_KINDS.businessError,
    service,
    cause: siteText("ct.failure-refused", "The answers were refused before anything was sent. Correct them and send again."),
    next: null,
    errors: error?.message ? [error.message] : [],
  };
}

function businessError(service, errors) {
  return {
    kind: FAILURE_KINDS.businessError,
    service,
    cause: siteText("ct.failure-business", "{service} answered with this error. Correct the answer it names and send again.", {
      service: serviceName(service),
    }),
    next: null,
    errors: errors.map(errorText).filter(Boolean),
  };
}

function submitFault(error) {
  return {
    kind: FAILURE_KINDS.submitFault,
    service: "submit",
    cause: siteText("ct.failure-submit-fault", "This is a fault in Submit, not in your answers or your sign-in."),
    next: helpNext(),
    ...(error?.requestId ? { requestId: error.requestId } : {}),
  };
}

/**
 * The panel under the status messages that says what a failure left behind: what was sent and
 * what was not, where the answers are, and the kind of failure with its next step. It stays until
 * the reader closes it or a newer failure replaces it.
 * @param {Document} doc
 * @param {{sent: string, answers: string, failure: ReturnType<typeof classifyFilingFailure>, technical?: string}} detail - technical
 *   is the server's own message, in English, shown closed under "Technical detail"
 */
export function failureDetailElement(doc, { sent, answers, failure, technical }) {
  const make = (tag, attributes, ...children) => {
    const node = doc.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    node.append(...children);
    return node;
  };
  const panel = make("section", {
    "id": "failureDetail",
    "class": "failure-detail",
    "aria-labelledby": "failureDetailHeading",
    "data-kind": failure.kind,
    "tabindex": "-1",
  });
  const close = make(
    "button",
    { "type": "button", "class": "failure-detail__close", "aria-label": siteText("ct.failure-close", "Close") },
    "×",
  );
  close.addEventListener("click", () => panel.remove());
  panel.append(
    make("h2", { id: "failureDetailHeading" }, siteText("ct.failure-heading", "What happened")),
    make("p", { "data-part": "sent" }, sent),
    make("p", { "data-part": "answers" }, answers),
    make("p", { "data-part": "kind" }, failure.cause),
  );
  if (failure.errors?.length) panel.append(make("ul", { "data-part": "errors" }, ...failure.errors.map((text) => make("li", {}, text))));
  if (failure.next || failure.requestId) {
    const next = make("p", { "data-part": "next" });
    if (failure.next) next.append(make("a", { href: failure.next.href }, failure.next.label));
    if (failure.requestId) {
      next.append(
        failure.next ? " " : "",
        siteText("ct.failure-request-id", "Quote the reference {id} when you ask for help.", { id: failure.requestId }),
      );
    }
    panel.append(next);
  }
  // A message the panel already lists among the errors is not repeated.
  if (technical && !failure.errors?.includes(technical)) {
    panel.append(
      make(
        "details",
        { "data-part": "technical" },
        make("summary", {}, siteText("ct.failure-technical", "Technical detail")),
        make("p", { lang: "en" }, technical),
      ),
    );
  }
  panel.append(close);
  return panel;
}

/** Show a failure's panel after the status messages, in place of an earlier one. */
export function showFailureDetail(doc, detail) {
  doc.getElementById("failureDetail")?.remove();
  const panel = failureDetailElement(doc, detail);
  const container = doc.getElementById("statusMessagesContainer");
  if (container) container.after(panel);
  else doc.body.prepend(panel);
  return panel;
}

/**
 * The kind of a failure on a Stripe journey (a checkout or the subscription page) and its next step.
 * A billing route answers JSON; the site's firewall answers a blocked request with an HTML page.
 * @param {{status?: number, reason?: string, html?: boolean, requestId?: string}} error - the client's error for the answer
 * @returns {{kind: string, service: string, cause: string, next: {label: string, href: string}|null, requestId?: string}}
 */
export function classifyStripeFailure(error) {
  const status = error?.status;
  const reference = error?.requestId ? { requestId: error.requestId } : {};
  if (typeof status !== "number") {
    return {
      kind: FAILURE_KINDS.connection,
      service: "submit",
      cause: siteText("stripe.failure-connection", "Submit did not answer, so Stripe was not asked. Check your connection and try again."),
      next: null,
    };
  }
  if (status === 401) {
    return yourCredentials("submit", siteText("widget.failure-sign-in-expired", "Your sign-in has expired."), signInNext());
  }
  if (status === 403 && error.html) {
    return {
      kind: FAILURE_KINDS.blocked,
      service: "submit",
      cause: siteText("stripe.failure-firewall", "The site's firewall blocked this request before it reached Stripe. Try again later."),
      next: helpNext(),
      ...reference,
    };
  }
  if (status === 403) {
    return yourCredentials(
      "submit",
      siteText("stripe.failure-sign-in-refused", "Submit did not accept your sign-in for this request."),
      signInNext(),
    );
  }
  if (status === 404) {
    return yourCredentials(
      "stripe",
      siteText(
        "stripe.failure-no-subscription",
        "Your account has no subscription paid through Stripe, so there is no subscription page to open.",
      ),
      bundlesNext(),
    );
  }
  if (status === 409 || error.reason === "already-paid") {
    return {
      kind: FAILURE_KINDS.businessError,
      service: "stripe",
      cause: siteText("stripe.failure-already-paid", "The fee for this filing is already paid. Go back to the filing and send it."),
      next: null,
    };
  }
  if (status >= 400 && status < 500) {
    return {
      kind: FAILURE_KINDS.submitFault,
      service: "submit",
      cause: siteText(
        "stripe.failure-refused",
        "Submit refused the request before asking Stripe. This is a fault in Submit, not in your account.",
      ),
      next: helpNext(),
      ...reference,
    };
  }
  return {
    kind: FAILURE_KINDS.submitFault,
    service: "stripe",
    cause: siteText(
      "stripe.failure-no-answer",
      "Submit did not get a page to open from Stripe. This is a fault in Submit or at Stripe, not in your account. Try again later.",
    ),
    next: helpNext(),
    ...reference,
  };
}

// --- The VAT return: HMRC's error codes for a return ----------------------------------------------

const VAT_RECEIPTS_HREF = "/hmrc/receipt/receipts.html";
const VAT_RETURN_HREF = "/hmrc/vat/submitVat.html";

function connectHmrcAgainNext() {
  return { label: siteText("widget.connect-hmrc-again", "Connect to HMRC again"), href: VAT_RETURN_HREF };
}

// HMRC's own words for the error, where its answer carries them; else the client's message.
function hmrcMessageOf(error) {
  const message = error?.body?.responseBody?.message ?? error?.message;
  return typeof message === "string" && message.trim() ? message.trim() : null;
}

function vatBusinessError(cause, error, next = null) {
  const message = hmrcMessageOf(error);
  return { kind: FAILURE_KINDS.businessError, service: "hmrc", cause, next, errors: message ? [message] : [] };
}

// HMRC's codes for a VAT return it refused, with what the person reads and does next. A code
// that names Submit's own request is a fault in Submit.
const HMRC_VAT_ERRORS = {
  VRN_INVALID: (error) =>
    vatBusinessError(
      siteText("vat.failure-vrn", "HMRC did not accept the VAT registration number. Check the 9 numbers and send again."),
      error,
    ),
  PERIOD_KEY_INVALID: (error) =>
    vatBusinessError(
      siteText("vat.failure-period", "HMRC does not know this VAT period. Choose the period from HMRC's open periods and send again."),
      error,
    ),
  DUPLICATE_SUBMISSION: (error) =>
    vatBusinessError(
      siteText(
        "vat.failure-duplicate",
        "HMRC already has a return for this period. Your receipt is on the receipts page. To change a submitted return, contact HMRC.",
      ),
      error,
      { label: siteText("vat.failure-receipts", "See your receipts"), href: VAT_RECEIPTS_HREF },
    ),
  TAX_PERIOD_NOT_ENDED: (error) =>
    vatBusinessError(
      siteText("vat.failure-not-ended", "The VAT period has not ended. Send the return after the period's end date."),
      error,
    ),
  INVALID_MONETARY_AMOUNT: (error) =>
    vatBusinessError(siteText("vat.failure-amount", "HMRC did not accept a box figure. Correct the box it names and send again."), error),
  VAT_TOTAL_VALUE: (error) =>
    vatBusinessError(siteText("vat.failure-box-3", "HMRC did not accept box 3: it must be box 1 plus box 2."), error),
  VAT_NET_VALUE: (error) =>
    vatBusinessError(siteText("vat.failure-box-5", "HMRC did not accept box 5: it must be the difference between boxes 3 and 4."), error),
  CLIENT_OR_AGENT_NOT_AUTHORISED: () =>
    yourCredentials(
      "hmrc",
      siteText(
        "vat.failure-not-authorised",
        "The HMRC sign-in you used has no access to this VAT number. Connect to HMRC with the Government Gateway user ID of this business.",
      ),
      connectHmrcAgainNext(),
    ),
  INVALID_CREDENTIALS: () =>
    yourCredentials("hmrc", siteText("widget.failure-hmrc-expired", "Your HMRC connection has expired."), connectHmrcAgainNext()),
  INSOLVENT_TRADER: (error) =>
    vatBusinessError(
      siteText("vat.failure-insolvent", "HMRC does not take a return online for a trader it lists as insolvent. Contact HMRC."),
      error,
    ),
  NOT_FINALISED: (error) => submitFault(error),
};
HMRC_VAT_ERRORS.INVALID_VRN = HMRC_VAT_ERRORS.VRN_INVALID;
HMRC_VAT_ERRORS.INVALID_PERIODKEY = HMRC_VAT_ERRORS.PERIOD_KEY_INVALID;
HMRC_VAT_ERRORS.INVALID_NUMERIC_VALUE = HMRC_VAT_ERRORS.INVALID_MONETARY_AMOUNT;
HMRC_VAT_ERRORS.RULE_INSOLVENT_TRADER = HMRC_VAT_ERRORS.INSOLVENT_TRADER;

/**
 * The kind of a VAT return's failure: HMRC's error code where it gave one, Submit's own reason
 * for a period HMRC already has, and otherwise the kinds every filing shares.
 * @param {{status?: number, code?: string, reason?: string, message?: string, body?: object}} error
 */
export function classifyHmrcVatFailure(error) {
  const code = error?.reason === "obligation_already_fulfilled" ? "DUPLICATE_SUBMISSION" : error?.code;
  const byCode = HMRC_VAT_ERRORS[code];
  if (byCode) return byCode(error);
  return classifyFilingFailure(error, { service: "hmrc" });
}
