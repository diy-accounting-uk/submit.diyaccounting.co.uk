// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// The guide: one twisty per journey. A journey with a recorded video takes its steps (a frame, a
// headline and a caption each) from that video's walkthrough in videos/publish.json; a journey
// without frames lists text steps. A frame opens full size in the lightbox.

const MANIFEST_URL = "videos/publish.json";

const GROUPS = [
  {
    title: "VAT",
    intro: "Check what is due, file the return and look up what HMRC holds.",
    journeys: [
      { video: "hmrc-authorise" },
      { video: "view-obligations" },
      { video: "submit-return" },
      { video: "vat-from-books" },
      { video: "vat-hmrc-assist" },
      { video: "view-return" },
      { video: "view-liabilities" },
      { video: "view-payments" },
      { video: "view-penalties" },
    ],
  },
  {
    title: "Income Tax (Self Assessment)",
    intro: "Quarterly updates, the year-end submission, losses and the tax calculation.",
    journeys: [
      { video: "itsa-business-details" },
      { video: "itsa-quarterly-update" },
      { video: "itsa-quarterly-from-books" },
      { video: "itsa-self-employment-amend" },
      { video: "itsa-uk-property-year" },
      { video: "itsa-annual-from-book" },
      { video: "itsa-loss-claims" },
      { video: "itsa-foreign-property-losses" },
      { video: "itsa-carry-back-adjustments" },
      { video: "itsa-in-year-estimate" },
      { video: "itsa-year-part" },
      { video: "itsa-year" },
    ],
  },
  {
    title: "Companies House",
    intro: "Look up a company, change its details and file with the registry.",
    journeys: [
      { video: "company-lookup" },
      { video: "change-registered-office" },
      { video: "change-registered-email" },
      { video: "file-confirmation-statement" },
      { video: "file-micro-entity-accounts" },
      { video: "file-small-company-accounts" },
      { video: "file-psc-verification-statement" },
    ],
  },
  {
    title: "Company Tax Return (CT600)",
    intro: "File the corporation tax return from the company's book.",
    journeys: [{ video: "file-company-tax-return-book" }, { video: "file-company-tax-return-typed" }],
  },
  {
    title: "Receipts",
    intro: "Find a submission record again.",
    journeys: [{ video: "my-receipts" }],
  },
  {
    title: "Passes",
    intro: "Give a pass to someone else.",
    journeys: [{ video: "generate-pass-digital" }, { video: "generate-pass-physical" }],
  },
  {
    title: "Bundles and your account",
    intro: "Sign in, see what an activity costs and manage a subscription.",
    journeys: [{ video: "sign-in" }, { video: "tokens" }, { video: "subscription-management" }, { video: "bundles" }, { video: "tour" }],
  },
  {
    title: "Your books (diya-gl)",
    intro: "Keep sales and purchases in a book and see your profit.",
    journeys: [
      { video: "accounting-diya-gl-profit" },
      { video: "accounting-spreadsheet-profit" },
      {
        id: "diya-gl-storage",
        title: "Save your diya-gl books",
        steps: [
          ["Keep your book in diya-gl", "Write your sales and purchases to a diya-gl book."],
          ["Save it to your account", "With the Resident bundle, the book saves to your account from diya-gl."],
          ["Use it in a filing", "Load the saved book into a VAT return, a quarterly update or a Company Tax Return."],
        ],
      },
    ],
  },
  {
    title: "MCP servers",
    intro: "Connect an assistant to your books and submissions.",
    journeys: [{ video: "mcp-hosted" }, { video: "mcp-diya-gl" }, { video: "mcp-docker" }, { video: "mcp-cli" }],
  },
];

function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

// "DIY Accounting Submit: view your VAT obligations (sandbox example)" becomes the title and a note.
function splitTitle(raw) {
  const colon = raw.indexOf(":");
  let title = (colon === -1 ? raw : raw.slice(colon + 1)).trim();
  let note = "";
  const open = title.lastIndexOf("(");
  if (open !== -1 && title.endsWith(")")) {
    note = title.slice(open + 1, -1);
    title = title.slice(0, open).trim();
  }
  return { title: title.charAt(0).toUpperCase() + title.slice(1), note };
}

function frameStep(scene) {
  const item = el("li", "guide-step");
  item.append(el("h4", "guide-step-title", scene.headline));
  const open = el("button", "guide-thumb");
  open.type = "button";
  open.dataset.full = scene.full;
  open.setAttribute("aria-label", `View full size: ${scene.headline}`);
  const image = document.createElement("img");
  image.src = scene.thumb;
  image.alt = `${scene.headline}: ${scene.caption}`;
  image.loading = "lazy";
  open.append(image);
  item.append(open, el("p", "guide-caption", scene.caption));
  return item;
}

function textStep([headline, caption]) {
  const item = el("li", "guide-step");
  item.append(el("h4", "guide-step-title", headline), el("p", "guide-caption", caption));
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

function render(container, videos) {
  const byId = new Map(videos.map((video) => [video.id, video]));
  for (const group of GROUPS) {
    const section = el("section", "guide-group");
    section.append(el("h2", "", group.title), el("p", "guide-group-intro", group.intro));
    for (const journey of group.journeys) {
      if (journey.video) {
        const video = byId.get(journey.video);
        if (!video || !Array.isArray(video.walkthrough) || video.walkthrough.length === 0) continue;
        const { title, note } = splitTitle(video.title);
        section.append(journeyElement(video.id, title, note, video.walkthrough.map(frameStep)));
      } else {
        section.append(journeyElement(journey.id, journey.title, "", journey.steps.map(textStep)));
      }
    }
    container.append(section);
  }
}

function openFromHash() {
  const target = window.location.hash ? document.getElementById(decodeURIComponent(window.location.hash.slice(1))) : null;
  if (target && target.tagName === "DETAILS") {
    target.open = true;
    target.scrollIntoView();
  }
}

function setUpLightbox(container) {
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightbox-image");
  const closeControl = lightbox.querySelector(".lightbox-close");
  let opener = null;
  lightbox.setAttribute("role", "dialog");
  lightbox.setAttribute("aria-modal", "true");
  lightbox.setAttribute("aria-label", "Full size screenshot");
  closeControl.setAttribute("role", "button");
  closeControl.setAttribute("aria-label", "Close full size screenshot");
  closeControl.tabIndex = 0;
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
    lightboxImg.src = thumb.dataset.full;
    lightboxImg.alt = thumb.querySelector("img").alt;
    lightbox.classList.add("active");
    document.body.style.overflow = "hidden";
    closeControl.focus();
  });
  lightbox.addEventListener("click", close);
  document.addEventListener("keydown", (event) => {
    if (!lightbox.classList.contains("active")) return;
    if (event.key === "Escape") close();
    else if (event.key === "Tab") {
      event.preventDefault();
      closeControl.focus();
    } else if ((event.key === "Enter" || event.key === " ") && document.activeElement === closeControl) {
      event.preventDefault();
      close();
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
    render(container, manifest.videos);
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
  } catch (error) {
    container.append(el("p", "", "The guide could not load its steps. Reload the page to try again."));
    console.error("guide: could not load", MANIFEST_URL, error);
  }
}

init();
