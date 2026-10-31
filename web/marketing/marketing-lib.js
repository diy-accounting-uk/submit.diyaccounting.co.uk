// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/marketing/marketing-lib.js
// The rules of the marketing page with no DOM: the pass code and pass link, the link each post
// carries, the post text, the share URL per network, and which campaigns run today.
// marketing.js uses it in the browser; web/unit-tests/marketing-site.test.js imports it in Node.

/** Lower-cases and trims what the reader typed. */
export function normaliseCode(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase();
}

/** True when the code has the shape of a generated pass: four words of 3 to 7 letters joined by hyphens. */
export function isPassCode(code, data) {
  return new RegExp(data.passCodePattern).test(code);
}

/** The pass link for a code, from the template in the data. */
export function passUrl(code, data) {
  return data.passUrlTemplate.replace("{code}", encodeURIComponent(code));
}

/**
 * The code in a pass link, or null. The link must be https, on a pass host, at /bundles.html,
 * with a pass parameter of the right shape. Other parameters (for example ref) are ignored.
 */
export function codeFromPassUrl(raw, data) {
  let url;
  try {
    url = new URL(String(raw ?? "").trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (!data.passHosts.includes(url.hostname)) return null;
  if (url.pathname !== "/bundles.html") return null;
  const code = normaliseCode(url.searchParams.get("pass"));
  return isPassCode(code, data) ? code : null;
}

/** True when the link goes to Submit, so a pass replaces it. */
export function isSubmitLink(link, data) {
  return data.submitHosts.includes(new URL(link).hostname);
}

/**
 * The link a post carries. A Submit link becomes the pass link when there is a pass. Every link
 * gets utm_source, utm_medium, utm_campaign (the set id) and utm_content (the length id).
 */
export function postLink(set, { code, source, medium, lengthId }, data) {
  const base = code && isSubmitLink(set.link, data) ? passUrl(code, data) : set.link;
  const url = new URL(base);
  url.searchParams.set("utm_source", source);
  url.searchParams.set("utm_medium", medium);
  url.searchParams.set("utm_campaign", set.id);
  url.searchParams.set("utm_content", lengthId);
  return url.toString();
}

/** True when the post carries a pass, so it must open with the disclosure. */
export function carriesPass(set, code, data) {
  return Boolean(code) && isSubmitLink(set.link, data);
}

/** The post text with {link} and {offer} filled, opened with the disclosure when it carries a pass. */
export function renderPost(set, lengthId, { code, link }, data) {
  const template = set.posts[lengthId];
  const offer = code ? data.offers.withPass : data.offers.withoutPass;
  const text = template.replaceAll("{offer}", offer).replaceAll("{link}", link);
  return carriesPass(set, code, data) ? `${data.disclosure} ${text}` : text;
}

/**
 * The length of a post as X counts it: every URL is 23, a character up to U+10FF is 1, and any
 * other character is 2 (the ™ sign is 2).
 */
export function xWeightedLength(text) {
  const urls = text.match(/https?:\/\/\S+/g) ?? [];
  let rest = text;
  for (const u of urls) rest = rest.replace(u, "");
  let length = urls.length * 23;
  for (const ch of rest) length += ch.codePointAt(0) <= 0x10ff ? 1 : 2;
  return length;
}

/**
 * The length the X button posts: the selected one when it fits, else the short one.
 */
export function lengthForNetwork(network, set, selectedLengthId, { code }, data) {
  if (!network.maxWeightedLength) return selectedLengthId;
  const link = postLink(set, { code, source: network.id, medium: network.utmMedium, lengthId: selectedLengthId }, data);
  const text = renderPost(set, selectedLengthId, { code, link }, data);
  return xWeightedLength(text) <= network.maxWeightedLength ? selectedLengthId : "short";
}

/** The share URL for one network, one set and the selected length. */
export function shareUrl(network, set, selectedLengthId, { code }, data) {
  const lengthId = lengthForNetwork(network, set, selectedLengthId, { code }, data);
  const link = postLink(set, { code, source: network.id, medium: network.utmMedium, lengthId }, data);
  const text = renderPost(set, lengthId, { code, link }, data);
  const values = {
    url: link,
    text,
    title: carriesPass(set, code, data) ? `${data.disclosure} ${set.posts.headline}` : set.posts.headline,
    subject: set.emailSubject,
  };
  return network.urlTemplate.replace(/\{(url|text|title|subject)\}/g, (_, key) => encodeURIComponent(values[key]));
}

/** Today's date in Europe/London as YYYY-MM-DD. */
export function londonDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** The campaigns whose start and end dates, both inclusive, hold today. */
export function runningCampaigns(data, now = new Date()) {
  const today = londonDate(now);
  return data.campaigns.filter((c) => c.start <= today && today <= c.end);
}

/**
 * What the Web Share API gets: the post without its closing link as text, and the link as url,
 * so a share target that adds the url does not show it twice. Every post ends with {link}.
 */
export function nativeSharePayload(set, lengthId, { code }, data) {
  const link = postLink(set, { code, source: "native", medium: "social", lengthId }, data);
  const text = renderPost(set, lengthId, { code, link }, data);
  return { title: set.posts.headline, text: text.slice(0, text.length - link.length).trimEnd(), url: link };
}

/** Every id the page renders, in page order; the unit test checks they are unique. */
export function pageAnchors(data) {
  const anchors = ["affiliate"];
  for (const section of data.sections) {
    anchors.push(section.id, `${section.id}-brand`);
    for (const product of section.products ?? []) {
      const sets = section.sets.filter((s) => s.product === product.id);
      if (sets.length > 1) anchors.push(product.id);
    }
    for (const set of section.sets) anchors.push(set.id);
  }
  return anchors;
}
