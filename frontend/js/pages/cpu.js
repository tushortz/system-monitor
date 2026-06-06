/** CPU performance page — utilization, load, and per-core charts. */

let charts = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  renderNav("cpu", "cpu");
  try {
    const health = await fetchHealth();
    updateStatus(health);
    document.getElementById("refresh-btn").addEventListener("click", loadData);
    await loadData();
    startPolling(loadData);
  } catch (err) {
    document.getElementById("charts").innerHTML =
      `<div class="alert alert-error">${err.message}</div>`;
  }
}

async function loadData() {
  try {
    const [grouped, history] = await Promise.all([
      fetchCpuGrouped(),
      fetchCpuHistory([
        "cpu_utilization",
        "load_normalized",
        "temperature",
      ]),
    ]);
    renderStatCards(grouped);
    renderCoreGrid(grouped.utilization.per_core_pct);
    renderCharts(history, grouped);
  } catch (err) {
    showError(document.getElementById("charts"), err.message);
  }
}

function renderStatCards(data) {
  const util = data.utilization;
  const freq = data.frequency;
  const load = data.load || {};
  const temp = data.temperature?.cpu_c;
  const times = util.times_pct || {};

  document.getElementById("stat-cards").innerHTML = `
    <div class="card">
      <div class="card-label">Overall CPU</div>
      <div class="card-value">${formatValue(util.overall_pct, "%")}</div>
      ${renderProgressBar(util.overall_pct, "CPU utilization")}
    </div>
    <div class="card">
      <div class="card-label">Frequency</div>
      <div class="card-value">${formatValue(freq.current_mhz, "MHz")}</div>
      <div class="card-delta">${formatValue(freq.min_mhz)}–${formatValue(freq.max_mhz)} MHz</div>
    </div>
    <div class="card">
      <div class="card-label">Load Average</div>
      <div class="card-value">${formatValue(load.load_1m)}</div>
      <div class="card-delta">5m: ${formatValue(load.load_5m)} · 15m: ${formatValue(load.load_15m)}</div>
    </div>
    <div class="card">
      <div class="card-label">Temperature</div>
      <div class="card-value">${formatValue(temp, "°C")}</div>
    </div>
    <div class="card">
      <div class="card-label">User / System</div>
      <div class="card-value">${formatValue(times.user, "%")}</div>
      <div class="card-delta">System: ${formatValue(times.system, "%")} · Idle: ${formatValue(times.idle, "%")}</div>
    </div>
    <div class="card">
      <div class="card-label">Cores</div>
      <div class="card-value">${data.identity.physical_cores}<span class="card-unit">/ ${data.identity.logical_cores}</span></div>
      <div class="card-delta">Physical / logical</div>
    </div>`;
}

function renderCoreGrid(perCore) {
  const el = document.getElementById("core-grid");
  el.innerHTML = (perCore || [])
    .map(
      (pct, i) => `
      <div class="core-cell">
        <div class="core-cell-label">Core ${i}</div>
        <div class="core-cell-value">${pct}%</div>
        ${renderProgressBar(pct, `Core ${i}`)}
      </div>`
    )
    .join("");
}

function renderCharts(history, grouped) {
  const container = document.getElementById("charts");
  container.innerHTML = `
    <div class="chart-panel full-width">
      <div class="chart-title">CPU Utilization Over Time</div>
      <div class="chart-container tall"><canvas id="chart-cpu-util"></canvas></div>
    </div>
    <div class="chart-panel">
      <div class="chart-title">Load (normalized %)</div>
      <div class="chart-container"><canvas id="chart-load"></canvas></div>
    </div>
    <div class="chart-panel">
      <div class="chart-title">Per-Core Utilization</div>
      <div class="chart-container"><canvas id="chart-cores"></canvas></div>
    </div>
    <div class="chart-panel">
      <div class="chart-title">CPU Time Breakdown</div>
      <div class="chart-container"><canvas id="chart-times"></canvas></div>
    </div>
    <div class="chart-panel">
      <div class="chart-title">Performance Snapshot</div>
      <div class="chart-container"><canvas id="chart-radar"></canvas></div>
    </div>`;

  const utilHist = historyToDatasets(history, {
    cpu_utilization: { label: "CPU %", color: CHART_COLORS.success },
  });
  destroyChart(charts.util);
  charts.util = createLineChart(
    document.getElementById("chart-cpu-util"),
    utilHist.labels,
    utilHist.datasets,
    { scales: { y: { max: 100 } } }
  );

  const loadHist = historyToDatasets(history, {
    load_normalized: { label: "Load %", color: CHART_COLORS.warning },
  });
  destroyChart(charts.load);
  charts.load = createLineChart(
    document.getElementById("chart-load"),
    loadHist.labels,
    loadHist.datasets
  );

  const perCore = grouped.utilization.per_core_pct || [];
  destroyChart(charts.cores);
  charts.cores = createBarChart(
    document.getElementById("chart-cores"),
    perCore.map((_, i) => `Core ${i}`),
    [{
      label: "Utilization %",
      data: perCore,
      backgroundColor: CHART_COLORS.success,
      borderRadius: 4,
    }]
  );

  const times = grouped.utilization.times_pct || {};
  destroyChart(charts.times);
  charts.times = createDoughnutChart(
    document.getElementById("chart-times"),
    ["User", "System", "Idle", "IOWait"],
    [times.user || 0, times.system || 0, times.idle || 0, times.iowait || 0],
    [CHART_COLORS.accent, CHART_COLORS.purple, "#e2e2e2", CHART_COLORS.warning]
  );

  const u = grouped.utilization;
  destroyChart(charts.radar);
  charts.radar = createRadarChart(
    document.getElementById("chart-radar"),
    ["CPU", "User", "System", "IOWait", "Idle"],
    [u.overall_pct || 0, times.user || 0, times.system || 0, times.iowait || 0, times.idle || 0]
  );
}
