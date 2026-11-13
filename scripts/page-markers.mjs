// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// The two helpers that build-static-content.mjs and publish-content.mjs share: HTML escaping and
// the replacement of the block between a pair of marker comments in a page.

export function escapeHtml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Replace what sits between a pair of marker comments.
 * @param {string} html the page
 * @param {string} name the marker name: <!-- generated:NAME:start --> and <!-- generated:NAME:end -->
 * @param {string} content the new content between the markers
 * @returns {string} the page with the content in place
 */
export function replaceBetweenMarkers(html, name, content) {
  const start = `<!-- generated:${name}:start -->`;
  const end = `<!-- generated:${name}:end -->`;
  const from = html.indexOf(start);
  const to = html.indexOf(end);
  if (from === -1 || to === -1 || to < from) throw new Error(`The page has no "${name}" marker pair`);
  return `${html.slice(0, from + start.length)}\n${content}\n${html.slice(to)}`;
}
