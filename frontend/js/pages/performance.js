/** Performance page — utilization, temperature, power charts. */

let charts = {};
let pollId = null;
let currentGpu = 0;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  renderNav("gpu", "performance");
  try {
    const health = await fetchHealth();
    updateStatus(health);
    const gpuData = await fetchGpus();
    currentGpu = renderGpuSelector(gpuData.gpus, onGpuChange);
    document.getElementById("refresh-btn").addEventListener("click", () => loadData(currentGpu));
    await loadData(currentGpu);
    pollId = startPolling(() => loadData(currentGpu));
  } catch (err) {
    document.getElementById("charts").innerHTML =
      `<div class="alert alert-error">${err.message}</div>`;
  }
}

function onGpuChange(index) {
  currentGpu = index;
  loadData(index);
}

async function loadData(index) {
  try {
    const [grouped, history] = await Promise.all([
      fetchGroupedStats(index),
      fetchHistory(index, [
        "gpu_utilization",
        "memory_utilization",
        "temperature",
        "power",
        "fan_speed",
      ]),
    ]);

    renderStatCards(grouped.performance, grouped.power);
    renderCharts(history, grouped);
  } catch (err) {
    showError(document.getElementById("charts"), err.message);
  }
}

function renderStatCards(perf, power) {
  const el = document.getElementById("stat-cards");
  const clocks = perf.clocks_mhz || {};
  el.innerHTML = `
    <div class="card">
      <div class="card-label">GPU Utilization</div>
      <div class="card-value">${formatValue(perf.gpu_utilization_pct, "%")}</div>
      ${renderProgressBar(perf.gpu_utilization_pct, "GPU utilization")}
    </div>
    <div class="card">
      <div class="card-label">Temperature</div>
      <div class="card-value">${formatValue(perf.temperature_c, "°C")}</div>
    </div>
    <div class="card">
      <div class="card-label">Power Draw</div>
      <div class="card-value">${formatValue(power.usage_w, "W")}</div>
      <div class="card-delta">Limit: ${formatValue(power.limit_w, "W")}</div>
    </div>
    <div class="card">
      <div class="card-label">Fan Speed</div>
      <div class="card-value">${formatValue(perf.fan_speed_pct, "%")}</div>
    </div>
    <div class="card">
      <div class="card-label">Graphics Clock</div>
      <div class="card-value">${formatValue(clocks.graphics, "MHz")}</div>
    </div>
    <div class="card">
      <div class="card-label">SM Clock</div>
      <div class="card-value">${formatValue(clocks.sm, "MHz")}</div>
    </div>`;
}

function renderCharts(history, grouped) {
  const container = document.getElementById("charts");
  ensureChartLayout(container, `
    <div class="chart-panel full-width">
      <div class="chart-title">Utilization Over Time</div>
      <div class="chart-container tall"><canvas id="chart-util"></canvas></div>
    </div>
    <div class="chart-panel">
      <div class="chart-title">Temperature (°C)</div>
      <div class="chart-container"><canvas id="chart-temp"></canvas></div>
    </div>
    <div class="chart-panel">
      <div class="chart-title">Power Draw (W)</div>
      <div class="chart-container"><canvas id="chart-power"></canvas></div>
    </div>
    <div class="chart-panel">
      <div class="chart-title">Fan Speed (%)</div>
      <div class="chart-container"><canvas id="chart-fan"></canvas></div>
    </div>
    <div class="chart-panel">
      <div class="chart-title">Performance Snapshot</div>
      <div class="chart-container"><canvas id="chart-radar"></canvas></div>
    </div>
    <div class="chart-panel">
      <div class="chart-title">Clock Speeds (MHz)</div>
      <div class="chart-container"><canvas id="chart-clocks"></canvas></div>
    </div>`);

  const utilCfg = {
    gpu_utilization: { label: "GPU %", color: CHART_COLORS.accent },
    memory_utilization: { label: "Memory %", color: CHART_COLORS.purple },
  };
  const { labels: utilLabels, datasets: utilDatasets } = historyToDatasets(history, utilCfg);

  charts.util = upsertLineChart(
    charts.util,
    document.getElementById("chart-util"),
    utilLabels,
    utilDatasets,
    { scales: { y: { max: 100 } } }
  );

  const tempHist = historyToDatasets(history, {
    temperature: { label: "Temperature", color: CHART_COLORS.danger },
  });
  charts.temp = upsertLineChart(
    charts.temp,
    document.getElementById("chart-temp"),
    tempHist.labels,
    tempHist.datasets
  );

  const powerHist = historyToDatasets(history, {
    power: { label: "Power", color: CHART_COLORS.warning },
  });
  charts.power = upsertLineChart(
    charts.power,
    document.getElementById("chart-power"),
    powerHist.labels,
    powerHist.datasets
  );

  const fanHist = historyToDatasets(history, {
    fan_speed: { label: "Fan", color: CHART_COLORS.teal },
  });
  charts.fan = upsertLineChart(
    charts.fan,
    document.getElementById("chart-fan"),
    fanHist.labels,
    fanHist.datasets,
    { scales: { y: { max: 100 } } }
  );

  const p = grouped.performance;
  charts.radar = upsertRadarChart(
    charts.radar,
    document.getElementById("chart-radar"),
    ["GPU Util", "Mem Util", "Fan", "Temp %", "Power %"],
    [
      p.gpu_utilization_pct || 0,
      p.memory_utilization_pct || 0,
      p.fan_speed_pct || 0,
      Math.min(100, (p.temperature_c || 0)),
      Math.min(100, ((grouped.power?.usage_w || 0) / (grouped.power?.limit_w || 1)) * 100),
    ]
  );

  const clocks = p.clocks_mhz || {};
  charts.clocks = upsertBarChart(
    charts.clocks,
    document.getElementById("chart-clocks"),
    ["Graphics", "Memory", "SM"],
    [{
      label: "MHz",
      data: [clocks.graphics || 0, clocks.memory || 0, clocks.sm || 0],
      backgroundColor: [CHART_COLORS.accent, CHART_COLORS.purple, CHART_COLORS.success],
      borderRadius: 4,
    }]
  );
}
