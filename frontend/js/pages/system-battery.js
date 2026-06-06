/** System battery page — charge status and history. */

let charts = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  renderNav("system", "system-battery");
  try {
    const health = await fetchHealth();
    updateStatus(health);
    document.getElementById("refresh-btn").addEventListener("click", loadData);
    await loadData();
    startPolling(loadData);
  } catch (err) {
    document.getElementById("stat-cards").innerHTML =
      `<div class="alert alert-error">${err.message}</div>`;
  }
}

async function loadData() {
  const [battery, history] = await Promise.all([
    fetchSystemBattery(),
    fetchSystemHistory(["battery_percent"]),
  ]);

  renderStatCards(battery);
  renderChart(history);
  document.getElementById("stat-sections").innerHTML =
    renderStatSection("Battery Details", flattenStatObject(battery));
}

function renderStatCards(b) {
  const warnings = (b.warnings || []).length
    ? `<div class="alert alert-info" style="grid-column:1/-1">${b.warnings.join(" · ")}</div>`
    : "";

  document.getElementById("stat-cards").innerHTML = `
    ${warnings}
    <div class="card">
      <div class="card-label">Charge Level</div>
      <div class="card-value">${formatValue(b.percent, "%")}</div>
      ${renderProgressBar(b.percent, "Battery level")}
    </div>
    <div class="card">
      <div class="card-label">Power Source</div>
      <div class="card-value" style="font-size:1.25rem">${b.power_source || "—"}</div>
      <div class="card-delta">${b.charging ? "Charging" : "Not charging"}</div>
    </div>
    <div class="card">
      <div class="card-label">Time Remaining</div>
      <div class="card-value">${b.time_left_min != null ? `${b.time_left_min} min` : "—"}</div>
    </div>
    <div class="card">
      <div class="card-label">Status</div>
      <div class="card-value" style="font-size:1.125rem">${b.status || "—"}</div>
      <div class="card-delta">${b.drawing_from || ""}</div>
    </div>`;
}

function renderChart(history) {
  ensureChartLayout(document.getElementById("charts"), `
    <div class="chart-panel full-width">
      <div class="chart-title">Battery Level Over Time</div>
      <div class="chart-container tall"><canvas id="chart-battery"></canvas></div>
    </div>`);

  const batHist = historyToDatasets(history, {
    battery_percent: { label: "Battery %", color: CHART_COLORS.success },
  });
  charts.battery = upsertLineChart(
    charts.battery,
    document.getElementById("chart-battery"),
    batHist.labels,
    batHist.datasets,
    { scales: { y: { max: 100 } } }
  );
}
