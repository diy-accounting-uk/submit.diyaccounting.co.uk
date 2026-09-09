// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

(function () {
  // Lightweight, reusable status & loading UI helper shared across pages
  // Usage:
  //  - Include submit.css for styling
  //  - Add containers in HTML (recommended):
  //      <div id="statusMessagesContainer"></div>
  //      <div id="loadingSpinner" class="spinner" style="display:none"></div>
  //  - Call StatusMessages.show('Message', 'info'|'error'|'success'|'warning')
  //  - Or use globals: showStatus(), hideStatus(), showLoading(), hideLoading()

  function getStatusContainer(customId) {
    const id = customId || "statusMessagesContainer";
    let el = document.getElementById(id);
    if (!el) {
      // Fallback: create a container at top of #mainContent or body for resiliency
      el = document.createElement("div");
      el.id = id;
      const main = document.getElementById("mainContent") || document.body;
      main.insertBefore(el, main.firstChild || null);
    }
    return el;
  }

  function removeStatusMessage(msgDiv) {
    if (msgDiv && msgDiv.parentNode) {
      msgDiv.remove();
    }
  }

  function show(message, type = "info", options = {}) {
    const container = getStatusContainer(options.containerId);

    const msgDiv = document.createElement("div");
    msgDiv.className = `status-message status-${type}`;

    const messageContent = document.createElement("span");
    messageContent.textContent = message;
    messageContent.className = "status-message-content";

    const closeButton = document.createElement("button");
    closeButton.textContent = "×";
    closeButton.className = "status-close-button";
    closeButton.setAttribute("aria-label", "Close message");
    closeButton.addEventListener("click", () => removeStatusMessage(msgDiv));

    msgDiv.appendChild(messageContent);
    msgDiv.appendChild(closeButton);
    container.appendChild(msgDiv);

    const autoHide = options.autoHide ?? type === "info";
    const autoHideMs = options.autoHideMs ?? 30000; // 30s default (browser tests expect non-instant)
    if (autoHide) {
      setTimeout(() => removeStatusMessage(msgDiv), autoHideMs);
    }
  }

  function clear(options = {}) {
    const container = getStatusContainer(options.containerId);
    container.innerHTML = "";
  }

  function getSpinner(customId) {
    const id = customId || "loadingSpinner";
    return document.getElementById(id);
  }

  function showLoading(options = {}) {
    const spinner = getSpinner(options.spinnerId);
    if (spinner) {
      spinner.style.display = "block";
      spinner.style.visibility = "visible";
      spinner.style.opacity = "1";
      spinner.style.width = spinner.style.width || "40px";
      spinner.style.height = spinner.style.height || "40px";
    }
    const submitBtn = document.getElementById(options.submitButtonId || "submitBtn");
    if (submitBtn) submitBtn.disabled = true;
  }

  function hideLoading(options = {}) {
    const spinner = getSpinner(options.spinnerId);
    if (spinner) spinner.style.display = "none";
    const submitBtn = document.getElementById(options.submitButtonId || "submitBtn");
    if (submitBtn) submitBtn.disabled = false;
  }

  // Public API
  const api = {
    show,
    clear,
    showInfo: (m, o) => show(m, "info", o),
    showSuccess: (m, o) => show(m, "success", o),
    showWarning: (m, o) => show(m, "warning", o),
    showError: (m, o) => show(m, "error", { ...(o || {}), autoHide: false }),
    showLoading,
    hideLoading,
  };

  // Attach as namespaced helper
  window.StatusMessages = window.StatusMessages || api;

  // Provide global function shims if not already defined, to ease migration
  if (typeof window.showStatus !== "function") {
    window.showStatus = (m, t) => api.show(m, t);
  }
  if (typeof window.hideStatus !== "function") {
    window.hideStatus = () => api.clear();
  }
  if (typeof window.showLoading !== "function") {
    window.showLoading = () => api.showLoading();
  }
  if (typeof window.hideLoading !== "function") {
    window.hideLoading = () => api.hideLoading();
  }
})();
