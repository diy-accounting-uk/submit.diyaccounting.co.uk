// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/marketing/marketing.js
// Fills the marketing page from marketing.json: the brand guides, the post sets, the share links.
// The rules (pass code, links, post text, share URLs, campaigns) live in marketing-lib.js.

import {
  codeFromPassUrl,
  isPassCode,
  nativeSharePayload,
  normaliseCode,
  passUrl,
  postLink,
  renderPost,
  runningCampaigns,
  shareUrl,
} from "./marketing-lib.js";

const COPIED_FOR_MS = 3000;
const CODE_ERROR = "A pass code is four words joined by hyphens, for example tiger-happy-maple-river.";
const URL_ERROR = "Paste the link from Generate a pass. It looks like https://submit.diyaccounting.co.uk/bundles.html?pass=…";
const PASS_OK = "Your pass is in every DIY Accounting Submit link below. Posts that carry it start with #ad.";

const state = { data: null, code: "" };
const refreshers = [];

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) continue;
    if (name === "text") node.textContent = value;
    else node.setAttribute(name, value === true ? "" : value);
  }
  for (const child of children) node.append(child);
  return node;
}

function byId(id) {
  return document.getElementById(id);
}

// ---------------------------------------------------------------------------------------------
// Copying
// ---------------------------------------------------------------------------------------------

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = el("textarea", { "readonly": true, "aria-hidden": "true", "tabindex": "-1" });
    area.value = text;
    area.className = "sr-only";
    document.body.append(area);
    area.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    area.remove();
    return copied;
  }
}

function flash(statusEl, message) {
  statusEl.textContent = message;
  clearTimeout(statusEl.timer);
  statusEl.timer = setTimeout(() => {
    statusEl.textContent = "";
  }, COPIED_FOR_MS);
}

// ---------------------------------------------------------------------------------------------
// Post sets
// ---------------------------------------------------------------------------------------------

function selectedLength(article) {
  return article.querySelector("input[type=radio]:checked").value;
}

function copyPostText(set, lengthId) {
  const link = postLink(set, { code: state.code, source: "marketing", medium: "copy", lengthId }, state.data);
  return { link, text: renderPost(set, lengthId, { code: state.code, link }, state.data) };
}

function updateSet(article, set) {
  const lengthId = selectedLength(article);
  article.querySelector(".post-text").textContent = copyPostText(set, lengthId).text;
  for (const label of article.querySelectorAll("fieldset label")) {
    const id = label.querySelector("input").value;
    const count = Array.from(copyPostText(set, id).text).length;
    label.querySelector("span").textContent = `${state.data.lengths.find((l) => l.id === id).label} (${count} characters)`;
  }
  for (const anchor of article.querySelectorAll("a.share")) {
    const network = state.data.networks.find((n) => n.id === anchor.dataset.network);
    anchor.href = shareUrl(network, set, lengthId, { code: state.code }, state.data);
  }
}

function buildSet(section, set) {
  const data = state.data;
  const lengths = data.lengths.filter((l) => l.id !== "headline" && set.posts[l.id]);
  const article = el("article", { "id": set.id, "class": "post-set", "aria-labelledby": `${set.id}-title` });
  article.append(el("h4", { id: `${set.id}-title`, tabindex: "-1" }, el("a", { href: `#${set.id}`, text: set.title })));

  const fieldset = el("fieldset", {}, el("legend", { text: "Post length" }));
  for (const length of lengths) {
    const input = el("input", { type: "radio", name: `${set.id}-length`, value: length.id, checked: length.id === "short" });
    fieldset.append(el("label", {}, input, el("span")));
    input.addEventListener("change", () => updateSet(article, set));
  }
  article.append(fieldset);
  article.append(el("p", { class: "post-text" }));

  const status = el("span", { role: "status", class: "copy-status" });
  const copyPost = el("button", { "type": "button", "data-copy": "post", "text": "Copy post" });
  const copyLink = el("button", { "type": "button", "data-copy": "link", "text": "Copy link" });
  const nativeShare = el("button", { type: "button", class: "native-share", hidden: true, text: "Share…" });
  copyPost.addEventListener("click", async () => {
    const ok = await copyText(copyPostText(set, selectedLength(article)).text);
    flash(status, ok ? "Copied" : "Copy failed");
  });
  copyLink.addEventListener("click", async () => {
    const ok = await copyText(copyPostText(set, selectedLength(article)).link);
    flash(status, ok ? "Copied" : "Copy failed");
  });
  if (typeof navigator.share === "function") {
    nativeShare.hidden = false;
    nativeShare.addEventListener("click", async () => {
      const payload = nativeSharePayload(set, selectedLength(article), { code: state.code }, data);
      try {
        if (typeof navigator.canShare === "function") {
          const response = await fetch(`images/${set.id}/og.png`);
          const file = new File([await response.blob()], `${set.id}.png`, { type: "image/png" });
          if (navigator.canShare({ files: [file] })) payload.files = [file];
        }
        await navigator.share(payload);
      } catch {
        // the reader closed the share sheet, or the browser refused the image: nothing to report
      }
    });
  }
  article.append(el("div", { class: "post-actions" }, copyPost, " ", copyLink, " ", nativeShare, " ", status));

  const list = el("ul", { class: "share-links" });
  for (const network of data.networks) {
    const anchor = el("a", {
      "class": "share",
      "data-network": network.id,
      "href": "#",
      "target": "_blank",
      "rel": "noopener noreferrer",
      "aria-label": `${network.label}, opens in a new tab`,
      "text": network.label,
    });
    anchor.addEventListener("click", async () => {
      if (!network.copiesText) return;
      const lengthId = selectedLength(article);
      const link = postLink(set, { code: state.code, source: network.id, medium: network.utmMedium, lengthId }, data);
      const ok = await copyText(renderPost(set, lengthId, { code: state.code, link }, data));
      if (ok) flash(status, `Post text copied. Paste it into ${network.label}.`);
    });
    list.append(el("li", {}, anchor));
  }
  article.append(list);

  const details = el("details", { class: "set-images" }, el("summary", { text: `Images, ${data.imageSizes.length} sizes` }));
  for (const size of data.imageSizes) {
    const src = `images/${set.id}/${size.id}.png`;
    details.append(
      el(
        "figure",
        {},
        el("img", { loading: "lazy", src, width: size.width, height: size.height, alt: `${set.image.headline}. ${set.image.subline}` }),
        el(
          "figcaption",
          { text: `${size.label}, ${size.width} × ${size.height}: ${size.use}. ` },
          el("a", { href: src, download: "", text: "Download" }),
        ),
      ),
    );
  }
  article.append(details);

  refreshers.push(() => updateSet(article, set));
  updateSet(article, set);
  return article;
}

