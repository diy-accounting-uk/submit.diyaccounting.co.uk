// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Minimal TOML parser for configuration files
// Supports: key = value, [section], [[array-of-tables]], strings, multi-line strings ("""), numbers, arrays
(function () {
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

        // Array of tables: [[section]]
        if (line.startsWith("[[")) {
          const sectionName = line.substring(2, line.lastIndexOf("]]")).trim();
          if (!res[sectionName]) res[sectionName] = [];
          const newEntry = {};
          res[sectionName].push(newEntry);
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
          } else {
            currentSection[key] = parseValue(value);
          }
        }

        i++;
      }

      return res;
    },
  };

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
      return inner.split(",").map((v) => parseValue(v.trim()));
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
