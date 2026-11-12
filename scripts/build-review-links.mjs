// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Renders the review profile URLs of the live Trustpilot and Capterra listings in the listing
// register as a module the submission record imports, once for the server and once for the browser.
// Usage: node scripts/build-review-links.mjs   (npm run build:review-links)

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";
import { liveListings, readListings } from "./listings-register.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const REVIEW_LINKS_PATHS = [join(ROOT, "app", "lib", "reviewLinks.js"), join(ROOT, "web", "public", "lib", "review-links.js")];

// Trustpilot is listed first on the result page, Capterra second.
const REVIEW_SITES = [
  { id: "trustpilot", site: "Trustpilot" },
  { id: "capterra", site: "Capterra" },
];

/** The text of the module for a register: the list of {site, url}, empty while no review profile is live. */
export async function renderReviewLinks(register) {
  const live = liveListings(register);
  const links = REVIEW_SITES.flatMap(({ id, site }) => {
    const listing = live.find((entry) => entry.id === id);
    return listing ? [{ site, url: listing.url }] : [];
  });
  const source = `// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Generated from the listing register by scripts/build-review-links.mjs, do not edit. Run
// npm run build:review-links.

export const reviewLinks = ${JSON.stringify(links)};
`;
  return prettier.format(source, { ...(await prettier.resolveConfig(REVIEW_LINKS_PATHS[0])), filepath: REVIEW_LINKS_PATHS[0] });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = await renderReviewLinks(readListings());
  for (const path of REVIEW_LINKS_PATHS) writeFileSync(path, text);
}
