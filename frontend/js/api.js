/** API client for GPU Monitor backend. */

const API_BASE = window.location.origin;

/**
 * Perform a GET request to the API.
 * @param {string} path - API path (e.g. /api/gpus)
 * @returns {Promise<object>}
 */
async function apiGet(path) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed: ${response.status}`);
  }
  return response.json();
}

/** @returns {Promise<object>} Health status. */
function fetchHealth() {
  return apiGet("/api/health");
}

/** @returns {Promise<object>} Driver info. */
function fetchDriver() {
  return apiGet("/api/driver");
}

/** @returns {Promise<object>} GPU list with summaries. */
function fetchGpus() {
  return apiGet("/api/gpus");
}

/**
 * @param {number} index - GPU index
 * @returns {Promise<object>} Full GPU details.
 */
function fetchGpuDetails(index) {
  return apiGet(`/api/gpus/${index}`);
}

/**
 * @param {number} index - GPU index
 * @returns {Promise<object>} Grouped stats.
 */
function fetchGroupedStats(index) {
  return apiGet(`/api/gpus/${index}/grouped`);
}

/**
 * @param {number} index - GPU index
 * @returns {Promise<object>} GPU processes.
 */
function fetchProcesses(index) {
  return apiGet(`/api/gpus/${index}/processes`);
}

/**
 * @param {number} index - GPU index
 * @param {string[]} [metrics] - Metric keys to include
 * @returns {Promise<object>} Time-series history.
 */
function fetchHistory(index, metrics) {
  const params = metrics?.length ? `?metrics=${metrics.join(",")}` : "";
  return apiGet(`/api/gpus/${index}/history${params}`);
}

/** @returns {Promise<object>} CPU summary. */
function fetchCpu() {
  return apiGet("/api/cpu");
}

/** @returns {Promise<object>} Full CPU details. */
function fetchCpuDetails() {
  return apiGet("/api/cpu/details");
}

/** @returns {Promise<object>} Grouped CPU stats. */
function fetchCpuGrouped() {
  return apiGet("/api/cpu/grouped");
}

/** @returns {Promise<object>} Top CPU processes. */
function fetchCpuProcesses() {
  return apiGet("/api/cpu/processes");
}

/**
 * @param {string[]} [metrics] - Metric keys to include
 * @param {number} [core] - Optional core index for per-core history
 * @returns {Promise<object>} CPU time-series history.
 */
function fetchCpuHistory(metrics, core) {
  const parts = [];
  if (metrics?.length) parts.push(`metrics=${metrics.join(",")}`);
  if (core !== undefined) parts.push(`core=${core}`);
  const qs = parts.length ? `?${parts.join("&")}` : "";
  return apiGet(`/api/cpu/history${qs}`);
}

/** @returns {Promise<object>} System summary. */
function fetchSystem() {
  return apiGet("/api/system");
}

/** @returns {Promise<object>} Grouped system stats. */
function fetchSystemGrouped() {
  return apiGet("/api/system/grouped");
}

/** @returns {Promise<object>} Mac hardware profile. */
function fetchSystemHardware() {
  return apiGet("/api/system/hardware");
}

/** @returns {Promise<object>} Battery status. */
function fetchSystemBattery() {
  return apiGet("/api/system/battery");
}

/** @returns {Promise<object>} Storage volumes and I/O. */
function fetchSystemStorage() {
  return apiGet("/api/system/storage");
}

/** @returns {Promise<object>} Network interfaces and traffic. */
function fetchSystemNetwork() {
  return apiGet("/api/system/network");
}

/** @returns {Promise<object>} macOS software info. */
function fetchSystemSoftware() {
  return apiGet("/api/system/software");
}

/**
 * @param {string[]} [metrics] - Metric keys to include
 * @returns {Promise<object>} System time-series history.
 */
function fetchSystemHistory(metrics) {
  const params = metrics?.length ? `?metrics=${metrics.join(",")}` : "";
  return apiGet(`/api/system/history${params}`);
}
