// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/widgets/hmrc-assist-messages.js
// The HMRC Assist check: a control that asks HMRC for feedback on a draft return, shows HMRC's
// messages verbatim and in order, and tells HMRC they were displayed. Advisory only: the submit
// control is held only while the request is in flight, and a failed request leaves the form as it was.

(function () {
  "use strict";

  const MAX_MESSAGES = 5;
  const UNACKNOWLEDGED_KEY = "hmrcAssistUnacknowledged";
  const DEFAULT_ACK_RETRY_BASE_MS = 1000;
  const MAX_ACK_RETRY_DELAY_MS = 30000;
  const RETRYABLE_STATUSES = [408, 425, 429];

  const ROUTES = {
    vat: { report: "/api/v1/hmrc/vat/assist/report", acknowledge: "/api/v1/hmrc/vat/assist/acknowledge" },
    itsa: { report: "/api/v1/hmrc/itsa/assist/report", acknowledge: "/api/v1/hmrc/itsa/assist/acknowledge" },
  };

  function readUnacknowledged() {
    try {
      return JSON.parse(sessionStorage.getItem(UNACKNOWLEDGED_KEY) || "{}") || {};
    } catch {
      return {};
    }
  }

  function writeUnacknowledged(entries) {
    try {
      sessionStorage.setItem(UNACKNOWLEDGED_KEY, JSON.stringify(entries));
    } catch {
      // Session storage unavailable: the note on a later page is the only thing lost.
    }
  }

  function markUnacknowledged(kind, key, reportId) {
    const entries = readUnacknowledged();
    entries[`${kind}:${key}`] = reportId;
    writeUnacknowledged(entries);
  }

  function markAcknowledged(kind, key, reportId) {
    const entries = readUnacknowledged();
    if (entries[`${kind}:${key}`] === reportId) {
      delete entries[`${kind}:${key}`];
      writeUnacknowledged(entries);
    }
  }

  function unacknowledgedFor(kind, key) {
    return Boolean(readUnacknowledged()[`${kind}:${key}`]);
  }

  async function buildHeaders() {
    const govClientHeaders = typeof window.getGovClientHeaders === "function" ? await window.getGovClientHeaders() : {};
    const headers = {
      "Authorization": `Bearer ${sessionStorage.getItem("hmrcAccessToken")}`,
      "Content-Type": "application/json",
      ...govClientHeaders,
      "x-wait-time-ms": "0",
    };
    const hmrcAccount = sessionStorage.getItem("hmrcAccount");
    if (hmrcAccount) headers.hmrcAccount = hmrcAccount;
    return headers;
  }

  async function post(url, body) {
    return window.authorizedFetch(url, { method: "POST", headers: await buildHeaders(), body: JSON.stringify(body) });
  }

  function fragmentOf(path) {
    const index = typeof path === "string" ? path.indexOf("#") : -1;
    return index === -1 ? "" : path.slice(index + 1);
  }

  function isWebUrl(url) {
    return typeof url === "string" && /^https?:\/\//i.test(url);
  }

  // Calls back once the element is on screen, or at once when there is nothing to watch.
  function onceInView(element, callback) {
    if (!element || typeof IntersectionObserver === "undefined") {
      callback();
      return null;
    }
    const watcher = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      watcher.disconnect();
      callback();
    });
    watcher.observe(element);
    return watcher;
  }

  function renderMessage(doc, message) {
    const item = doc.createElement("li");
    item.className = "hmrc-assist-message";

    const title = doc.createElement("strong");
    title.className = "hmrc-assist-message-title";
    title.textContent = message.title;
    item.appendChild(title);

    for (const [className, text] of [
      ["hmrc-assist-message-body", message.body],
      ["hmrc-assist-message-action", message.action],
    ]) {
      if (!text) continue;
      const paragraph = doc.createElement("p");
      paragraph.className = className;
      paragraph.textContent = text;
      item.appendChild(paragraph);
    }

    for (const link of message.links || []) {
      const paragraph = doc.createElement("p");
      paragraph.className = "hmrc-assist-message-link";
      if (isWebUrl(link.url)) {
        const anchor = doc.createElement("a");
        anchor.href = link.url;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.textContent = link.title;
        paragraph.appendChild(anchor);
      } else {
        paragraph.textContent = link.title;
      }
      item.appendChild(paragraph);
    }
    return item;
  }

  /**
   * Mount the check into a container.
   *
   * @param {Object} options
   * @param {"vat"|"itsa"} options.kind - Which HMRC Assist API the check talks to
   * @param {HTMLElement} options.container - Receives the control, the pause line and the feedback list
   * @param {() => {applicable: boolean, ready: boolean, key?: string, requestBody?: Object, acknowledgeIdentity?: Object}} options.describeDraft -
   *   applicable: show the control at all; ready: the draft is complete enough to check
   * @param {HTMLElement[]} [options.watch] - Elements whose input or change event is an edit to the draft
   * @param {HTMLButtonElement} [options.submitButton] - Held disabled only while the report request is in flight
   * @param {string[]} [options.highlightIds] - Ids of the inputs a message path fragment may name
   * @param {string} options.unavailableText - The one line shown when HMRC Assist cannot be reached
   * @param {number} [options.ackRetryBaseMs] - First retry delay for the acknowledgement
   */
  function mount(options) {
    const { kind, container, describeDraft, watch = [], submitButton, highlightIds = [], unavailableText } = options;
    const ackRetryBaseMs = options.ackRetryBaseMs ?? DEFAULT_ACK_RETRY_BASE_MS;
    const routes = ROUTES[kind];
    const doc = container.ownerDocument;

    container.classList.add("hmrc-assist");
    container.replaceChildren();

    const control = doc.createElement("button");
    control.type = "button";
    control.id = "hmrcAssistCheckBtn";
    control.className = "secondary-button";
    control.textContent = "Check this return with HMRC Assist";
    control.hidden = true;

    const status = doc.createElement("p");
    status.id = "hmrcAssistStatus";
    status.className = "hint";
    status.setAttribute("role", "status");

    const feedback = doc.createElement("section");
    feedback.id = "hmrcAssistFeedback";
    feedback.className = "hmrc-assist-feedback";
    feedback.hidden = true;
    feedback.setAttribute("aria-labelledby", "hmrcAssistFeedbackHeading");

    container.append(control, status, feedback);

    let generation = 0;
    let requestInFlight = false;
    let reportShown = false;
    let observer = null;
    let highlighted = [];

    function setStatus(text) {
      status.textContent = text;
    }

    function clearHighlights() {
      for (const element of highlighted) element.classList.remove("hmrc-assist-highlight");
      highlighted = [];
    }

    function clearFeedback() {
      observer?.disconnect();
      observer = null;
      feedback.replaceChildren();
      feedback.hidden = true;
      clearHighlights();
      setStatus("");
      reportShown = false;
    }

    function refresh() {
      const draft = describeDraft();
      control.hidden = !draft.applicable;
      control.disabled = !draft.applicable || !draft.ready || requestInFlight || reportShown;
    }

    function reset() {
      generation += 1;
      clearFeedback();
      refresh();
    }

    function highlightFields(messages) {
      for (const message of messages) {
        const fragment = fragmentOf(message.path);
        if (!fragment || !highlightIds.includes(fragment)) continue;
        const field = doc.getElementById(fragment);
        if (!field || highlighted.includes(field)) continue;
        field.classList.add("hmrc-assist-highlight");
        highlighted.push(field);
      }
    }

    async function acknowledge(report, draft, attempt = 0) {
      const body = {
        ...draft.acknowledgeIdentity,
        reportId: report.reportId,
        correlationId: report.correlationId,
        receiptId: report.receiptId,
      };
      let retry = true;
      try {
        const response = await post(routes.acknowledge, body);
        if (response.status === 204) {
          markAcknowledged(kind, draft.key, report.reportId);
          return;
        }
        retry = response.status >= 500 || RETRYABLE_STATUSES.includes(response.status);
      } catch (error) {
        console.warn("HMRC Assist acknowledgement failed:", error);
      }
      if (!retry) return;
      const delay = Math.min(ackRetryBaseMs * 2 ** attempt, MAX_ACK_RETRY_DELAY_MS);
      setTimeout(() => acknowledge(report, draft, attempt + 1), delay);
    }

    function showReport(report, draft) {
      const messages = (report.messages || []).slice(0, MAX_MESSAGES);
      feedback.replaceChildren();

      const heading = doc.createElement("h3");
      heading.id = "hmrcAssistFeedbackHeading";
      heading.textContent = "HMRC feedback";
      feedback.appendChild(heading);

      const list = doc.createElement("ol");
      list.id = "hmrcAssistMessages";
      const items = messages.map((message) => renderMessage(doc, message));
      list.append(...items);
      feedback.appendChild(list);
      feedback.hidden = false;

      highlightFields(messages);
      markUnacknowledged(kind, draft.key, report.reportId);

      observer = onceInView(items[items.length - 1], () => acknowledge(report, draft));
    }

    async function check() {
      const draft = describeDraft();
      if (!draft.applicable || !draft.ready || requestInFlight) return;
      const thisGeneration = ++generation;
      clearFeedback();
      requestInFlight = true;
      const submitWasDisabled = submitButton ? submitButton.disabled : false;
      if (submitButton) submitButton.disabled = true;
      setStatus("Asking HMRC Assist for feedback. This takes a few seconds.");
      refresh();

      let outcome = null;
      let failed = false;
      try {
        const response = await post(routes.report, draft.requestBody);
        if (response.status === 204) {
          outcome = { noFeedback: true };
        } else if (response.ok) {
          outcome = { report: await response.json() };
        } else {
          failed = true;
        }
      } catch (error) {
        console.warn("HMRC Assist request failed:", error);
        failed = true;
      }

      requestInFlight = false;
      if (submitButton) submitButton.disabled = submitWasDisabled;
      if (thisGeneration !== generation) {
        refresh();
        return;
      }

      if (failed) {
        setStatus(unavailableText);
      } else if (outcome.noFeedback) {
        setStatus("HMRC Assist has no feedback on this return");
        reportShown = true;
      } else {
        setStatus("");
        reportShown = true;
        showReport(outcome.report, draft);
      }
      refresh();
    }

    control.addEventListener("click", check);
    for (const element of watch) {
      element.addEventListener("input", reset);
      element.addEventListener("change", reset);
    }
    refresh();

    return { refresh, reset };
  }

  window.hmrcAssistMessages = { mount, unacknowledgedFor };
})();
