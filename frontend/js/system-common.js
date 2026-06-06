/** Shared helpers for system detail pages. */

/**
 * Convert snake_case key to readable label.
 * @param {string} key
 * @returns {string}
 */
function formatStatKey(key) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Flatten nested object into key-value pairs for table display.
 * @param {object} obj
 * @param {string} [prefix]
 * @returns {[string, string|number][]}
 */
function flattenStatObject(obj, prefix = "") {
  if (obj === null || obj === undefined) return [[prefix, "—"]];
  if (typeof obj !== "object") return [[prefix, obj]];
  if (Array.isArray(obj)) {
    return obj.flatMap((v, i) => [[prefix ? `${prefix} ${i}` : String(i), v]]);
  }
  const rows = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix} ${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      rows.push(...flattenStatObject(v, key));
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => rows.push([`${key} ${i}`, item]));
    } else {
      rows.push([key, v ?? "—"]);
    }
  }
  return rows;
}

/**
 * Render a grouped stat section table.
 * @param {string} title
 * @param {[string, string|number][]} rows
 * @returns {string}
 */
function renderStatSection(title, rows) {
  const body = rows
    .map(([k, v]) => `<tr><td>${formatStatKey(String(k))}</td><td>${v ?? "—"}</td></tr>`)
    .join("");
  return `
    <section class="stat-section">
      <div class="stat-section-header">${title}</div>
      <table class="stat-table">${body}</table>
    </section>`;
}

/**
 * Render stat sections from a grouped object.
 * @param {object} grouped
 * @param {object<string, string>} labels
 * @returns {string}
 */
function renderGroupedSections(grouped, labels) {
  return Object.entries(grouped)
    .map(([key, value]) => renderStatSection(labels[key] || formatStatKey(key), flattenStatObject(value)))
    .join("");
}
