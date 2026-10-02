// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Renders one of the six video pages (the index, or one of the five area pages) from
// videos/publish.json. Each page's own inline script calls renderVideoPage() with its mode
// and, for an area page, its group — this module holds the one copy of the markup and the
// manifest handling that all six pages share.

import { walkthroughElement, wireWalkthrough, openSceneFromHash, sceneForHash, sceneAnchor } from "./video-walkthrough.js";

const MANIFEST_URL = "videos/publish.json";
const EMBED_BASE = "https://www.youtube-nocookie.com/embed/";
const TITLE_PREFIXES = ["DIY Accounting Submit: ", "DIY Accounting: "];

const GROUP_LABELS = {
  "vat": "VAT",
  "itsa": "Self Assessment (sandbox)",
  "account": "Account and passes",
  "companies-house": "Companies House",
  "accounting": "How to do your accounts",
};

export const AREA_PAGES = {
  "vat": "videos-hmrc-vat.html",
  "itsa": "videos-hmrc-itsa.html",
  "account": "videos-account.html",
  "companies-house": "videos-ch.html",
  "accounting": "videos-accounting.html",
};

// The index shows only these, one per area, in this order; every other published video shows
// on its area page only.
export const FEATURED_IDS = ["submit-return", "itsa-quarterly-update", "sign-in", "file-confirmation-statement"];

function areaPageForGroup(group) {
  return AREA_PAGES[group] ?? "videos.html";
}

// The section heading keeps the full title; only a Contents link drops the prefix every title
// repeats, since the page's own heading already says whose product this is.
function contentsLinkText(title) {
  const text = String(title ?? "");
  const prefix = TITLE_PREFIXES.find((p) => text.startsWith(p));
  return prefix ? text.slice(prefix.length) : text;
}

// Buckets videos by their publish.json "group", one bucket per group in the order the group
// first appears, videos within a bucket kept in publish.json order.
function groupVideos(videos) {
  const order = [];
  const byGroup = new Map();
  for (const video of videos) {
    const key = video.group ?? "";
    if (!byGroup.has(key)) {
      byGroup.set(key, []);
      order.push(key);
    }
    byGroup.get(key).push(video);
  }
  return order.map((key) => ({ key, label: GROUP_LABELS[key] ?? key, videos: byGroup.get(key) }));
}

// A group's own heading and link list, as real DOM elements (never innerHTML) so a title
// carrying markup-like characters can never be reinterpreted as markup.
function contentsGroupElements(group) {
  const heading = document.createElement("h3");
  heading.textContent = group.label;
  const list = document.createElement("ul");
  list.replaceChildren(
    ...group.videos.map((video) => {
      const link = document.createElement("a");
      link.href = areaLinkHref(video);
      link.textContent = contentsLinkText(video.title);
      const item = document.createElement("li");
      item.append(link);
      return item;
    }),
  );
  return [heading, list];
}

// The contents for one video's own area only, placed under a featured video on the index so a
// reader landing on one featured video can reach the rest of its area without the full list.
function ownAreaContentsElement(video, videos) {
  const group = groupVideos(videos).find((g) => g.key === video.group);
  if (!group) return null;
  const nav = document.createElement("nav");
  nav.className = "video-contents-nav video-own-contents";
  nav.setAttribute("aria-label", `${group.label} videos`);
  const groupsContainer = document.createElement("div");
  groupsContainer.className = "video-contents-groups";
  groupsContainer.append(...contentsGroupElements(group));
  nav.append(groupsContainer);
  return nav;
}

// The first two sentences of a description, split on a full stop followed by whitespace.
function firstTwoSentences(description) {
  const sentences = String(description ?? "")
    .split(/(?<=\.)\s+/)
    .filter(Boolean);
  return sentences.slice(0, 2).join(" ");
}

// A relative link to the video's own section, valid from any of the six pages.
function areaLinkHref(video) {
  return `${areaPageForGroup(video.group)}#${video.id}`;
}

// The absolute, shareable URL for one scene of a video's walkthrough, on the video's area page.
function sceneShareLink(video, scene) {
  return new URL(`${areaPageForGroup(video.group)}#${sceneAnchor(video, scene)}`, window.location.href).toString();
}

// The absolute, shareable URL for a video, always its area page even when read from the index
// or from another area page — so a copied link and a YouTube description link keep working.
function shareLink(video) {
  return new URL(areaLinkHref(video), window.location.href).toString();
}

