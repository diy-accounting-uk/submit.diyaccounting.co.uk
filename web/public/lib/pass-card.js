// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/pass-card.js
// The parts of a pass card that the bundles page, the operator's campaign pass page and the pass
// landing page share: the
// type label, the pass's terms (its redemption window, its total and per-account redemption limits,
// and each bundle it grants with its duration and tokens) and its figures. Each page passes its
// own siteText and date formatter, so the Welsh page reads the Welsh text and dates.

(function () {
  "use strict";

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs || {})) node.setAttribute(name, value);
    for (const child of children) {
      if (child === null || child === undefined) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function typeLabel(pass, { siteText }) {
    if (pass.passTypeId === "digital-pass") return siteText("bundles.pass-digital", "Digital");
    if (pass.passTypeId === "physical-pass") return siteText("bundles.pass-physical", "Physical");
    if (pass.passTypeId === "custom-campaign" || pass.passTypeId === "campaign-pass") return siteText("bundles.pass-campaign", "Campaign");
    return siteText("bundles.pass-other", "Pass");
  }

  // "1 year", "6 months", "1 year 6 months", "7 days" from an ISO duration of years, months and days.
  function durationWords(isoDuration, { siteText }) {
    const match = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?$/.exec(isoDuration || "");
    if (!match || !(match[1] || match[2] || match[3])) return null;
    const parts = [];
    const [years, months, days] = [match[1], match[2], match[3]].map((value) => (value ? Number(value) : 0));
    if (years)
      parts.push(
        years === 1 ? siteText("bundles.pass-one-year", "1 year") : siteText("bundles.pass-years", "{count} years", { count: years }),
      );
    if (months)
      parts.push(
        months === 1 ? siteText("bundles.pass-one-month", "1 month") : siteText("bundles.pass-months", "{count} months", { count: months }),
      );
    if (days)
      parts.push(days === 1 ? siteText("bundles.pass-one-day", "1 day") : siteText("bundles.pass-days", "{count} days", { count: days }));
    return parts.join(" ");
  }

  // The bundles a pass grants: a campaign pass's grants with the duration and tokens it sets, and
  // the catalogue's terms where it sets none; any other pass's one bundle on the catalogue's terms.
  function grantedBundles(pass, catalogue) {
    const bundles = catalogue?.bundles || [];
    return (pass.grants || [{ bundleId: pass.bundleId }]).map((grant) => {
      const bundle = bundles.find((b) => b.id === grant.bundleId);
      const tokensSet = grant.tokens !== undefined;
      return {
        name: bundle?.name || grant.bundleId,
        duration: grant.duration ?? bundle?.timeout,
        tokens: tokensSet ? grant.tokens : bundle?.tokensGranted,
        refresh: tokensSet ? grant.tokenRefreshInterval : bundle?.tokenRefreshInterval,
      };
    });
  }

  // "100 tokens a month" for a refresh of one unit, "20 tokens every 7 days" for any other, and
  // "5 tokens" when the tokens do not refresh.
  function tokensText(count, refresh, helpers) {
    const { siteText } = helpers;
    if (refresh === "P1M") return siteText("bundles.pass-grant-tokens-monthly", "{count} tokens a month", { count });
    if (refresh === "P1Y") return siteText("bundles.pass-grant-tokens-yearly", "{count} tokens a year", { count });
    if (refresh === "P1D") return siteText("bundles.pass-grant-tokens-daily", "{count} tokens a day", { count });
    const every = durationWords(refresh, helpers);
    if (every) return siteText("bundles.pass-grant-tokens-every", "{count} tokens every {every}", { count, every });
    return siteText("bundles.pass-grant-tokens", "{count} tokens", { count });
  }

  function bundleLine({ name, duration, tokens, refresh }, helpers) {
    const { siteText } = helpers;
    const lasts = durationWords(duration, helpers);
    const parts = [
      lasts
        ? siteText("bundles.pass-grant-lasts", "{name} for {lasts} from redemption", { name, lasts })
        : siteText("bundles.pass-grant-no-end", "{name} with no end date", { name }),
    ];
    if (tokens === "unlimited") parts.push(siteText("bundles.pass-grant-unlimited-tokens", "no limit on tokens"));
    else if (typeof tokens === "number") parts.push(tokensText(tokens, refresh, helpers));
    return parts.join(", ");
  }

  /**
   * The terms of a pass, one line each: the window in which it can be redeemed, its redemption
   * limits, and each bundle it grants.
   *
   * @param {Object} pass - a pass as the my-passes or campaign list returns it
   * @param {Object} catalogue - the parsed product catalogue
   * @param {{siteText: Function, dateText: Function}} helpers
   * @returns {string[]}
   */
  function termsLines(pass, catalogue, helpers) {
    const { siteText, dateText } = helpers;
    const from = dateText(new Date(pass.validFrom || pass.createdAt));
    const windowLine = pass.validUntil
      ? siteText("bundles.pass-window", "Redeem from {from} to {until}", { from, until: dateText(new Date(pass.validUntil)) })
      : siteText("bundles.pass-window-open", "Redeem from {from}, with no end date", { from });
    const perAccount = pass.usesPerAccount ?? 1;
    const perAccountText =
      perAccount === 1
        ? siteText("bundles.pass-one-per-account", "1 per account")
        : siteText("bundles.pass-per-account", "{count} per account", { count: perAccount });
    const limitsLine =
      pass.maxUses === null || pass.maxUses === undefined
        ? siteText("bundles.pass-limits-open", "No limit on redemptions, {each}", { each: perAccountText })
        : siteText("bundles.pass-limits", "Up to {max} redemptions, {each}", { max: pass.maxUses, each: perAccountText });
    return [windowLine, limitsLine, ...grantedBundles(pass, catalogue).map((bundle) => bundleLine(bundle, helpers))];
  }

  function termsEl(pass, catalogue, helpers) {
    return el("ul", { class: "pass-terms" }, ...termsLines(pass, catalogue, helpers).map((line) => el("li", {}, line)));
  }

  function figureCell(key, label, value, { count = true } = {}, { siteText }) {
    let shown = String(value);
    if (value === null || value === undefined) shown = count ? siteText("bundles.fewer-than-three", "fewer than 3") : "—";
    return el("div", { "class": "pass-figure", "data-figure": key }, el("dt", {}, label), el("dd", {}, shown));
  }

  function lastUsedLabel(lastUsed, { siteText, dateText }) {
    if (!lastUsed) return siteText("bundles.not-used-yet", "Not used yet");
    return dateText(new Date(lastUsed), { month: "short" });
  }

  function figuresEl(figures, className, helpers) {
    const { siteText } = helpers;
    return el(
      "dl",
      { class: className },
      figureCell("uses", siteText("bundles.figure-uses", "Uses"), figures.uses, { count: false }, helpers),
      figureCell("new-accounts", siteText("bundles.figure-new-accounts", "New accounts"), figures.newAccounts, {}, helpers),
      figureCell("filed", siteText("bundles.figure-filed", "Filed"), figures.filed, {}, helpers),
      figureCell("subscribers", siteText("bundles.figure-subscribers", "Subscribers"), figures.subscribers, {}, helpers),
      figureCell("paid-charges", siteText("bundles.figure-paid-charges", "Paid charges"), figures.paidCharges, {}, helpers),
      figureCell(
        "last-used",
        siteText("bundles.figure-last-used", "Last used"),
        lastUsedLabel(figures.lastUsed, helpers),
        { count: false },
        helpers,
      ),
    );
  }

  window.passCard = { typeLabel, termsLines, termsEl, figuresEl, durationWords, grantedBundles, bundleLine };
})();
