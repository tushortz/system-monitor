/** Memory page — VRAM usage and memory controller charts. */

let charts = {};
let currentGpu = 0;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  renderNav("gpu", "memory");
  try {
    const health = await fetchHealth();
    updateStatus(health);
    const gpuData = await fetchGpus();
    currentGpu = renderGpuSelector(gpuData.gpus, onGpuChange);
    document.getElementById("refresh-btn").addEventListener("click", () => loadData(currentGpu));
    await loadData(currentGpu);
    startPolling(() => loadData(currentGpu));
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
    const [grouped, history, details] = await Promise.all([
      fetchGroupedStats(index),
      fetchHistory(index, ["memory_utilization", "memory_used_pct"]),
      fetchGpuDetails(index),
    ]);

    renderStatCards(grouped.memory, grouped.performance);
    renderCharts(history, grouped.memory, details.processes || []);
  } catch (err) {
    showError(document.getElementById("charts"), err.message);
  }
}

function renderStatCards(mem, perf) {
  const el = document.getElementById("stat-cards");
  el.innerHTML = `
    <div class="card">
      <div class="card-label">Total VRAM</div>
      <div class="card-value">${formatValue(mem.total_mb, "MB")}</div>
    </div>
    <div class="card">
      <div class="card-label">Used VRAM</div>
      <div class="card-value">${formatValue(mem.used_mb, "MB")}</div>
      ${renderProgressBar(mem.used_pct, "VRAM used")}
    </div>
    <div class="card">
      <div class="card-label">Free VRAM</div>
      <div class="card-value">${formatValue(mem.free_mb, "MB")}</div>
    </div>
    <div class="card">
      <div class="card-label">Memory Controller Util</div>
      <div class="card-value">${formatValue(perf.memory_utilization_pct, "%")}</div>
      ${renderProgressBar(perf.memory_utilization_pct, "Memory controller utilization")}
    </div>`;
}

function renderCharts(history, mem, processes) {
  const container = document.getElementById("charts");
  ensureChartLayout(container, `
    <div class="chart-panel">
      <div class="chart-title">VRAM Allocation</div>
      <div class="chart-container"><canvas id="chart-doughnut"></canvas></div>
    </div>
    <div class="chart-panel">
      <div class="chart-title">Process Memory Breakdown</div>
      <div class="chart-container"><canvas id="chart-process-mem"></canvas></div>
    </div>
    <div class="chart-panel full-width">
      <div class="chart-title">Memory Usage Over Time (%)</div>
      <div class="chart-container tall"><canvas id="chart-mem-history"></canvas></div>
    </div>
    <div class="chart-panel full-width">
      <div class="chart-title">Memory Controller Utilization (%)</div>
      <div class="chart-container"><canvas id="chart-mem-ctrl"></canvas></div>
    </div>`);

  const used = mem.used_mb || 0;
  const free = mem.free_mb || 0;

  charts.doughnut = upsertDoughnutChart(
    charts.doughnut,
    document.getElementById("chart-doughnut"),
    ["Used", "Free"],
    [used, free],
    [CHART_COLORS.accent, "#e2e2e2"]
  );

  const procLabels = processes.map((p) => `PID ${p.pid} (${p.type})`);
  const procData = processes.map((p) => p.memory_mb || 0);
  const otherMem = Math.max(0, used - procData.reduce((a, b) => a + b, 0));

  if (otherMem > 0) {
    procLabels.push("Other / Driver");
    procData.push(otherMem);
  }

  charts.procMem = upsertBarChart(
    charts.procMem,
    document.getElementById("chart-process-mem"),
    procLabels.length ? procLabels : ["No processes"],
    [{
      label: "Memory (MB)",
      data: procData.length ? procData : [0],
      backgroundColor: CHART_COLORS.purple,
      borderRadius: 4,
    }]
  );

  const memHist = historyToDatasets(history, {
    memory_used_pct: { label: "VRAM Used %", color: CHART_COLORS.accent },
  });
  charts.memHistory = upsertLineChart(
    charts.memHistory,
    document.getElementById("chart-mem-history"),
    memHist.labels,
    memHist.datasets,
    { scales: { y: { max: 100 } } }
  );

  const ctrlHist = historyToDatasets(history, {
    memory_utilization: { label: "Controller %", color: CHART_COLORS.teal },
  });
  charts.memCtrl = upsertLineChart(
    charts.memCtrl,
    document.getElementById("chart-mem-ctrl"),
    ctrlHist.labels,
    ctrlHist.datasets,
    { scales: { y: { max: 100 } } }
  );
}
