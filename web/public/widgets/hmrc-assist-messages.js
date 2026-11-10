// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/widgets/hmrc-assist-messages.js
// The HMRC Assist check: a control that asks HMRC for feedback on a draft return, shows HMRC's
// messages verbatim and in order, and tells HMRC they were displayed. Advisory only: pressing the
// check holds the submit control for a visible countdown so the customer can read the messages, the
// customer can end the hold at any time, and a failed request leaves the form as it was.

(function () {
  "use strict";

  const MAX_MESSAGES = 5;
  const UNACKNOWLEDGED_KEY = "hmrcAssistUnacknowledged";
  const LANGUAGE_KEY = "hmrcAssistLanguage";
  const LANGUAGES = [
    { code: "en", label: "English" },
    { code: "cy", label: "Cymraeg" },
  ];
  const HOLD_SECONDS = 30;
  const HOLD_ANNOUNCE_EVERY_SECONDS = 5;
  const STOP_LABELS = {
    withSubmit: { en: "Stop waiting and enable submit", cy: "Rhoi'r gorau i aros a galluogi cyflwyno" },
    withoutSubmit: { en: "Stop waiting and continue", cy: "Rhoi'r gorau i aros a pharhau" },
  };
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

  function readLanguage() {
    try {
      return sessionStorage.getItem(LANGUAGE_KEY) === "cy" ? "cy" : "en";
    } catch {
      return "en";
    }
  }

  function writeLanguage(language) {
    try {
      sessionStorage.setItem(LANGUAGE_KEY, language);
    } catch {
      // Session storage unavailable: the choice is lost on the next page.
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
      ...(window.hmrcScopeCheck ? window.hmrcScopeCheck.grantHeaders() : {}),
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
    if (typeof path !== "string") return "";
    const index = path.indexOf("#");
    return index === -1 ? path : path.slice(index + 1);
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
   * @param {HTMLButtonElement} [options.submitButton] - Held disabled for the countdown that starts when the check is pressed
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

    const hold = doc.createElement("div");
    hold.id = "hmrcAssistHold";
    hold.className = "hmrc-assist-hold";
    hold.hidden = true;

    const holdSeconds = doc.createElement("span");
    holdSeconds.id = "hmrcAssistHoldSeconds";
    holdSeconds.className = "hmrc-assist-hold-seconds";
    holdSeconds.setAttribute("aria-hidden", "true");

    const holdBar = doc.createElement("div");
    holdBar.id = "hmrcAssistHoldBar";
    holdBar.className = "hmrc-assist-hold-bar";
    holdBar.setAttribute("role", "progressbar");
    holdBar.setAttribute("aria-label", "Time left before the pause on submit ends");
    holdBar.setAttribute("aria-valuemin", "0");
    holdBar.setAttribute("aria-valuemax", String(HOLD_SECONDS));
    const holdFill = doc.createElement("div");
    holdFill.className = "hmrc-assist-hold-fill";
    holdBar.appendChild(holdFill);

    const holdStop = doc.createElement("button");
    holdStop.type = "button";
    holdStop.id = "hmrcAssistHoldStop";
    holdStop.className = "secondary-button hmrc-assist-hold-stop";
    holdStop.textContent = "X";

    const holdAnnouncement = doc.createElement("span");
    holdAnnouncement.id = "hmrcAssistHoldAnnouncement";
    holdAnnouncement.className = "hmrc-assist-hold-announcement";
    holdAnnouncement.setAttribute("aria-live", "polite");

    hold.append(holdSeconds, holdBar, holdStop, holdAnnouncement);

    container.append(control, status, feedback, hold);

    let generation = 0;
    let requestInFlight = false;
    let reportShown = false;
    let observer = null;
    let highlighted = [];
    let requestOwner = null;
    let holdTimer = null;
    let holdDeadline = 0;
    let submitWasDisabled = false;
    let lastAnnouncedSecond = null;

    function setStopLabel() {
      const label = STOP_LABELS[submitButton ? "withSubmit" : "withoutSubmit"][readLanguage()];
      holdStop.setAttribute("aria-label", label);
      holdStop.title = label;
      holdStop.lang = readLanguage();
    }

    function showHoldSeconds(secondsLeft) {
      holdSeconds.textContent = `${secondsLeft}s`;
      holdBar.setAttribute("aria-valuenow", String(secondsLeft));
      holdBar.setAttribute("aria-valuetext", `${secondsLeft} seconds left`);
      holdFill.style.width = `${(secondsLeft / HOLD_SECONDS) * 100}%`;
      if (secondsLeft % HOLD_ANNOUNCE_EVERY_SECONDS === 0 && secondsLeft !== lastAnnouncedSecond) {
        lastAnnouncedSecond = secondsLeft;
        holdAnnouncement.textContent = `${secondsLeft} seconds left`;
      }
    }

    function endHold() {
      if (holdTimer === null) return;
      clearInterval(holdTimer);
      holdTimer = null;
      hold.hidden = true;
      holdAnnouncement.textContent = "";
      lastAnnouncedSecond = null;
      if (submitButton) submitButton.disabled = submitWasDisabled;
    }

    function holdExpired() {
      const waitingForHmrc = requestInFlight;
      endHold();
      if (!waitingForHmrc) return;
      generation += 1;
      requestOwner = null;
      requestInFlight = false;
      setStatus(unavailableText);
      refresh();
    }

    function startHold() {
      endHold();
      holdDeadline = Date.now() + HOLD_SECONDS * 1000;
      submitWasDisabled = submitButton ? submitButton.disabled : false;
      if (submitButton) submitButton.disabled = true;
      setStopLabel();
      showHoldSeconds(HOLD_SECONDS);
      hold.hidden = false;
      holdTimer = setInterval(() => {
        const secondsLeft = Math.max(0, Math.ceil((holdDeadline - Date.now()) / 1000));
        if (secondsLeft === 0) {
          holdExpired();
          return;
        }
        showHoldSeconds(secondsLeft);
      }, 1000);
    }

    holdStop.addEventListener("click", () => {
      endHold();
      submitButton?.focus();
    });

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
      endHold();
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

    async function acknowledge(report, draft, presentedDateTime, presentedLanguage, attempt = 0) {
      const body = {
        ...draft.acknowledgeIdentity,
        reportId: report.reportId,
        correlationId: report.correlationId,
        receiptId: report.receiptId,
        presentedDateTime,
        presentedLanguage,
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
      setTimeout(() => acknowledge(report, draft, presentedDateTime, presentedLanguage, attempt + 1), delay);
    }

    function showReport(report, draft) {
      const welshMessages = Array.isArray(report.welshMessages) ? report.welshMessages : [];
      const hasWelsh = welshMessages.length > 0;
      const messagesByLanguage = { en: report.messages || [], cy: welshMessages };
      let language = hasWelsh ? readLanguage() : "en";
      let acknowledgementSent = false;
      const presentedDateTime = new Date().toISOString();
      feedback.replaceChildren();

      const heading = doc.createElement("h3");
      heading.id = "hmrcAssistFeedbackHeading";
      heading.textContent = "HMRC feedback";
      feedback.appendChild(heading);

      const switchButtons = new Map();
      if (hasWelsh) {
        const languageSwitch = doc.createElement("div");
        languageSwitch.id = "hmrcAssistLanguageSwitch";
        languageSwitch.className = "hmrc-assist-language-switch";
        languageSwitch.setAttribute("role", "group");
        languageSwitch.setAttribute("aria-label", "Language of HMRC feedback");
        for (const { code, label } of LANGUAGES) {
          const button = doc.createElement("button");
          button.type = "button";
          button.className = "secondary-button hmrc-assist-language-button";
          button.id = `hmrcAssistLanguage-${code}`;
          button.lang = code;
          button.textContent = label;
          button.addEventListener("click", () => selectLanguage(code));
          switchButtons.set(code, button);
          languageSwitch.appendChild(button);
        }
        feedback.appendChild(languageSwitch);
      }

      const list = doc.createElement("ol");
      list.id = "hmrcAssistMessages";
      feedback.appendChild(list);
      feedback.hidden = false;

      function renderLanguage() {
        const messages = messagesByLanguage[language].slice(0, MAX_MESSAGES);
        const items = messages.map((message) => renderMessage(doc, message));
        list.lang = language;
        setStopLabel();
        list.replaceChildren(...items);
        for (const [code, button] of switchButtons) button.setAttribute("aria-pressed", String(code === language));
        clearHighlights();
        highlightFields(messages);
        observer?.disconnect();
        observer = null;
        if (!acknowledgementSent) {
          observer = onceInView(items[items.length - 1], () => {
            if (acknowledgementSent) return;
            acknowledgementSent = true;
            acknowledge(report, draft, presentedDateTime, language);
          });
        }
      }

      function selectLanguage(code) {
        if (code === language) return;
        language = code;
        writeLanguage(code);
        renderLanguage();
      }

      markUnacknowledged(kind, draft.key, report.reportId);
      renderLanguage();
    }

    async function check() {
      const draft = describeDraft();
      if (!draft.applicable || !draft.ready || requestInFlight) return;
      const thisGeneration = ++generation;
      clearFeedback();
      requestInFlight = true;
      requestOwner = thisGeneration;
      startHold();
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

      if (requestOwner === thisGeneration) {
        requestInFlight = false;
        requestOwner = null;
      }
      if (thisGeneration !== generation) {
        refresh();
        return;
      }

      if (failed) {
        endHold();
        setStatus(unavailableText);
      } else if (outcome.noFeedback) {
        endHold();
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
