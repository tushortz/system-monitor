/** Details page — all GPU info grouped by category. */

let currentGpu = 0;

const SECTION_LABELS = {
  identity: "Identity",
  performance: "Performance",
  memory: "Memory",
  power: "Power",
  pcie: "PCIe",
  reliability: "Reliability",
  processes: "Processes",
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  renderNav("gpu", "details");
  try {
    const health = await fetchHealth();
    updateStatus(health);
    const gpuData = await fetchGpus();
    currentGpu = renderGpuSelector(gpuData.gpus, onGpuChange);
    document.getElementById("refresh-btn").addEventListener("click", () => loadData(currentGpu));
    await loadData(currentGpu);
    startPolling(() => loadData(currentGpu));
  } catch (err) {
    document.getElementById("stat-sections").innerHTML =
      `<div class="alert alert-error">${err.message}</div>`;
  }
}

function onGpuChange(index) {
  currentGpu = index;
  loadData(index);
}

async function loadData(index) {
  try {
    const [grouped, driver] = await Promise.all([
      fetchGroupedStats(index),
      fetchDriver(),
    ]);
    renderDriver(driver);
    renderSections(grouped);
  } catch (err) {
    showError(document.getElementById("stat-sections"), err.message);
  }
}

function renderDriver(driver) {
  const section = document.getElementById("driver-info");
  const table = document.getElementById("driver-table");
  if (!driver || !Object.keys(driver).length) {
    section.classList.add("hidden");
    return;
  }
  section.classList.remove("hidden");
  table.innerHTML = Object.entries(driver)
    .map(([k, v]) => `<tr><td>${formatKey(k)}</td><td>${v ?? "—"}</td></tr>`)
    .join("");
}

function renderSections(data) {
  const container = document.getElementById("stat-sections");
  const skip = new Set(["index"]);
  const html = Object.entries(data)
    .filter(([key]) => !skip.has(key))
    .map(([key, value]) => {
      const title = SECTION_LABELS[key] || formatKey(key);
      if (key === "processes") {
        return renderProcessSection(title, value);
      }
      return renderStatSection(title, flattenObject(value));
    })
    .join("");
  container.innerHTML = html;
}

function renderStatSection(title, rows) {
  const body = rows
    .map(([k, v]) => `<tr><td>${formatKey(k)}</td><td>${v ?? "—"}</td></tr>`)
    .join("");
  return `
    <section class="stat-section">
      <div class="stat-section-header">${title}</div>
      <table class="stat-table">${body}</table>
    </section>`;
}

function renderProcessSection(title, processes) {
  if (!processes?.length) {
    return renderStatSection(title, [["Status", "No active processes"]]);
  }
  const rows = processes.flatMap((p, i) => [
    [`Process ${i + 1} — PID`, p.pid],
    [`Process ${i + 1} — Type`, p.type],
    [`Process ${i + 1} — Memory`, `${p.memory_mb} MB`],
  ]);
  return renderStatSection(title, rows);
}

/**
 * Flatten nested object into key-value pairs for table display.
 * @param {object} obj
 * @param {string} [prefix]
 * @returns {[string, string|number][]}
 */
function flattenObject(obj, prefix = "") {
  if (!obj || typeof obj !== "object") return [[prefix, obj]];
  const rows = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix} ${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      rows.push(...flattenObject(v, key));
    } else {
      rows.push([key, v]);
    }
  }
  return rows;
}

/**
 * Convert snake_case key to readable label.
 * @param {string} key
 * @returns {string}
 */
function formatKey(key) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
