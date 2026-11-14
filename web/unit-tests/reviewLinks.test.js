// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { REVIEW_LINKS_PATHS, renderReviewLinks } from "../../scripts/build-review-links.mjs";
import { readListings } from "../../scripts/listings-register.mjs";
import { customerCopyHtml, reviewLineHtml } from "@app/lib/submissionRecord.js";

const TRUSTPILOT = { site: "Trustpilot", url: "https://example.com/trustpilot-profile" };
const CAPTERRA = { site: "Capterra", url: "https://example.com/capterra-profile" };

function fixtureRegister(listings) {
  const register = readListings();
  return { ...register, listings: register.listings.map((listing) => ({ ...listing, ...listings[listing.id] })) };
}

const copy = (status, reviewLinks) =>
  customerCopyHtml({
    title: "Your copy",
    reference: { label: "Reference", value: "1" },
    status,
    date: "1 January 2027",
    sections: [{ recordHtml: "<p>x</p>" }],
    reviewLinks,
  });

describe("the generated review links", () => {
  test.each(REVIEW_LINKS_PATHS)("the committed module %s equals what the build script renders from the register", async (path) => {
    expect(readFileSync(path, "utf8")).toBe(await renderReviewLinks(readListings()));
  });

  test("it holds an empty list while no review profile is live", async () => {
    expect(await renderReviewLinks(fixtureRegister({ trustpilot: { state: "submitted", url: TRUSTPILOT.url } }))).toContain(
      "export const reviewLinks = [];",
    );
  });

  test("it holds Trustpilot first and Capterra second for live profiles with a URL", async () => {
    const text = await renderReviewLinks(
      fixtureRegister({ capterra: { state: "live", url: CAPTERRA.url }, trustpilot: { state: "live", url: TRUSTPILOT.url } }),
    );
    const module = await import(`data:text/javascript,${encodeURIComponent(text)}`);
    expect(module.reviewLinks).toEqual([TRUSTPILOT, CAPTERRA]);
  });

  test("a live listing without a URL is left out", async () => {
    expect(await renderReviewLinks(fixtureRegister({ trustpilot: { state: "live", url: "" } }))).toContain(
      "export const reviewLinks = [];",
    );
  });
});

describe("the review line", () => {
  test("an accepted result shows one sentence with a link per site, Trustpilot first", () => {
    const html = reviewLineHtml({ kind: "accepted", text: "Accepted by HMRC" }, [TRUSTPILOT, CAPTERRA]);
    expect(html).toContain("Leave a review of DIY Accounting Submit on");
    expect(html.indexOf("Trustpilot")).toBeLessThan(html.indexOf("Capterra"));
    expect(html).toContain(`href="${TRUSTPILOT.url}" data-review-site="Trustpilot" target="_blank" rel="noopener noreferrer"`);
    expect(html).toContain(`href="${CAPTERRA.url}" data-review-site="Capterra" target="_blank" rel="noopener noreferrer"`);
  });

  test("the customer copy carries it for an accepted Companies House result", () => {
    expect(copy({ kind: "accepted", text: "Accepted by Companies House" }, [TRUSTPILOT])).toContain('class="customer-copy-review"');
  });

  test("an empty list shows no line", () => {
    expect(copy({ kind: "accepted", text: "Accepted by HMRC" }, [])).not.toContain("customer-copy-review");
  });

  test.each([
    { kind: "rejected", text: "Rejected by HMRC" },
    { kind: "pending", text: "With Companies House" },
    { kind: "sent", text: "Sent to HMRC" },
    { kind: "accepted", text: "Held by HMRC" },
  ])("a $text result shows no line", (status) => {
    expect(copy(status, [TRUSTPILOT, CAPTERRA])).not.toContain("customer-copy-review");
  });

  test("the customer copy shows no line while the generated list is empty", () => {
    expect(copy({ kind: "accepted", text: "Accepted by HMRC" }, [])).not.toContain("customer-copy-review");
  });
});
