// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// The guide: one twisty per journey. A journey with a recorded video takes its steps (a frame, a
// headline and a caption each) from that video's walkthrough in videos/publish.json; a journey
// without frames lists text steps. A frame opens full size in the lightbox.

import { fetchActivityListing } from "./lib/services/content-listing.js";
import { GROUPS, splitTitle } from "./lib/guide-journeys.js";

const MANIFEST_URL = "videos/publish.json";

function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function copyLinkControl(stepId) {
  const copy = el("button", "guide-step-link", "Copy link");
  copy.type = "button";
  copy.setAttribute("aria-label", "Copy link to this step");
  copy.addEventListener("click", async () => {
    const url = `${window.location.origin}${window.location.pathname}#${stepId}`;
    try {
      await navigator.clipboard.writeText(url);
      copy.textContent = "Link copied";
    } catch {
      window.location.hash = stepId;
      copy.textContent = "Link in address bar";
    }
    setTimeout(() => {
      copy.textContent = "Copy link";
    }, 2000);
  });
  return copy;
}

function stepHeader(item, stepId, headline) {
  const header = el("div", "guide-step-header");
  header.append(el("h4", "guide-step-title", headline), copyLinkControl(stepId));
  item.append(header);
}

function frameStep(scene, stepId) {
  const item = el("li", "guide-step");
  item.id = stepId;
  stepHeader(item, stepId, scene.headline);
  const open = el("button", "guide-thumb");
  open.type = "button";
  open.dataset.full = scene.full;
  open.dataset.fullWidth = scene.fullWidth;
  open.dataset.fullHeight = scene.fullHeight;
  open.setAttribute("aria-label", `View full size: ${scene.headline}`);
  const image = document.createElement("img");
  image.src = scene.thumb;
  image.srcset = `${scene.thumb} ${scene.thumbWidth}w, ${scene.full} ${scene.fullWidth}w`;
  image.sizes = "(min-width: 700px) 45vw, 92vw";
  image.width = scene.thumbWidth;
  image.height = scene.thumbHeight;
  image.alt = `Screenshot: ${scene.headline}`;
  image.loading = "lazy";
  open.append(image);
  item.append(open, el("p", "guide-caption", scene.caption));
  return item;
}

function textStep([headline, caption], stepId) {
  const item = el("li", "guide-step");
  item.id = stepId;
  stepHeader(item, stepId, headline);
  item.append(el("p", "guide-caption", caption));
  return item;
}

function journeyElement(id, title, note, steps) {
  const details = el("details", "guide-journey");
  details.id = id;
  const summary = el("summary", "", title);
  if (note) summary.append(el("span", "guide-journey-note", note));
  const list = el("ol", "guide-steps-list");
  list.append(...steps);
  details.append(summary, list);
  return details;
}

function addJump(list, id, title) {
  const item = el("li");
  const link = el("a", "", title);
  link.href = `#${id}`;
  item.append(link);
  list.append(item);
}

function render(container, videos, isListed) {
  const byId = new Map(videos.map((video) => [video.id, video]));
  for (const group of GROUPS) {
    const section = el("section", "guide-group");
    section.append(el("h2", "", group.title), el("p", "guide-group-intro", group.intro));
    const jumpList = el("ul", "guide-jump");
    const nav = el("nav", "guide-jump-nav");
    nav.setAttribute("aria-label", `Journeys: ${group.title}`);
    nav.append(jumpList);
    section.append(nav);
    for (const journey of group.journeys) {
      if (journey.video) {
        const video = byId.get(journey.video);
        if (!video || !isListed(video.catalogueActivity)) continue;
        if (!Array.isArray(video.walkthrough) || video.walkthrough.length === 0) continue;
        const { title, note } = splitTitle(video.title);
        section.append(
          journeyElement(
            video.id,
            title,
            note,
            video.walkthrough.map((scene, index) => frameStep(scene, `${video.id}-step-${index + 1}`)),
          ),
        );
        addJump(jumpList, video.id, title);
      } else {
        if (!isListed(journey.catalogueActivity)) continue;
        section.append(
          journeyElement(
            journey.id,
            journey.title,
            "",
            journey.steps.map((step, index) => textStep(step, `${journey.id}-step-${index + 1}`)),
          ),
        );
        addJump(jumpList, journey.id, journey.title);
      }
    }
    if (jumpList.children.length > 0) container.append(section);
  }
}

