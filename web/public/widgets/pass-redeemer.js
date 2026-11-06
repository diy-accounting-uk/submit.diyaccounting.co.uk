// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Pass Redeemer Widget
// A pass link can point at an activity page. Any site can link a signed-in person to such a page,
// so the page never redeems on load: it forwards to the pass page, where one click redeems. The
// forward carries the page's own address as `next`, so the pass page can offer a way back.

(function () {
  "use strict";

  function forwardToPassPage() {
    const params = new URLSearchParams(window.location.search);
    const code = (params.get("pass") || "").trim().toLowerCase();
    if (!code) return;

    params.delete("pass");
    const query = params.toString();
    const next = window.location.pathname + (query ? "?" + query : "");
    window.location.replace("/pass.html?pass=" + encodeURIComponent(code) + "&next=" + encodeURIComponent(next));
  }

  forwardToPassPage();
})();
