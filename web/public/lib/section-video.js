// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/section-video.js
// The part of a published video that shows one section of a form: the first video, in the order
// given, whose publish.json entry holds a start second for the section. The panel under the
// section's heading loads YouTube's player only when the reader opens it.

const EMBED_BASE = "https://www.youtube-nocookie.com/embed/";
const SHORT_LINK_BASE = "https://youtu.be/";

function siteText(id, english, values) {
  if (globalThis.siteText) return globalThis.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

export const CT600_VIDEO_ORDER = [
  "file-company-tax-return-typed",
  "file-company-tax-return-with-accounts",
  "file-company-tax-return-book",
  "file-company-tax-return-long-period",
];

/**
 * The video and second that show a section, or null.
 * @param {Array<{id: string, videoId?: string, title?: string, sections?: Record<string, number>}>} videos - publish.json's list
 * @param {string} sectionId - the section element's id
 * @param {string[]} order - the video ids to look in, first first
 */
export function sectionVideoFor(videos, sectionId, order = CT600_VIDEO_ORDER) {
  for (const id of order) {
    const entry = (videos ?? []).find((video) => video.id === id);
    const second = entry?.sections?.[sectionId];
    if (entry?.videoId && Number.isInteger(second)) return { videoId: entry.videoId, title: entry.title ?? "", second };
  }
  return null;
}

/** A second of a video as m:ss. */
export function timeText(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function embedUrl({ videoId, second }) {
  return `${EMBED_BASE}${encodeURIComponent(videoId)}?start=${second}`;
}

export function shortLink({ videoId, second }) {
  return `${SHORT_LINK_BASE}${encodeURIComponent(videoId)}?t=${second}`;
}

/** A closed "Watch this part" panel with the player at the section's second and a link to that time on YouTube. */
export function sectionVideoElement(doc, sectionId, choice) {
  const details = doc.createElement("details");
  details.className = "section-video";
  details.id = `${sectionId}-video`;
  const summary = doc.createElement("summary");
  summary.textContent = siteText("ct.section-video-summary", "Watch this part");
  const frame = doc.createElement("div");
  frame.className = "section-video__frame";
  const link = doc.createElement("a");
  link.href = shortLink(choice);
  link.target = "_blank";
  link.rel = "noopener";
  link.className = "section-video__link";
  link.textContent = siteText("ct.section-video-link", "Watch from {time}", { time: timeText(choice.second) });
  details.append(summary, frame, link);
  details.addEventListener("toggle", () => {
    if (!details.open || frame.querySelector("iframe")) return;
    const iframe = doc.createElement("iframe");
    iframe.src = embedUrl(choice);
    iframe.title = choice.title;
    iframe.allow = "accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.allowFullscreen = true;
    frame.append(iframe);
  });
  return details;
}

/** Put a panel under the heading of each form section a published video shows. */
export async function addSectionVideos(doc, { fetchList = () => fetch("/videos/publish.json").then((response) => response.json()) } = {}) {
  let list;
  try {
    list = await fetchList();
  } catch {
    return;
  }
  for (const section of doc.querySelectorAll("section.form-section[id]")) {
    if (section.querySelector(":scope > details.section-video")) continue;
    const choice = sectionVideoFor(list?.videos, section.id);
    const heading = section.querySelector(":scope > h3");
    if (choice && heading) heading.after(sectionVideoElement(doc, section.id, choice));
  }
}
