// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// A message added to #statusMessagesContainer while the container is out of view also shows as a
// bubble fixed at the top right of the window, so a reader far down a long page sees it. The
// bubble carries the message's text, a link that takes the reader to the message, and a close
// button. It has no live-region role: the container, and an error's role="alert", already announce
// the message once.

// page-chrome.js gives the text in the chosen language; without it the English stands.
function siteText(id, english, values) {
  if (typeof window !== "undefined" && window.siteText) return window.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

export const STATUS_BUBBLE_CLOSE_MS = 8000;

// An information or success message closes its bubble on its own; any other kind stays until the
// reader closes it, the container comes into view or the message goes.
const SELF_CLOSING_KINDS = new Set(["info", "success"]);

function kindOf(message) {
  const kind = Array.from(message.classList).find((name) => name.startsWith("status-") && name !== "status-message");
  return kind ? kind.slice("status-".length) : "info";
}

function inView(element) {
  const box = element.getBoundingClientRect();
  return box.bottom > 0 && box.top < window.innerHeight;
}

/** Watches the page's status container and shows each message added out of view as a bubble. */
export function startStatusBubble() {
  const container = document.getElementById("statusMessagesContainer");
  if (!container) return;

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
    if (!message.hasAttribute("tabindex")) message.setAttribute("tabindex", "-1");
    message.focus({ preventScroll: true });
  }

  function show(message) {
    close();
    const kind = kindOf(message);
    const text = document.createElement("span");
    text.className = "status-bubble-text";
    text.textContent = message.querySelector(".status-message-content")?.textContent ?? message.textContent;

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
    document.body.appendChild(bubble);
    shownMessage = message;
    if (SELF_CLOSING_KINDS.has(kind)) closeTimer = setTimeout(close, STATUS_BUBBLE_CLOSE_MS);
  }

  new IntersectionObserver((entries) => {
    if (bubble && entries.some((entry) => entry.isIntersecting)) close();
  }).observe(container);

  new MutationObserver((records) => {
    if (shownMessage && !shownMessage.isConnected) close();
    const added = records
      .flatMap((record) => Array.from(record.addedNodes))
      .filter((node) => node.nodeType === Node.ELEMENT_NODE && node.classList.contains("status-message") && node.isConnected);
    const newest = added.at(-1);
    if (newest && !inView(container)) show(newest);
  }).observe(container, { childList: true });
}
