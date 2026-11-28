// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/filing-failure.js
// What kind of failure a filing met, from the status and the body of the answer, and what the
// person does next. Four kinds: a fault in Submit; Submit's own HMRC or Companies House credentials
// refused; the person's own credentials or account refused; a business error HMRC or Companies
// House answered. A 502 that carries their errors is their answer and takes one of the last three
// by its error numbers.

function siteText(id, english, values) {
  if (globalThis.siteText) return globalThis.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

export const FAILURE_KINDS = {
  submitFault: "submit-fault",
  submitCredentials: "submit-credentials",
  yourCredentials: "your-credentials",
  businessError: "business-error",
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
// Companies House's GovTalk number for a form Submit built wrongly.
const COMPANIES_HOUSE_SOFTWARE_FAULT = "505";

function serviceName(service) {
  return service === "companiesHouse" ? siteText("ct.failure-service-ch", "Companies House") : siteText("ct.failure-service-hmrc", "HMRC");
}

/** The errors HMRC or Companies House gave, as the server passes them on. */
export function serviceErrorsOf(error) {
  const errors = error?.body?.error?.errors ?? error?.body?.errors;
  return Array.isArray(errors) ? errors : [];
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
 * @param {{status?: number, reason?: string, message?: string, body?: object, requestId?: string}} error - the client's error for the answer
 * @param {{service: "hmrc"|"companiesHouse"}} where - the service the request was for
 * @returns {{kind: string, service: string, cause: string, next: {label: string, href: string}|null, errors?: string[], requestId?: string}}
 */
export function classifyFilingFailure(error, { service }) {
  const status = error?.status;
  const reason = error?.reason ?? error?.body?.reason;
  const errors = serviceErrorsOf(error);
  const numbers = errors.map((entry) => String(entry?.number ?? ""));

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
 * @param {{sent: string, answers: string, failure: ReturnType<typeof classifyFilingFailure>}} detail
 */
export function failureDetailElement(doc, { sent, answers, failure }) {
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
