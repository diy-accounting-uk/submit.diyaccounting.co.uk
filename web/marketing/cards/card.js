// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// card.js: fills the card for ?set=<set id>&size=<size id> from ../marketing.json, shrinks the
// headline until it fits, and sets data-ready on the body for the capture.

const params = new URLSearchParams(location.search);
const data = await (await fetch("../marketing.json")).json();
const section = data.sections.find((s) => s.sets.some((set) => set.id === params.get("set")));
const set = section.sets.find((s) => s.id === params.get("set"));
const size = data.imageSizes.find((s) => s.id === params.get("size"));

function shapeOf({ width, height }) {
  const ratio = width / height;
  if (ratio >= 3) return "banner";
  if (ratio <= 0.4) return "tower";
  if (ratio >= 0.8 && ratio <= 1.25) return "square";
  if (ratio < 0.8) return "tall";
  return "wide";
}

const body = document.body;
body.className = `brand-${section.brand} card card--${shapeOf(size)}`;
body.style.setProperty("--u", `${Math.min(size.width, size.height) / 100}px`);

const markName = section.id === "limited" ? section.name : `${section.name}™`;
document.getElementById("cardWordmark").textContent = markName;
document.getElementById("cardHeadline").textContent = set.image.headline;
document.getElementById("cardSubline").textContent = set.image.subline;
document.getElementById("cardHost").textContent = new URL(section.site).hostname;

await document.fonts.ready;

const headline = document.getElementById("cardHeadline");
let fontPx = parseFloat(getComputedStyle(headline).fontSize);
const overflows = () => headline.scrollHeight > headline.clientHeight + 1 || headline.scrollWidth > headline.clientWidth + 1;
while (overflows() && fontPx > 4) {
  fontPx *= 0.96;
  headline.style.fontSize = `${fontPx}px`;
}

body.dataset.ready = "true";
