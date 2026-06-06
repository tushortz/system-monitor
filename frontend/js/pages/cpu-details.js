/** CPU details page — all CPU info grouped by category. */

const SECTION_LABELS = {
  identity: "Identity",
  utilization: "Utilization",
  frequency: "Frequency",
  memory: "Memory",
  swap: "Swap",
  load: "Load Average",
  temperature: "Temperature",
  system: "System",
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  renderNav("cpu", "cpu-details");
  try {
    const health = await fetchHealth();
    updateStatus(health);
    document.getElementById("refresh-btn").addEventListener("click", loadData);
    await loadData();
    startPolling(loadData);
  } catch (err) {
    document.getElementById("stat-sections").innerHTML =
      `<div class="alert alert-error">${err.message}</div>`;
  }
}

async function loadData() {
  try {
    const grouped = await fetchCpuGrouped();
    renderSections(grouped);
  } catch (err) {
    showError(document.getElementById("stat-sections"), err.message);
  }
}

function renderSections(data) {
  const container = document.getElementById("stat-sections");
  const html = Object.entries(data)
    .map(([key, value]) => {
      const title = SECTION_LABELS[key] || formatKey(key);
      if (key === "utilization" && value.per_core_pct) {
        return renderUtilizationSection(title, value);
      }
      return renderStatSection(title, flattenObject(value));
    })
    .join("");
  container.innerHTML = html;
}

function renderUtilizationSection(title, util) {
  const coreRows = (util.per_core_pct || []).map((pct, i) => [
    `Core ${i} Utilization`,
    `${pct}%`,
  ]);
  const rows = [
    ["Overall Utilization", `${util.overall_pct}%`],
    ...coreRows,
    ...flattenObject(util.times_pct || {}),
  ];
  return renderStatSection(title, rows);
}

function renderStatSection(title, rows) {
  const body = rows
    .map(([k, v]) => `<tr><td>${formatKey(String(k))}</td><td>${v ?? "—"}</td></tr>`)
    .join("");
  return `
    <section class="stat-section">
      <div class="stat-section-header">${title}</div>
      <table class="stat-table">${body}</table>
    </section>`;
}

function flattenObject(obj, prefix = "") {
  if (!obj || typeof obj !== "object") return [[prefix, obj]];
  if (Array.isArray(obj)) {
    return obj.flatMap((v, i) => [[prefix ? `${prefix} ${i}` : String(i), v]]);
  }
  const rows = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix} ${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      rows.push(...flattenObject(v, key));
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => rows.push([`${key} ${i}`, item]));
    } else {
      rows.push([key, v]);
    }
  }
  return rows;
}

function formatKey(key) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
