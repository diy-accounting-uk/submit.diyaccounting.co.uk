// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// The walkthrough under an embedded video: a twistie of scene thumbnails, a lights-down overlay
// that shows one scene full size with its text, and a share action that carries the scene's
// text, a link to the scene on this site and the YouTube link at that moment. The data is the
// "walkthrough" array of the video's entry in videos/publish.json.

const YOUTUBE_SHORT_BASE = "https://youtu.be/";
const COPIED_MS = 2500;

// A split scene's frames are told apart by step: `<scene id>-<step>`.
export function sceneKey(scene) {
  return scene.step === undefined ? scene.scene : `${scene.scene}-${scene.step}`;
}

export function sceneAnchor(video, scene) {
  return `${video.id}-${sceneKey(scene)}`;
}

export function youtubeLink(video, scene) {
  return `${YOUTUBE_SHORT_BASE}${encodeURIComponent(video.videoId)}?t=${Math.max(0, Math.floor(scene.startSeconds))}`;
}

export function hasWalkthrough(video) {
  return Array.isArray(video.walkthrough) && video.walkthrough.length > 0;
}

// The video and scene a location hash names (`<video id>-<scene id>`), or null.
export function sceneForHash(hash, videos) {
  const anchor = String(hash ?? "").replace(/^#/, "");
  for (const video of videos) {
    if (!hasWalkthrough(video)) continue;
    const scene = video.walkthrough.find((s) => sceneAnchor(video, s) === anchor);
    if (scene) return { video, scene };
  }
  return null;
}

function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function button(className, label) {
  const element = el("button", className, label);
  element.type = "button";
  return element;
}

function sceneItem(video, scene) {
  const item = el("li", "walkthrough-item");
  item.id = sceneAnchor(video, scene);

  const open = button("walkthrough-thumb", "");
  open.dataset.videoId = video.id;
  open.dataset.scene = sceneKey(scene);
  open.setAttribute("aria-label", `View full size: ${scene.headline}`);
  const image = document.createElement("img");
  image.src = scene.thumb;
  image.alt = scene.caption;
  image.loading = "lazy";
  image.width = 480;
  image.height = 270;
  open.append(image);

  const heading = el("h3", "walkthrough-headline", scene.headline);
  const caption = el("p", "walkthrough-caption", scene.caption);

  const actions = el("div", "walkthrough-actions");
  const share = button("btn btn-small walkthrough-share", "Share");
  share.dataset.videoId = video.id;
  share.dataset.scene = sceneKey(scene);
  share.setAttribute("aria-label", `Share: ${scene.headline}`);
  const status = el("span", "walkthrough-status");
  status.setAttribute("role", "status");
  actions.append(share, status);

  item.append(open, heading, caption, actions);
  return item;
}

// The twistie for one video; null when the video has no walkthrough data.
export function walkthroughElement(video) {
  if (!hasWalkthrough(video)) return null;
  const details = el("details", "walkthrough");
  details.id = `${video.id}-walkthrough`;
  const count = video.walkthrough.length;
  details.append(el("summary", "", `Walkthrough: ${count} ${count === 1 ? "step" : "steps"}, with screenshots`));
  const list = el("ol", "walkthrough-list");
  list.append(...video.walkthrough.map((scene) => sceneItem(video, scene)));
  details.append(list);
  return details;
}

function overlayElement() {
  const dialog = document.createElement("dialog");
  dialog.className = "walkthrough-overlay";
  dialog.setAttribute("aria-labelledby", "walkthroughOverlayHeading");

  const bar = el("div", "walkthrough-overlay-bar");
  const position = el("span", "walkthrough-overlay-position");
  const close = button("btn btn-small walkthrough-close", "Close");
  close.autofocus = true;
  bar.append(position, close);

  const image = document.createElement("img");
  image.className = "walkthrough-overlay-image";
  const heading = el("h3", "walkthrough-overlay-heading");
  heading.id = "walkthroughOverlayHeading";
  const caption = el("p", "walkthrough-overlay-caption");

  const actions = el("div", "walkthrough-overlay-actions");
  const previous = button("btn btn-small walkthrough-previous", "Previous");
  const next = button("btn btn-small walkthrough-next", "Next");
  const share = button("btn btn-small walkthrough-share-overlay", "Share");
  const status = el("span", "walkthrough-status");
  status.setAttribute("role", "status");
  actions.append(previous, next, share, status);

  dialog.append(bar, image, heading, caption, actions);
  return dialog;
}

function flashStatus(statusElement, text) {
  statusElement.textContent = text;
  setTimeout(() => {
    if (statusElement.textContent === text) statusElement.textContent = "";
  }, COPIED_MS);
}

// Shares through the device's share sheet when there is one, otherwise copies the same text to
// the clipboard and says "Copied" in the given live region.
async function shareScene({ video, scene, siteUrl, statusElement }) {
  const youtubeUrl = youtubeLink(video, scene);
  const title = `${video.title}: ${scene.headline}`;
  const text = `${scene.caption}\nWatch this moment: ${youtubeUrl}`;
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text, url: siteUrl });
    } catch (error) {
      if (error?.name !== "AbortError") flashStatus(statusElement, "Could not share");
    }
    return;
  }
  const clipboardText = `${title}\n${scene.caption}\n${siteUrl}\nWatch this moment: ${youtubeUrl}`;
  try {
    await navigator.clipboard.writeText(clipboardText);
    flashStatus(statusElement, "Copied");
  } catch {
    window.prompt("Copy this link", clipboardText);
  }
}

