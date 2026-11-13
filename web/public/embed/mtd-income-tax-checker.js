// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Put this script on another site to show the Making Tax Digital for Income Tax scope checker there.
// It adds a frame that loads the checker from DIY Accounting Submit, and a link to the full page.
// The origin comes from this script's own address, so the same snippet works on every environment.
(function () {
  const script = document.currentScript;
  if (!script || !script.src) return;
  const origin = new URL(script.src).origin;

  const wrapper = document.createElement("div");
  wrapper.className = "diya-mtd-income-tax-checker";

  const frame = document.createElement("iframe");
  frame.src = origin + "/embed/mtd-income-tax-checker.html";
  frame.title = "Making Tax Digital for Income Tax checker";
  frame.loading = "lazy";
  frame.style.width = "100%";
  frame.style.height = "640px";
  frame.style.border = "0";

  window.addEventListener("message", (event) => {
    if (event.source !== frame.contentWindow || event.origin !== origin) return;
    const message = event.data;
    if (!message || message.type !== "diya-mtd-income-tax-checker-height") return;
    if (Number.isFinite(message.height) && message.height >= 200 && message.height <= 5000) frame.style.height = message.height + "px";
  });

  const credit = document.createElement("p");
  const link = document.createElement("a");
  link.href = origin + "/mtd-income-tax-checker.html";
  link.textContent = "Making Tax Digital for Income Tax checker, with the rules and their sources, on DIY Accounting Submit";
  credit.append(link);

  wrapper.append(frame, credit);
  script.insertAdjacentElement("afterend", wrapper);
})();
