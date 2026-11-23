// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Minimal TOML parser for configuration files
// Supports: key = value, [section], [[array-of-tables]] (including a dotted path such as
// [[bundles.prices]], which nests onto the last entry of the array its parent path names),
// strings, multi-line strings ("""), numbers, arrays (on one line or across lines)
(function () {
  // Walk a dotted path's parent segments (all but the last), descending into the last
  // entry of any array-of-tables found along the way. [[bundles.prices]] resolves "bundles"
  // to the array res.bundles, then returns its last entry, so "prices" attaches to that one
  // bundle rather than becoming a top-level "bundles.prices" key.
  function resolveParent(root, pathParts) {
    let node = root;
    for (let idx = 0; idx < pathParts.length - 1; idx++) {
      const part = pathParts[idx];
      if (Array.isArray(node[part])) {
        node = node[part][node[part].length - 1];
      } else {
        if (!node[part]) node[part] = {};
        node = node[part];
      }
    }
    return node;
  }

  const TOML = {
    parse: function (src) {
      const res = {};
      let currentSection = res;
      const lines = src.split(/\r?\n/);
      let i = 0;

      while (i < lines.length) {
        const line = lines[i].trim();

        // Skip empty lines and comments
        if (!line || line.startsWith("#")) {
          i++;
          continue;
        }

        // Array of tables: [[section]] or [[parent.section]]
        if (line.startsWith("[[")) {
          const sectionName = line.substring(2, line.lastIndexOf("]]")).trim();
          const pathParts = sectionName.split(".");
          const lastKey = pathParts[pathParts.length - 1];
          const parent = resolveParent(res, pathParts);
          if (!parent[lastKey]) parent[lastKey] = [];
          const newEntry = {};
          parent[lastKey].push(newEntry);
          currentSection = newEntry;
          i++;
          continue;
        }

        // Table: [section]
        if (line.startsWith("[")) {
          const sectionName = line.substring(1, line.lastIndexOf("]")).trim();
          res[sectionName] = {};
          currentSection = res[sectionName];
          i++;
          continue;
        }

        // Key-value pair
        if (line.indexOf("=") !== -1) {
          const eqIdx = line.indexOf("=");
          const key = line.substring(0, eqIdx).trim();
          const value = line.substring(eqIdx + 1).trim();

          // Check for multi-line string start
          if (value.startsWith('"""')) {
            // Multi-line string
            const multiLineValue = value.substring(3);
            if (multiLineValue.endsWith('"""')) {
              // Single line with """..."""
              currentSection[key] = multiLineValue.substring(0, multiLineValue.length - 3);
            } else {
              // Multi-line: collect until closing """
              const parts = [multiLineValue];
              i++;
              while (i < lines.length) {
                const nextLine = lines[i];
                const trimmed = nextLine.trimEnd();
                if (trimmed.endsWith('"""')) {
                  parts.push(trimmed.substring(0, trimmed.length - 3));
                  break;
                }
                parts.push(nextLine);
                i++;
              }
              currentSection[key] = parts.join("\n").trim();
            }
          } else if (value.startsWith("[") && !value.endsWith("]")) {
            const collected = collectArrayLines(lines, i, value);
            currentSection[key] = parseValue(collected.text);
            i = collected.lastIndex;
          } else {
            currentSection[key] = parseValue(value);
          }
        }

        i++;
      }

      return res;
    },
  };

  // A multi-line array: its opening line's value, then each line after it, skipping comments, up
  // to the line that closes it. Returns the joined text and the index of that closing line.
  function collectArrayLines(lines, openingIndex, openingValue) {
    const parts = [openingValue];
    let index = openingIndex + 1;
    while (index < lines.length) {
      const line = lines[index].trim();
      if (line && !line.startsWith("#")) parts.push(line);
      if (line.endsWith("]")) break;
      index++;
    }
    return { text: parts.join(" "), lastIndex: index };
  }

  // The items of an array's inner text, split at each comma that is neither inside a string nor
  // inside an array within the array.
  function splitArrayItems(inner) {
    const items = [];
    let depth = 0;
    let inString = false;
    let start = 0;
    for (let index = 0; index < inner.length; index++) {
      const character = inner[index];
      if (inString) {
        if (character === "\\") index++;
        else if (character === '"') inString = false;
      } else if (character === '"') inString = true;
      else if (character === "[") depth++;
      else if (character === "]") depth--;
      else if (character === "," && depth === 0) {
        items.push(inner.substring(start, index));
        start = index + 1;
      }
    }
    items.push(inner.substring(start));
    return items;
  }

  function parseValue(val) {
    val = val.trim();
    // Double-quoted string
    if (val.startsWith('"') && val.endsWith('"')) {
      return val.substring(1, val.length - 1);
    }
    // Array
    if (val.startsWith("[") && val.endsWith("]")) {
      const inner = val.substring(1, val.length - 1).trim();
      if (!inner) return [];
      return splitArrayItems(inner)
        .map((v) => v.trim())
        .filter((v) => v !== "")
        .map((v) => parseValue(v));
    }
    // Boolean
    if (val === "true") return true;
    if (val === "false") return false;
    // Number
    if (!isNaN(val) && val !== "") return Number(val);
    return val;
  }

  window.TOML = TOML;
})();
