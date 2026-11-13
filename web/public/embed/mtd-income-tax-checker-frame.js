// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Runs inside the framed checker. It tells the page that holds the frame how tall the content is,
// so the frame grows with the answer and shows no scroll bar of its own. The message carries one number.
const main = document.querySelector("main");
if (main && window.parent !== window) {
  const bottomGap = 16;
  const tell = () => {
    const height = Math.ceil(main.getBoundingClientRect().bottom + window.scrollY) + bottomGap;
    window.parent.postMessage({ type: "diya-mtd-income-tax-checker-height", height }, "*");
  };
  new ResizeObserver(tell).observe(main);
  tell();
}
