// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/widgets/simulator-bridge.js
// PostMessage bridge for cross-origin simulator journey automation.
// Injected into simulator HTML pages by build-simulator.js.
// Listens for commands from the parent window and executes DOM operations.

(function () {
  // Only activate inside an iframe
  if (window.parent === window) return;

  // eslint-disable-next-line sonarjs/cognitive-complexity
  window.addEventListener("message", async function (event) {
    const msg = event.data;
    if (!msg || msg.type !== "simulator-command") return;

    const id = msg.id;
    const command = msg.command;
    const selector = msg.selector;
    const text = msg.text;
    const value = msg.value;
    const result = { type: "simulator-response", id: id, success: true };

    try {
      switch (command) {
        case "highlight": {
          const el = selector ? document.querySelector(selector) : null;
          if (el) {
            el.classList.add("simulator-highlight");
            el.scrollIntoView({ behavior: "smooth", block: "center" });
          }
          result.found = !!el;
          break;
        }

        case "unhighlight": {
          const el = selector ? document.querySelector(selector) : null;
          if (el) el.classList.remove("simulator-highlight");
          break;
        }

        case "click": {
          const el = selector ? document.querySelector(selector) : null;
          if (el) {
            el.click();
            el.classList.remove("simulator-highlight");
          } else {
            result.success = false;
            result.error = "Element not found: " + selector;
          }
          break;
        }

        case "clickByText": {
          const els = document.querySelectorAll(selector);
          let found = false;
          for (let i = 0; i < els.length; i++) {
            if (els[i].textContent.trim().indexOf(text) !== -1) {
              els[i].click();
              els[i].classList.remove("simulator-highlight");
              found = true;
              break;
            }
          }
          result.found = found;
          if (!found) {
            result.success = false;
            result.error = "Element not found by text: " + selector + ' containing "' + text + '"';
          }
          break;
        }

        case "highlightByText": {
          const els = document.querySelectorAll(selector);
          let found = false;
          for (let i = 0; i < els.length; i++) {
            if (els[i].textContent.trim().indexOf(text) !== -1) {
              els[i].classList.add("simulator-highlight");
              els[i].scrollIntoView({ behavior: "smooth", block: "center" });
              found = true;
              break;
            }
          }
          result.found = found;
          break;
        }

        case "fill": {
          const el = selector ? document.querySelector(selector) : null;
          if (el) {
            el.focus();
            if (el.type === "date" || el.type === "number" || el.type === "datetime-local") {
              el.value = String(value);
              el.dispatchEvent(new Event("input", { bubbles: true }));
              el.dispatchEvent(new Event("change", { bubbles: true }));
            } else {
              el.value = "";
              const chars = String(value);
              for (let i = 0; i < chars.length; i++) {
                el.value += chars[i];
                el.dispatchEvent(new Event("input", { bubbles: true }));
                await new Promise(function (resolve) {
                  setTimeout(resolve, 50);
                });
              }
              el.dispatchEvent(new Event("change", { bubbles: true }));
            }
            el.classList.remove("simulator-highlight");
          } else {
            result.success = false;
            result.error = "Element not found: " + selector;
          }
          break;
        }

        case "select": {
          const el = selector ? document.querySelector(selector) : null;
          if (el) {
            el.value = value;
            el.dispatchEvent(new Event("change", { bubbles: true }));
            el.classList.remove("simulator-highlight");
          }
          break;
        }

        case "findByText": {
          const els = document.querySelectorAll(selector);
          let found = false;
          for (let i = 0; i < els.length; i++) {
            if (els[i].textContent.trim().indexOf(text) !== -1) {
              found = true;
              break;
            }
          }
          result.found = found;
          break;
        }

        case "query": {
          const el = selector ? document.querySelector(selector) : null;
          result.found = !!el;
          if (el) {
            result.disabled = !!el.disabled;
            result.checked = !!el.checked;
            result.value = el.value;
            result.textContent = (el.textContent || "").trim().substring(0, 200);
          }
          break;
        }

        case "check": {
          const el = selector ? document.querySelector(selector) : null;
          if (el) el.checked = true;
          result.found = !!el;
          break;
        }

        case "scrollToBottom": {
          const body = document.body || document.documentElement;
          if (body) {
            body.scrollTop = body.scrollHeight;
            document.documentElement.scrollTop = document.documentElement.scrollHeight;
          }
          break;
        }

        default:
          result.success = false;
          result.error = "Unknown command: " + command;
      }
    } catch (e) {
      result.success = false;
      result.error = e.message;
    }

    event.source.postMessage(result, event.origin);
  });

  // Signal that bridge is ready
  window.parent.postMessage({ type: "simulator-bridge-ready" }, "*");
})();
