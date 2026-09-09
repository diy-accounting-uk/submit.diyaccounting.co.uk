// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// DOM utility functions for status messages and UI helpers

/**
 * Show a status message in the status container
 * @param {string} message - Message to display
 * @param {string} type - Message type: "info", "success", "warning", "error"
 */
export function showStatus(message, type = "info") {
  console.log("Status message:", message, "Type:", type);
  const statusMessagesContainer = document.getElementById("statusMessagesContainer");
  if (!statusMessagesContainer) {
    console.warn("Status messages container not found");
    return;
  }

  const msgDiv = document.createElement("div");
  msgDiv.className = `status-message status-${type}`;

  // Create message content container
  const messageContent = document.createElement("span");
  messageContent.textContent = message;
  messageContent.className = "status-message-content";

  // Create close button
  const closeButton = document.createElement("button");
  closeButton.textContent = "\u00d7";
  closeButton.className = "status-close-button";
  closeButton.setAttribute("aria-label", "Close message");
  closeButton.addEventListener("click", () => {
    removeStatusMessage(msgDiv);
  });

  // Append content and close button to message div
  msgDiv.appendChild(messageContent);
  msgDiv.appendChild(closeButton);
  statusMessagesContainer.appendChild(msgDiv);

  // Auto-hide info messages after 30 seconds
  if (type === "info") {
    setTimeout(() => {
      removeStatusMessage(msgDiv);
    }, 30000);
  }
}

/**
 * Remove a specific status message element
 * @param {HTMLElement} msgDiv - Message element to remove
 */
export function removeStatusMessage(msgDiv) {
  if (msgDiv && msgDiv.parentNode) {
    msgDiv.remove();
  }
}

/**
 * Hide all status messages
 */
export function hideStatus() {
  console.log("Hiding all status messages");
  const statusMessagesContainer = document.getElementById("statusMessagesContainer");
  if (statusMessagesContainer) {
    statusMessagesContainer.innerHTML = "";
  }
}

/**
 * Execute callback when DOM is ready
 * @param {Function} callback - Callback to execute
 */
export function onDomReady(callback) {
  if (document.readyState === "complete" || document.readyState === "interactive") {
    callback();
  } else {
    document.addEventListener("DOMContentLoaded", callback, { once: true });
  }
}

/**
 * Read content from a meta tag
 * @param {string} name - Meta tag name
 * @returns {string} Meta content or empty string
 */
export function readMeta(name) {
  const el = document.querySelector(`meta[name="${name}"]`);
  return el && el.content ? el.content.trim() : "";
}

// Export on window for backward compatibility
if (typeof window !== "undefined") {
  window.showStatus = showStatus;
  window.hideStatus = hideStatus;
  window.removeStatusMessage = removeStatusMessage;
  window.onDomReady = onDomReady;
  window.readMeta = readMeta;
}