function buildSets(section, container) {
  const setsOf = (productId) => section.sets.filter((s) => s.product === productId);
  for (const product of section.products ?? []) {
    const sets = setsOf(product.id);
    if (sets.length > 1) {
      const group = el("section", { "id": product.id, "class": "post-group", "aria-labelledby": `${product.id}-title` });
      group.append(el("h3", { id: `${product.id}-title`, tabindex: "-1", text: product.name }));
      for (const set of sets) group.append(buildSet(section, set));
      container.append(group);
    } else {
      for (const set of sets) container.append(buildSet(section, set));
    }
  }
  const whole = setsOf("");
  if (whole.length) {
    const group = el("div", { class: "post-group" }, el("h3", { text: `The whole of ${section.name}` }));
    for (const set of whole) group.append(buildSet(section, set));
    container.append(group);
  }
}

// ---------------------------------------------------------------------------------------------
// Brand guides
// ---------------------------------------------------------------------------------------------

function firstFamily(value) {
  return value
    .split(",")[0]
    .trim()
    .replace(/^["']|["']$/g, "");
}

function refreshSwatches(frame, section) {
  const list = frame.querySelector("[data-swatches]");
  list.replaceChildren();
  const computed = getComputedStyle(frame);
  for (const swatch of section.swatches) {
    const chip = el("span", { "class": "swatch-chip", "aria-hidden": "true" });
    chip.style.backgroundColor = `var(${swatch.token})`;
    const value = computed.getPropertyValue(swatch.token).trim();
    list.append(
      el(
        "li",
        {},
        chip,
        el("span", { class: "swatch-text" }, swatch.label, el("code", { text: swatch.token }), el("code", { text: value })),
      ),
    );
  }
}

function refreshSpecimen(frame) {
  const names = {
    "spec-h1": "Heading 1",
    "spec-h2": "Heading 2",
    "spec-body": "Body",
    "spec-caption": "Caption",
  };
  for (const term of frame.querySelectorAll("[data-spec]")) {
    const sample = frame.querySelector(`dd.${term.dataset.spec}`);
    const style = getComputedStyle(sample);
    term.textContent = `${names[term.dataset.spec]}: ${firstFamily(style.fontFamily)}, ${style.fontWeight}, ${style.fontSize}`;
  }
}

function refreshShots(frame, section, theme) {
  const box = frame.querySelector("[data-shots]");
  if (!box.children.length) {
    for (const fragment of section.fragments) {
      box.append(
        el(
          "figure",
          { "data-fragment": fragment.id },
          fragment.width <= 480
            ? el(
                "div",
                { "class": "shot-scroll", "tabindex": "0", "role": "group", "aria-label": `${fragment.alt}, scrolls` },
                el("img", { alt: fragment.alt }),
              )
            : el("img", { alt: fragment.alt }),
          el("figcaption", { text: `${fragment.page}, ${fragment.width} px wide` }),
        ),
      );
    }
  }
  for (const figure of box.children) {
    figure.querySelector("img").src = `brand/shots/${section.id}/${figure.dataset.fragment}-${theme}.png`;
  }
}

function setTheme(guide, frame, section, theme) {
  frame.dataset.theme = theme;
  for (const button of guide.querySelectorAll(".scheme-switch button")) {
    button.setAttribute("aria-pressed", String(button.dataset.scheme === theme));
  }
  refreshShots(frame, section, theme);
  refreshSwatches(frame, section);
  refreshSpecimen(frame);
}

function buildGuide(section, capturedAt) {
  const guide = byId(`${section.id}-brand`);
  const frame = guide.querySelector("[data-brand]");
  const darkButton = guide.querySelector('[data-scheme="dark"]');
  const note = guide.querySelector(".scheme-note");
  if (!section.hasDark) {
    darkButton.disabled = true;
    note.hidden = false;
  }
  for (const button of guide.querySelectorAll(".scheme-switch button")) {
    button.addEventListener("click", () => setTheme(guide, frame, section, button.dataset.scheme));
  }
  guide.querySelector("[data-captured]").textContent = capturedAt ? `Captured ${capturedAt}` : "";
  setTheme(guide, frame, section, "light");
}

// ---------------------------------------------------------------------------------------------
// The affiliate box
// ---------------------------------------------------------------------------------------------

function setStatus(message, kind) {
  const status = byId("passStatus");
  status.textContent = message;
  if (kind) status.dataset.state = kind;
  else delete status.dataset.state;
}

function applyCode(code) {
  state.code = code;
  const query = code ? `?pass=${code}` : "";
  history.replaceState(null, "", `${location.pathname}${query}${location.hash}`);
  for (const refresh of refreshers) refresh();
}

function onCodeInput() {
  const codeEl = byId("passCode");
  const code = normaliseCode(codeEl.value);
  if (isPassCode(code, state.data)) {
    byId("passUrl").value = passUrl(code, state.data);
    applyCode(code);
    setStatus(PASS_OK, "ok");
    return;
  }
  byId("passUrl").value = "";
  if (state.code) applyCode("");
  setStatus("", null);
}

function onCodeChange() {
  const code = normaliseCode(byId("passCode").value);
  if (code && !isPassCode(code, state.data)) setStatus(CODE_ERROR, "error");
}

function onUrlInput() {
  const code = codeFromPassUrl(byId("passUrl").value, state.data);
  if (code) {
    byId("passCode").value = code;
    applyCode(code);
    setStatus(PASS_OK, "ok");
    return;
  }
  byId("passCode").value = "";
  if (state.code) applyCode("");
  setStatus("", null);
}

function onUrlChange() {
  const raw = byId("passUrl").value.trim();
  if (raw && !codeFromPassUrl(raw, state.data)) setStatus(URL_ERROR, "error");
}

function clearPass() {
  byId("passCode").value = "";
  byId("passUrl").value = "";
  applyCode("");
  setStatus("", null);
  byId("passCode").focus();
}

function bindPassBox() {
  byId("passCode").addEventListener("input", onCodeInput);
  byId("passCode").addEventListener("change", onCodeChange);
  byId("passUrl").addEventListener("input", onUrlInput);
  byId("passUrl").addEventListener("change", onUrlChange);
  byId("passClear").addEventListener("click", clearPass);
  const fromQuery = normaliseCode(new URLSearchParams(location.search).get("pass"));
  if (fromQuery) {
    byId("passCode").value = fromQuery;
    onCodeInput();
    if (!state.code) {
      applyCode("");
      onCodeChange();
    }
  }
}

function bindCampaigns() {
  const button = byId("postButton");
  const list = byId("campaignList");
  const campaigns = runningCampaigns(state.data, new Date());
  if (!campaigns.length) return;
  for (const campaign of campaigns) {
    const link = el("a", { href: `#${campaign.target}`, text: campaign.label });
    link.addEventListener("click", (event) => {
      event.preventDefault();
      close(false);
      if (location.hash === `#${campaign.target}`) goToHash();
      else location.hash = campaign.target;
    });
    list.append(el("li", {}, link));
  }
  button.hidden = false;
  function close(returnFocus) {
    list.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (returnFocus) button.focus();
  }
  button.addEventListener("click", () => {
    const open = list.hidden;
    list.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (open) list.querySelector("a").focus();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !list.hidden) close(true);
  });
}

// ---------------------------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------------------------

function goToHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  const target = id ? byId(id) : null;
  if (!target) return;
  target.scrollIntoView();
  const heading = target.matches("h1, h2, h3, h4") ? target : target.querySelector("h2, h3, h4");
  if (heading) heading.focus({ preventScroll: true });
}

// ---------------------------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------------------------

async function start() {
  const main = byId("mainContent");
  let manifest = null;
  try {
    const response = await fetch("marketing.json");
    if (!response.ok) throw new Error(String(response.status));
    state.data = await response.json();
  } catch {
    main.append(el("p", { class: "load-error", role: "alert", text: "The posts could not load. Reload the page." }));
    return;
  }
  try {
    const response = await fetch("brand/shots/manifest.json");
    if (response.ok) manifest = await response.json();
  } catch {
    manifest = null;
  }
  for (const section of state.data.sections) {
    const root = byId(section.id);
    root.querySelector("[data-summary]").textContent = section.summary;
    buildGuide(section, manifest?.capturedAt ?? "");
    buildSets(section, root.querySelector("[data-sets]"));
  }
  bindPassBox();
  bindCampaigns();
  window.addEventListener("hashchange", goToHash);
  goToHash();
}

start();
