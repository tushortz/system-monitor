/** Shared UI utilities and navigation. */

const NAV_TABS = [
  {
    id: "overview",
    label: "Overview",
    href: "/",
    sub: [],
  },
  {
    id: "cpu",
    label: "CPU",
    href: "/cpu",
    sub: [
      { href: "/cpu", label: "Performance", page: "cpu" },
      { href: "/cpu-memory", label: "Memory", page: "cpu-memory" },
      { href: "/cpu-processes", label: "Processes", page: "cpu-processes" },
      { href: "/cpu-details", label: "Details", page: "cpu-details" },
    ],
  },
  {
    id: "system",
    label: "System",
    href: "/system",
    sub: [
      { href: "/system", label: "Overview", page: "system" },
      { href: "/system-hardware", label: "Hardware", page: "system-hardware" },
      { href: "/system-battery", label: "Battery", page: "system-battery" },
      { href: "/system-storage", label: "Storage", page: "system-storage" },
      { href: "/system-network", label: "Network", page: "system-network" },
    ],
  },
  {
    id: "gpu",
    label: "GPU",
    href: "/performance",
    sub: [
      { href: "/performance", label: "Performance", page: "performance" },
      { href: "/memory", label: "Memory", page: "memory" },
      { href: "/processes", label: "Processes", page: "processes" },
      { href: "/details", label: "Details", page: "details" },
    ],
  },
];

const GPU_STORAGE_KEY = "gpu-monitor-selected-gpu";

/**
 * Render top tabs and feature sub-navigation.
 * @param {string} activeTab - Active tab id (overview, cpu, system, gpu)
 * @param {string} activePage - Active page identifier
 */
function renderNav(activeTab, activePage) {
  const nav = document.getElementById("nav");
  if (!nav) return;

  const tabs = NAV_TABS.map(
    (tab) =>
      `<a href="${tab.href}" class="nav-tab${tab.id === activeTab ? " active" : ""}">${tab.label}</a>`
  ).join("");

  const currentTab = NAV_TABS.find((tab) => tab.id === activeTab);
  const subItems = currentTab?.sub ?? [];
  const subNavHtml = subItems.length
    ? `<div class="sub-nav-wrap">
        <nav class="sub-nav" aria-label="${currentTab.label} features">
          ${subItems
            .map(
              (item) =>
                `<a href="${item.href}" class="sub-nav-link${item.page === activePage ? " active" : ""}">${item.label}</a>`
            )
            .join("")}
        </nav>
      </div>`
    : "";

  nav.className = "site-header";
  nav.innerHTML = `
    <div class="nav">
      <div class="nav-inner">
        <div class="nav-brand">GPU &amp; CPU Monitor</div>
        <nav class="nav-tabs" aria-label="Main navigation">${tabs}</nav>
        <div class="nav-status">
          <span class="status-dot" id="status-dot"></span>
          <span id="status-text">Connecting…</span>
        </div>
      </div>
    </div>
    ${subNavHtml}`;
}

/**
 * Update connection status badge.
 * @param {object} health - Health API response
 */
function updateStatus(health) {
  const dot = document.getElementById("status-dot");
  const text = document.getElementById("status-text");
  if (!dot || !text) return;

  const isDemo = health.mode === "demo";
  dot.classList.toggle("demo", isDemo);
  const gpuLabel = isDemo ? "GPU demo" : "GPU live";
  const platformLabel = formatPlatform(health.platform);
  text.textContent = `${gpuLabel} · ${health.gpu_count} GPU · ${health.cpu_cores} CPU · ${platformLabel}`;
}

/**
 * Format OS platform name for display.
 * @param {string} platform
 * @returns {string}
 */
function formatPlatform(platform) {
  const labels = { Darwin: "macOS", Windows: "Windows", Linux: "Linux" };
  return labels[platform] || platform || "System";
}

/**
 * Get persisted GPU index from localStorage.
 * @returns {number}
 */
function getSelectedGpu() {
  const stored = localStorage.getItem(GPU_STORAGE_KEY);
  return stored !== null ? parseInt(stored, 10) : 0;
}

/**
 * Persist GPU selection.
 * @param {number} index
 */
function setSelectedGpu(index) {
  localStorage.setItem(GPU_STORAGE_KEY, String(index));
}

/**
 * Build GPU selector dropdown.
 * @param {object[]} gpus - GPU summary list
 * @param {function(number): void} onChange - Change handler
 */
function renderGpuSelector(gpus, onChange) {
  const container = document.getElementById("gpu-selector");
  if (!container) return;

  const selected = getSelectedGpu();
  const safeIndex = selected < gpus.length ? selected : 0;

  const options = gpus
    .map(
      (gpu, i) =>
        `<option value="${i}"${i === safeIndex ? " selected" : ""}>GPU ${i}: ${gpu.name}</option>`
    )
    .join("");

  container.innerHTML = `
    <label for="gpu-select" class="sr-only">Select GPU</label>
    <select id="gpu-select" class="select" aria-label="Select GPU">${options}</select>`;

  const select = document.getElementById("gpu-select");
  select.addEventListener("change", () => {
    const idx = parseInt(select.value, 10);
    setSelectedGpu(idx);
    onChange(idx);
  });

  return safeIndex;
}

/**
 * Format a number with optional unit.
 * @param {*} value
 * @param {string} [unit]
 * @returns {string}
 */
function formatValue(value, unit = "") {
  if (value === null || value === undefined) return "—";
  const suffix = unit ? ` ${unit}` : "";
  return `${value}${suffix}`;
}

/**
 * Pick progress bar color class based on percentage.
 * @param {number} pct
 * @returns {string}
 */
function progressClass(pct) {
  if (pct >= 90) return "danger";
  if (pct >= 75) return "warning";
  return "";
}

/**
 * Render a progress bar HTML string.
 * @param {number} pct
 * @param {string} [label]
 * @returns {string}
 */
function renderProgressBar(pct, label = "") {
  const safe = Math.min(100, Math.max(0, pct || 0));
  return `
    <div class="progress-bar" role="progressbar" aria-valuenow="${safe}" aria-label="${label}">
      <div class="progress-fill ${progressClass(safe)}" style="width: ${safe}%"></div>
    </div>`;
}

/**
 * Show an error message in a container.
 * @param {HTMLElement} el
 * @param {string} message
 */
function showError(el, message) {
  el.innerHTML = `<div class="alert alert-error">${message}</div>`;
}

/**
 * Format ISO timestamp to short time label.
 * @param {string} iso
 * @returns {string}
 */
function formatTimeLabel(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

/**
 * Format seconds into human-readable uptime.
 * @param {number} seconds
 * @returns {string}
 */
function formatUptime(seconds) {
  if (!seconds && seconds !== 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Default polling interval in milliseconds. */
const POLL_MS = 2000;

/**
 * Start interval polling.
 * @param {function(): Promise<void>} fn
 * @returns {number} Interval ID
 */
function startPolling(fn) {
  fn();
  return setInterval(fn, POLL_MS);
}
