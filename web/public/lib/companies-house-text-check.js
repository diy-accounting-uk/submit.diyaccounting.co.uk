// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/companies-house-text-check.js
// The page half of the gateway's character check, for every Companies House form page that files
// through the XML gateway. Before a form on the page goes on, each text box the reader can see is
// checked against the characters the gateway's name and address pattern takes
// (companies-house-gateway-text.js); a box with any other character stops the form, and the page
// says, in its own language, which box and which characters, never the whole value. The route
// makes the same check. A box whose value the gateway checks against another pattern says so with
// data-gateway-text="off"; the developer-mode Gov-Test-Scenario box is never sent as form text.

import { namedCharacters, refusedCharacters } from "./companies-house-gateway-text.js";

function siteText(id, english, values) {
  if (window.siteText) return window.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

const TEXT_BOXES = 'input[type="text"], input:not([type]), textarea';

// The words a reader knows a box by: its label, after the legend of the group it is in.
function boxName(box) {
  const label = box.id ? document.querySelector(`label[for="${CSS.escape(box.id)}"]`) : null;
  const labelText = (label?.textContent || box.name || box.id).replace(/\s+/g, " ").trim();
  const legend = box.closest("fieldset")?.querySelector("legend");
  const legendText = legend ? legend.textContent.replace(/\s+/g, " ").trim() : "";
  return legendText && legendText !== labelText ? `${legendText}: ${labelText}` : labelText;
}

const checked = (box) => box.id !== "govTestScenario" && box.dataset.gatewayText !== "off" && box.offsetParent !== null;

/**
 * The reason a form's text boxes cannot go to the gateway, in the page's language, or null.
 * @param {HTMLFormElement} form
 * @returns {string|null}
 */
export function textBoxProblem(form) {
  for (const box of form.querySelectorAll(TEXT_BOXES)) {
    if (!checked(box)) continue;
    const refused = refusedCharacters(box.value);
    if (refused.length) {
      return siteText("ch.form.gateway-text", "{field} has characters Companies House does not accept: {characters}", {
        field: boxName(box),
        characters: namedCharacters(refused, siteText("ch.form.line-break", "a line break")).join(" "),
      });
    }
  }
  return null;
}

/**
 * The reason one value cannot go to the gateway, in the page's language, or null: for text a page
 * sends that no box holds, such as a name read from the register.
 * @param {string} field - the words the reason names the value by
 * @param {string|undefined|null} value
 * @returns {string|null}
 */
export function valueProblem(field, value) {
  const refused = refusedCharacters(value);
  if (!refused.length) return null;
  return siteText("ch.form.gateway-text", "{field} has characters Companies House does not accept: {characters}", {
    field,
    characters: refused.join(" "),
  });
}

window.companiesHouseTextCheck = { valueProblem };

// Runs before the page's own handler, which listens on the form itself.
document.addEventListener(
  "submit",
  (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.closest("main")) return;
    const problem = textBoxProblem(form);
    if (!problem) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (window.showStatus) window.showStatus(problem, "error");
  },
  true,
);