// Wires the twisties already rendered inside container. siteUrlFor(video, scene) gives the
// absolute link to a scene on this site. Returns { openScene(videoId, sceneId) }.
export function wireWalkthrough(container, videosById, siteUrlFor) {
  const overlay = overlayElement();
  document.body.append(overlay);
  const parts = {
    position: overlay.querySelector(".walkthrough-overlay-position"),
    image: overlay.querySelector(".walkthrough-overlay-image"),
    heading: overlay.querySelector(".walkthrough-overlay-heading"),
    caption: overlay.querySelector(".walkthrough-overlay-caption"),
    previous: overlay.querySelector(".walkthrough-previous"),
    next: overlay.querySelector(".walkthrough-next"),
    share: overlay.querySelector(".walkthrough-share-overlay"),
    close: overlay.querySelector(".walkthrough-close"),
    status: overlay.querySelector(".walkthrough-status"),
  };
  let current = null;
  let opener = null;

  function show(video, index) {
    const scene = video.walkthrough[index];
    current = { video, index };
    parts.image.src = scene.full;
    parts.image.alt = scene.caption;
    parts.heading.textContent = scene.headline;
    parts.caption.textContent = scene.caption;
    parts.position.textContent = `${video.title}: step ${index + 1} of ${video.walkthrough.length}`;
    parts.previous.disabled = index === 0;
    parts.next.disabled = index === video.walkthrough.length - 1;
    parts.status.textContent = "";
  }

  function step(delta) {
    if (!current) return;
    const index = current.index + delta;
    if (index < 0 || index >= current.video.walkthrough.length) return;
    const focused = document.activeElement;
    show(current.video, index);
    if ((focused === parts.previous || focused === parts.next) && focused.disabled) {
      (focused === parts.previous ? parts.next : parts.previous).focus();
    }
  }

  function openScene(videoId, sceneId, openerElement = null) {
    const video = videosById.get(videoId);
    const index = video?.walkthrough?.findIndex((s) => sceneKey(s) === sceneId) ?? -1;
    if (index < 0) return false;
    const itemId = CSS.escape(`${video.id}-${sceneId}`);
    opener = openerElement ?? container.querySelector(`#${itemId} .walkthrough-thumb`);
    show(video, index);
    if (!overlay.open) overlay.showModal();
    return true;
  }

  container.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const thumb = target?.closest(".walkthrough-thumb");
    if (thumb) {
      openScene(thumb.dataset.videoId, thumb.dataset.scene, thumb);
      return;
    }
    const share = target?.closest(".walkthrough-share");
    if (share) {
      const video = videosById.get(share.dataset.videoId);
      const scene = video?.walkthrough?.find((s) => sceneKey(s) === share.dataset.scene);
      if (scene) shareScene({ video, scene, siteUrl: siteUrlFor(video, scene), statusElement: share.nextElementSibling });
    }
  });

  parts.close.addEventListener("click", () => overlay.close());
  parts.previous.addEventListener("click", () => step(-1));
  parts.next.addEventListener("click", () => step(1));
  parts.share.addEventListener("click", () => {
    if (!current) return;
    const scene = current.video.walkthrough[current.index];
    shareScene({ video: current.video, scene, siteUrl: siteUrlFor(current.video, scene), statusElement: parts.status });
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    }
  });
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) overlay.close();
  });
  overlay.addEventListener("close", () => {
    if (opener?.isConnected) opener.focus();
    opener = null;
    current = null;
  });

  return { openScene };
}

// Opens the twistie of the video a scene hash names, scrolls to the scene and opens it in the
// overlay. Returns true when the hash named a scene on this page.
export function openSceneFromHash(hash, videos, controller) {
  const found = sceneForHash(hash, videos);
  if (!found) return false;
  const details = document.getElementById(`${found.video.id}-walkthrough`);
  if (!details) return false;
  details.open = true;
  document.getElementById(sceneAnchor(found.video, found.scene))?.scrollIntoView();
  return controller.openScene(found.video.id, sceneKey(found.scene));
}
