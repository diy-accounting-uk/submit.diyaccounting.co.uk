// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Two bubbles at the top right of the window, so a reader far down a long page sees what the
// status area at the top says. Both show only while #statusMessagesContainer is out of view; in
// view, the page's own spinner and messages say it.
// - The working bubble shows while the loading spinner #loadingSpinner shows (showLoading until
//   hideLoading). An information message added while the spinner shows is progress: the working
//   bubble shows its text.
// - The message bubble repeats any other message added to the container, with a link that takes
//   the reader to the message and a close button.
// Neither has a live-region role: the container, and an error's role="alert", already announce
// each message once.

// page-chrome.js gives the text in the chosen language; without it the English stands.
function siteText(id, english, values) {
  if (typeof window !== "undefined" && window.siteText) return window.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

export const STATUS_BUBBLE_CLOSE_MS = 8000;

// An information or success message closes its bubble on its own; an error or a warning stays until
// the reader closes it, the container comes into view or the message goes.
const SELF_CLOSING_KINDS = new Set(["info", "success"]);

function kindOf(message) {
  const kind = Array.from(message.classList).find((name) => name.startsWith("status-") && name !== "status-message");
  return kind ? kind.slice("status-".length) : "info";
}

function inView(element) {
  const box = element.getBoundingClientRect();
  return box.bottom > 0 && box.top < window.innerHeight;
}

function messageText(message) {
  return message.querySelector(".status-message-content")?.textContent ?? message.textContent;
}

// The message's content as the bubble shows it: each part a copy of its own element, so a failure's
// title, cause and next-step link stay apart and the link stays a link.
function messageParts(message) {
  const content = message.querySelector(".status-message-content") ?? message;
  const parts = document.createElement("div");
  parts.className = "status-bubble-text";
  parts.append(...Array.from(content.childNodes, (node) => node.cloneNode(true)));
  return parts;
}

/** Watches the page's status container and loading spinner, and shows their bubbles. */
export function startStatusBubble() {
  const container = document.getElementById("statusMessagesContainer");
  if (!container) return;
  const spinner = document.getElementById("loadingSpinner");

  const stack = document.createElement("div");
  stack.className = "status-bubbles";
  document.body.appendChild(stack);

  let workingBubble = null;
  let bubble = null;
  let shownMessage = null;
  let closeTimer = null;

  function close() {
    clearTimeout(closeTimer);
    bubble?.remove();
    bubble = null;
    shownMessage = null;
  }

  function goToMessage(message) {
    close();
    container.scrollIntoView({ block: "start" });
    if (!message.isConnected) return;
    if (!message.hasAttribute("tabindex")) {
      message.setAttribute("tabindex", "-1");
      message.addEventListener("blur", () => message.removeAttribute("tabindex"), { once: true });
    }
    message.focus({ preventScroll: true });
  }

  function show(message) {
    close();
    const kind = kindOf(message);
    const text = messageParts(message);

    const link = document.createElement("a");
    link.className = "status-bubble-link";
    link.href = "#statusMessagesContainer";
    link.textContent = siteText("widget.go-to-message", "Go to the message");
    link.addEventListener("click", (event) => {
      event.preventDefault();
      goToMessage(message);
    });

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "status-close-button status-bubble-close";
    closeButton.textContent = "×";
    closeButton.setAttribute("aria-label", siteText("widget.close-message", "Close message"));
    closeButton.addEventListener("click", close);

    const body = document.createElement("div");
    body.className = "status-bubble-body";
    body.append(text, link);

    bubble = document.createElement("div");
    bubble.className = "status-bubble";
    bubble.dataset.kind = kind;
    bubble.append(body, closeButton);
    stack.appendChild(bubble);
    shownMessage = message;
    if (SELF_CLOSING_KINDS.has(kind)) closeTimer = setTimeout(close, STATUS_BUBBLE_CLOSE_MS);
  }

  function spinnerShows() {
    return Boolean(spinner) && getComputedStyle(spinner).display !== "none";
  }

  function updateWorking() {
    const working = spinnerShows();
    const progress = working ? Array.from(container.querySelectorAll(".status-message.status-info")).at(-1) : undefined;
    if (!working || inView(container)) {
      workingBubble?.remove();
      workingBubble = null;
      return;
    }
    if (!workingBubble) {
      workingBubble = document.createElement("div");
      workingBubble.className = "status-working-bubble";
      const sign = document.createElement("span");
      sign.className = "status-working-sign";
      const label = document.createElement("span");
      label.className = "status-working-label";
      label.textContent = siteText("widget.working", "Working");
      const detail = document.createElement("span");
      detail.className = "status-working-text";
      const body = document.createElement("div");
      body.className = "status-bubble-body";
      body.append(label, detail);
      workingBubble.append(sign, body);
      stack.prepend(workingBubble);
    }
    const detail = workingBubble.querySelector(".status-working-text");
    detail.textContent = progress ? messageText(progress) : "";
    detail.hidden = !progress;
  }

  new IntersectionObserver((entries) => {
    if (bubble && entries.some((entry) => entry.isIntersecting)) close();
    updateWorking();
  }).observe(container);

  new MutationObserver((records) => {
    if (shownMessage && !shownMessage.isConnected) close();
    const added = records
      .flatMap((record) => Array.from(record.addedNodes))
      .filter(
        (node) =>
          node.nodeType === Node.ELEMENT_NODE &&
          node.classList.contains("status-message") &&
          !(node.classList.contains("status-info") && spinnerShows()) &&
          node.isConnected,
      );
    const newest = added.at(-1);
    if (newest && !inView(container)) show(newest);
    updateWorking();
  }).observe(container, { childList: true });

  if (spinner) new MutationObserver(updateWorking).observe(spinner, { attributes: true, attributeFilter: ["style", "class", "hidden"] });
  updateWorking();
}
