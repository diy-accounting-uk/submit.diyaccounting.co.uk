// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/widgets/listed-content.js
// An element with data-listed-activity="<activity id>" starts hidden and shows only where the
// catalogue lists that activity in the current environment.

(function () {
  "use strict";

  async function revealListedContent() {
    const items = document.querySelectorAll("[data-listed-activity]");
    if (items.length === 0) return;
    const service = await import("/lib/services/content-listing.js");
    const isListed = await service.fetchActivityListing();
    items.forEach((item) => {
      item.hidden = !isListed(item.dataset.listedActivity);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", revealListedContent);
  } else {
    revealListedContent();
  }
})();
