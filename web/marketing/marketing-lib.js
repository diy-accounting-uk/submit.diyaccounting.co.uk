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
 * The code in a pass link, or null. The link must be https, on a pass host, at /pass.html or the older /bundles.html,
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
  if (url.pathname !== "/pass.html" && url.pathname !== "/bundles.html") return null;
  const code = normaliseCode(url.searchParams.get("pass"));
  return isPassCode(code, data) ? code : null;
}

/** True when the link goes to Submit, so a pass replaces it. */
function isSubmitLink(link, data) {
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
function lengthForNetwork(network, set, selectedLengthId, { code }, data) {
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

/** The tagged link a listing gives its place: the product's link with utm_source from the listing, utm_medium listing and utm_campaign the product id. */
export function listingLink(product, listing) {
  const url = new URL(product.link);
  url.searchParams.set("utm_source", listing.utmSource);
  url.searchParams.set("utm_medium", "listing");
  url.searchParams.set("utm_campaign", product.id);
  return url.toString();
}

/** The copy-pack products a listing is filled from: its own products, or the company when it names none. */
export function listingProducts(listing, data) {
  const ids = listing.products.length ? listing.products : ["company"];
  return ids.map((id) => data.listingProducts.find((product) => product.id === id));
}

/** Every id the page renders, in page order; the unit test checks they are unique. */
export function pageAnchors(data) {
  const anchors = ["affiliate", "affiliates", "listings", "packs", "company-facts"];
  for (const listing of data.listings) anchors.push(`listing-${listing.id}`);
  for (const pack of data.listingProducts) anchors.push(`pack-${pack.id}`);
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

/** The number of words in a text: runs of characters between white space. */
export function wordCount(text) {
  const words = String(text).trim().split(/\s+/);
  return words[0] === "" ? 0 : words.length;
}

/** The length of a text in a field's unit: words, or characters as a person counts them. */
export function measure(text, unit) {
  return unit === "words" ? wordCount(text) : Array.from(String(text)).length;
}

/**
 * How a text or a list meets a field's target and each place's limit: the measured length, and one
 * entry per limit with a number, with fits false when the text is outside it. A list is measured in items.
 */
export function limitReport(field, value) {
  const isList = Array.isArray(value);
  const unit = isList ? "items" : field.unit;
  const length = isList ? value.length : measure(value, field.unit);
  const min = isList ? field.minItems : field.min;
  const max = isList ? field.maxItems : field.max;
  const within = (lo, hi) => (lo === undefined || length >= lo) && (hi === undefined || length <= hi);
  const limits = (field.limits ?? [])
    .filter((limit) => limit.min !== undefined || limit.max !== undefined)
    .map((limit) => ({
      place: limit.place,
      min: limit.min,
      max: limit.max,
      confirmed: limit.confirmed,
      fits: within(limit.min, limit.max),
    }));
  return { unit, length, min, max, fits: within(min, max), limits };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

/** The CRC-32 of a byte array, as a zip file records it. */
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * A zip archive of the entries ({ name, bytes }), stored without compression: the images are PNG and
 * already compressed, and a stored zip needs no library in the browser. Names are UTF-8.
 */
export function zipStore(entries) {
  const encoder = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const bytes = entry.bytes;
    const crc = crc32(bytes);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, 0, true);
    local.setUint16(12, 0x0021, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, bytes.length, true);
    local.setUint32(22, bytes.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    locals.push(new Uint8Array(local.buffer), name, bytes);
    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, 0, true);
    central.setUint16(14, 0x0021, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, bytes.length, true);
    central.setUint32(24, bytes.length, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);
    centrals.push(new Uint8Array(central.buffer), name);
    offset += 30 + name.length + bytes.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** The text of a pack as its zip holds it: one block per field, with its length. */
export function packText(pack) {
  const block = (label, value) => `${label}\n${value}\n`;
  const blocks = [
    block("Name", pack.name),
    pack.activity ? block("Product activity", pack.activity) : "",
    block(`Tagline (${measure(pack.tagline)} characters)`, pack.tagline),
    block(`One line (${measure(pack.oneLine)} characters)`, pack.oneLine),
    block(`Short description (${measure(pack.description160)} characters)`, pack.description160),
    block(`Description (${measure(pack.description500)} characters)`, pack.description500),
    block(`Long description (${wordCount(pack.long)} words)`, pack.long),
    block("Keywords", pack.keywords.join(", ")),
    block("Categories", pack.categories.join(", ")),
    block("Features", pack.features.map((f) => `- ${f}`).join("\n")),
    block("Integrations", pack.integrations.join(", ")),
    block("Price", pack.priceText),
    pack.priceNote ? block("Price note", pack.priceNote) : "",
    block("Category", pack.category),
    block("Link", pack.link),
    pack.videos.length ? block("Videos", pack.videos.map((v) => `${v.title} (${v.seconds} seconds): ${v.url}`).join("\n")) : "",
    block("Screenshots", pack.screenshots.map((s) => `${s.file.split("/").pop()}: ${s.alt}`).join("\n")),
  ];
  return blocks.filter(Boolean).join("\n");
}

/** The company's facts as each pack's zip holds them. */
export function companyText(company, liveListings) {
  const lines = [
    ["Company name", company.name],
    ["Company number", company.number],
    ["Registered office", company.registeredOffice],
    ["Country", company.country],
    ["Support email", company.supportEmail],
    ["Phone", company.phone],
    ["Phone, international", company.phoneInternational],
    ["Website", company.website],
    ["LinkedIn", company.linkedin],
    ["Founded", company.founded],
    ["Head count", company.headCount],
    ["Boilerplate", company.boilerplate],
    ["Founder", company.founderName],
    [`Founder, short (${wordCount(company.founderShort)} words)`, company.founderShort],
    [`Founder, long (${wordCount(company.founderLong)} words)`, company.founderLong],
    ["Team", company.team],
    ...company.links.map((link) => [link.label, link.url]),
    ...liveListings.map((listing) => [`Reviews, ${listing.place}`, listing.url]),
  ];
  return lines.map(([label, value]) => `${label}\n${value}\n`).join("\n");
}

/** Every file a pack's zip holds, as [path in the zip, path on the site]. */
export function packFiles(pack, company) {
  const logos = pack.logos;
  const files = [
    logos.icon,
    logos.square.light.svg,
    logos.square.dark.svg,
    ...["light", "dark", "transparent"].flatMap((variant) => logos.square[variant].png.map((p) => p.file)),
    logos.wide.light.svg,
    logos.wide.light.png,
    logos.wide.dark.svg,
    logos.wide.dark.png,
  ].map((file) => [`logos/${file.split("/").pop()}`, file]);
  for (const shot of pack.screenshots) files.push([`screenshots/${shot.file.split("/").pop()}`, shot.file]);
  for (const file of [company.founderPhoto, company.teamPhoto]) files.push([`company/${file.split("/").pop()}`, file]);
  return files;
}

const CONTACT_PATTERN = /https?:\/\/|www\.|[\w.+-]+@[\w-]+\.[\w.]+|\b0\d{3}\s?\d{3}\s?\d{4}\b|\+44\s?\d/;
const CALL_TO_ACTION_PATTERN =
  /\b(start with|try it|try (it )?free|sign up|download (it )?now|buy now|click here|get started|subscribe now)\b/i;

/**
 * The problems of the listing packs, one sentence each: a field a pack lacks, a text or list outside
 * its field's target or a place's limit, a contact detail or a call to action where the field
 * forbids one, and a screenshot count outside the field's range. An empty list means every pack is whole.
 */
export function packProblems(data) {
  const problems = [];
  for (const pack of data.listingProducts) {
    for (const field of data.packFields) {
      const name = `pack ${pack.id}: ${field.id}`;
      if (field.kind === "text" || field.kind === "list") {
        const value = pack[field.id];
        if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
          problems.push(`${name} is missing`);
          continue;
        }
        const report = limitReport(field, value);
        if (!report.fits) problems.push(`${name} is ${report.length} ${report.unit}, outside its target`);
        for (const limit of report.limits)
          if (!limit.fits) problems.push(`${name} is ${report.length} ${report.unit}, outside the limit of ${limit.place}`);
        if (field.noContact && CONTACT_PATTERN.test(value)) problems.push(`${name} holds a link, an email address or a phone number`);
        if (field.noCallToAction && CALL_TO_ACTION_PATTERN.test(value)) problems.push(`${name} holds a call to action`);
      } else if (field.kind === "image" && field.id === "screenshots") {
        const count = pack.screenshots?.length ?? 0;
        if (count < field.minItems || count > field.maxItems)
          problems.push(`${name} has ${count}, outside ${field.minItems} to ${field.maxItems}`);
      } else if (field.kind === "image") {
        const logos = pack.logos;
        const has = { logo: logos?.square?.light?.png?.length, logoWide: logos?.wide?.light?.png, icon: logos?.icon }[field.id];
        if (!has) problems.push(`${name} is missing`);
      } else if (field.kind === "link") {
        if (!/^https:\/\//.test(pack.link ?? "")) problems.push(`${name} is not an https link`);
      }
    }
  }
  return problems;
}

/** The live listings where people can read and leave reviews: the review sites and the citation directories. */
export function reviewListings(data) {
  return data.listings.filter((listing) => listing.state === "live" && listing.url && ["review", "citation"].includes(listing.group));
}
