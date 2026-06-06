/** System hardware page — MacBook profile and software info. */

document.addEventListener("DOMContentLoaded", init);

async function init() {
  renderNav("system", "system-hardware");
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
  const [hardware, software] = await Promise.all([
    fetchSystemHardware(),
    fetchSystemSoftware(),
  ]);

  document.getElementById("stat-sections").innerHTML =
    renderStatSection("Hardware", flattenStatObject(hardware)) +
    renderStatSection("Software", flattenStatObject(software));
}