function sectionElement(video) {
  const section = document.createElement("section");
  section.className = "video-section";
  section.id = video.id;
  section.dataset.videoId = video.videoId;

  const heading = document.createElement("h2");
  heading.textContent = video.title;
  const summary = document.createElement("p");
  summary.textContent = firstTwoSentences(video.description);

  const frame = document.createElement("div");
  frame.className = "video-frame";
  const iframe = document.createElement("iframe");
  iframe.src = EMBED_BASE + encodeURIComponent(video.videoId);
  iframe.title = video.title;
  iframe.loading = "lazy";
  iframe.allow = "accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.allowFullscreen = true;
  frame.append(iframe);

  const share = document.createElement("div");
  share.className = "video-share";
  const link = document.createElement("a");
  link.className = "video-link";
  link.href = areaLinkHref(video);
  link.textContent = "Link to this video";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn btn-small copy-link";
  button.dataset.target = video.id;
  button.textContent = "Copy link";
  const copied = document.createElement("span");
  copied.className = "copied";
  copied.hidden = true;
  copied.textContent = "Copied";
  share.append(link, button, copied);

  section.append(heading, summary, frame, share);
  const walkthrough = walkthroughElement(video);
  if (walkthrough) section.append(walkthrough);
  return section;
}

function messageElement(text) {
  const message = document.createElement("p");
  message.className = "service-description";
  message.textContent = text;
  return message;
}

function wireCopyButtons(container, videosById) {
  container.querySelectorAll("button.copy-link").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.getAttribute("data-target");
      const video = videosById.get(id);
      const link = video ? shareLink(video) : window.location.href;
      const copied = button.parentElement.querySelector(".copied");
      try {
        await navigator.clipboard.writeText(link);
        copied.hidden = false;
        setTimeout(() => {
          copied.hidden = true;
        }, 2000);
      } catch {
        window.prompt("Copy this link", link);
      }
    });
  });
}

// A hash naming a video on this page scrolls to it; a hash naming one of its walkthrough scenes
// opens the walkthrough and that scene. On the index, a hash naming a video (or a scene of a
// video) that is published but not featured there has no section to scroll to, so it redirects
// to the video's own area page instead of landing on an empty page.
function handleHash(mode, videos, pageVideos, walkthrough) {
  if (!window.location.hash) return;
  const id = window.location.hash.slice(1);
  if (openSceneFromHash(window.location.hash, pageVideos, walkthrough)) return;
  if (pageVideos.some((video) => video.id === id)) {
    const target = document.getElementById(id);
    if (target) target.scrollIntoView();
    return;
  }
  if (mode !== "index") return;
  const video = videos.find((v) => v.id === id) ?? sceneForHash(window.location.hash, videos)?.video;
  if (video) window.location.replace(`${areaPageForGroup(video.group)}#${id}`);
}

export async function renderVideoPage({ mode, group }) {
  const container = document.getElementById("videoList");
  let manifest;
  try {
    const response = await fetch(MANIFEST_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    manifest = await response.json();
  } catch (err) {
    container.replaceChildren(messageElement("The video list could not be loaded."));
    console.error("[video-pages.js] manifest load failed:", err);
    return;
  }
  const videos = (manifest.videos || []).filter((v) => v && v.videoId);
  if (videos.length === 0) {
    container.replaceChildren(messageElement("No videos are published yet."));
    return;
  }

  const navContents = document.getElementById("videoContents");
  if (navContents) {
    const groupsContainer = navContents.querySelector(".video-contents-groups");
    groupsContainer.replaceChildren(...groupVideos(videos).flatMap(contentsGroupElements));
    navContents.hidden = false;
  }

  const pageVideos = mode === "area" ? videos.filter((v) => v.group === group) : videos.filter((v) => FEATURED_IDS.includes(v.id));

  if (pageVideos.length === 0) {
    container.replaceChildren(messageElement("No videos are published yet."));
  } else {
    container.replaceChildren(...pageVideos.map(sectionElement));
    // The index also shows each featured video's own area, so a reader who arrives on one
    // doesn't have to scroll back up to the full contents to find the rest of it.
    if (mode === "index") {
      for (const video of pageVideos) {
        const ownContents = ownAreaContentsElement(video, videos);
        if (ownContents) document.getElementById(video.id)?.after(ownContents);
      }
    }
  }

  const videosById = new Map(videos.map((video) => [video.id, video]));
  wireCopyButtons(container, videosById);

  const walkthrough = wireWalkthrough(container, videosById, sceneShareLink);
  // A hash arriving before the sections existed has nothing to scroll to; act on it now.
  handleHash(mode, videos, pageVideos, walkthrough);
}