function openFromHash() {
  const target = window.location.hash ? document.getElementById(decodeURIComponent(window.location.hash.slice(1))) : null;
  if (!target) return;
  const journey = target.closest("details");
  if (journey) {
    journey.open = true;
    target.scrollIntoView();
  }
}

function setUpLightbox(container) {
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightbox-image");
  const closeControl = lightbox.querySelector(".lightbox-close");
  const previous = lightbox.querySelector(".lightbox-previous");
  const next = lightbox.querySelector(".lightbox-next");
  const position = lightbox.querySelector(".lightbox-position");
  let opener = null;
  lightbox.setAttribute("role", "dialog");
  lightbox.setAttribute("aria-modal", "true");
  lightbox.setAttribute("aria-label", "Full size screenshot");
  let frames = [];
  let index = 0;
  const show = (target) => {
    index = Math.max(0, Math.min(frames.length - 1, target));
    const thumb = frames[index];
    lightboxImg.width = Number(thumb.dataset.fullWidth);
    lightboxImg.height = Number(thumb.dataset.fullHeight);
    lightboxImg.src = thumb.dataset.full;
    lightboxImg.alt = thumb.querySelector("img").alt;
    position.textContent = `${index + 1} of ${frames.length}`;
    previous.disabled = index === 0;
    next.disabled = index === frames.length - 1;
  };
  const move = (step) => {
    const target = index + step;
    if (target < 0 || target >= frames.length) return;
    show(target);
    if (document.activeElement === document.body || document.activeElement.disabled) closeControl.focus();
  };
  const close = () => {
    lightbox.classList.remove("active");
    document.body.style.overflow = "";
    if (opener) opener.focus();
    opener = null;
  };
  container.addEventListener("click", (event) => {
    const thumb = event.target.closest(".guide-thumb");
    if (!thumb) return;
    opener = thumb;
    frames = [...thumb.closest("ol").querySelectorAll(".guide-thumb")];
    show(frames.indexOf(thumb));
    lightbox.classList.add("active");
    document.body.style.overflow = "hidden";
    closeControl.focus();
  });
  lightbox.addEventListener("click", (event) => {
    if (event.target.closest(".lightbox-previous")) move(-1);
    else if (event.target.closest(".lightbox-next")) move(1);
    else close();
  });
  document.addEventListener("keydown", (event) => {
    if (!lightbox.classList.contains("active")) return;
    if (event.key === "Escape") close();
    else if (event.key === "ArrowLeft") move(-1);
    else if (event.key === "ArrowRight") move(1);
    else if (event.key === "Tab") {
      const controls = [previous, next, closeControl].filter((control) => !control.disabled);
      const at = controls.indexOf(document.activeElement);
      const target = event.shiftKey ? controls[(at <= 0 ? controls.length : at) - 1] : controls[(at + 1) % controls.length];
      event.preventDefault();
      target.focus();
    }
  });
}

async function init() {
  const container = document.getElementById("guideJourneys");
  setUpLightbox(container);
  try {
    const response = await fetch(MANIFEST_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const manifest = await response.json();
    const isListed = await fetchActivityListing();
    container.replaceChildren();
    render(container, manifest.videos, isListed);
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
  } catch (error) {
    container.append(el("p", "", "The guide could not load its steps. Reload the page to try again."));
    console.error("guide: could not load", MANIFEST_URL, error);
  }
}

init();
