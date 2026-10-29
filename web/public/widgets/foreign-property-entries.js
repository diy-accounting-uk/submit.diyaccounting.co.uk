// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/widgets/foreign-property-entries.js
// The list of entries on a foreign property page. HMRC takes one entry for each country (2025-26
// and before) or for each property (2026-27 on) and refuses a repeat.
//   mode "country": one fieldset for each country, with a country select, "Remove", and an
//     "Add another country" button. A country chosen in one fieldset is not offered in the others.
//   mode "property": one fieldset for each property from HMRC's property list, headed
//     "<name> (<country>)", with no select and no Remove. The page sets the list with setProperties.
// renderBody(container, prefix) fills an entry's body; prefix is unique to the entry on the page.
// Needs country-codes.js.

(function () {
  "use strict";

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    node.append(...children);
    return node;
  }

  function create(container, { idPrefix, mode = "country", renderBody }) {
    let nextEntry = 1;
    const list = el("div", { className: "foreign-property-entry-list" });
    const addButton = mode === "country" ? el("button", { type: "button", id: `${idPrefix}-add`, className: "secondary-button" }) : null;
    container.replaceChildren(el("div", { className: "foreign-property-entries" }, addButton ? [list, addButton] : [list]));

    const fieldsets = () => Array.from(list.children);
    const selectOf = (fieldset) => fieldset.querySelector("select");

    function renumber() {
      fieldsets().forEach((fieldset, index) => {
        if (mode !== "country") return;
        fieldset.querySelector("legend").textContent = `Country ${index + 1}`;
        fieldset.querySelector("button.foreign-property-remove").setAttribute("aria-label", `Remove country ${index + 1}`);
      });
      if (addButton) addButton.textContent = list.children.length === 0 ? "Add a country" : "Add another country";
    }

    // The countries the select may hold: all, less those another select holds.
    function optionsFor(chosen, taken) {
      return window.countryCodes
        .countriesByName()
        .filter(({ code }) => !taken.has(code) || code === chosen)
        .map(({ code, name }) => el("option", { value: code, textContent: name }));
    }

    // Each select offers the countries no other select holds.
    function refreshOptions() {
      const selects = fieldsets().map(selectOf);
      for (const select of selects) {
        const taken = new Set();
        for (const other of selects) {
          if (other !== select && other.value) taken.add(other.value);
        }
        const chosen = select.value;
        select.replaceChildren(el("option", { value: "", textContent: "Choose the country or territory" }), ...optionsFor(chosen, taken));
        select.value = chosen;
      }
    }

    function addEntryShell(legendText) {
      const entry = nextEntry++;
      const prefix = `${idPrefix}-${entry}`;
      const body = el("div", { className: "foreign-property-entry-body" });
      const fieldset = el("fieldset", { className: "form-group foreign-property-entry", id: prefix }, [
        el("legend", { textContent: legendText }),
      ]);
      fieldset.dataset.prefix = prefix;
      return { prefix, body, fieldset };
    }

    function addCountry({ countryCode = "", focus = false } = {}) {
      const { prefix, body, fieldset } = addEntryShell("Country");
      const selectId = `${prefix}-country`;
      const hint = el("p", {
        id: `${selectId}-hint`,
        className: "hint",
        textContent: "Put every property in this country in this one entry.",
      });
      const select = el("select", { id: selectId, name: selectId, required: true });
      select.setAttribute("aria-describedby", hint.id);
      const remove = el("button", { type: "button", className: "secondary-button foreign-property-remove", textContent: "Remove" });
      fieldset.append(
        el("div", { className: "form-group" }, [el("label", { htmlFor: selectId, textContent: "Country or territory" }), hint, select]),
        body,
        remove,
      );
      list.append(fieldset);
      refreshOptions();
      if (countryCode) select.value = countryCode;
      renderBody?.(body, prefix);
      select.addEventListener("change", refreshOptions);
      remove.addEventListener("click", () => {
        fieldset.remove();
        renumber();
        refreshOptions();
        addButton.focus();
      });
      renumber();
      refreshOptions();
      if (focus) select.focus();
      return prefix;
    }

    function setProperties(properties) {
      list.replaceChildren();
      properties.forEach((property) => {
        const heading = `${property.propertyName} (${window.countryCodes.countryName(property.countryCode)})`;
        const { prefix, body, fieldset } = addEntryShell(heading);
        fieldset.dataset.propertyId = property.propertyId;
        fieldset.dataset.countryCode = property.countryCode;
        fieldset.append(body);
        list.append(fieldset);
        renderBody?.(body, prefix);
      });
    }

    // Every entry as { prefix, key, element }. key is the country code or the property id.
    function entries() {
      return fieldsets().map((fieldset) => ({
        prefix: fieldset.dataset.prefix,
        key: mode === "country" ? selectOf(fieldset).value : fieldset.dataset.propertyId,
        element: fieldset,
      }));
    }

    // One error for each country entry with no country: { input, message }.
    function validate() {
      if (mode !== "country") return [];
      return fieldsets()
        .map((fieldset, index) => ({ input: selectOf(fieldset), message: `Country ${index + 1}: choose the country or territory` }))
        .filter(({ input }) => input.value === "");
    }

    function clear() {
      list.replaceChildren();
      renumber();
    }

    addButton?.addEventListener("click", () => addCountry({ focus: true }));
    renumber();

    return { addCountry, setProperties, entries, validate, clear };
  }

  window.foreignPropertyEntries = { create };
})();
