/** CPU memory page — RAM and swap charts. */

let charts = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  renderNav("cpu", "cpu-memory");
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
      fetchCpuHistory(["memory_used_pct", "swap_used_pct"]),
    ]);
    renderStatCards(grouped.memory, grouped.swap);
    renderCharts(history, grouped.memory, grouped.swap);
  } catch (err) {
    showError(document.getElementById("charts"), err.message);
  }
}

function renderStatCards(mem, swap) {
  document.getElementById("stat-cards").innerHTML = `
    <div class="card">
      <div class="card-label">Total RAM</div>
      <div class="card-value">${formatValue(mem.total_mb, "MB")}</div>
    </div>
    <div class="card">
      <div class="card-label">Used RAM</div>
      <div class="card-value">${formatValue(mem.used_mb, "MB")}</div>
      ${renderProgressBar(mem.used_pct, "RAM used")}
    </div>
    <div class="card">
      <div class="card-label">Available RAM</div>
      <div class="card-value">${formatValue(mem.available_mb, "MB")}</div>
    </div>
    <div class="card">
      <div class="card-label">Free RAM</div>
      <div class="card-value">${formatValue(mem.free_mb, "MB")}</div>
    </div>
    <div class="card">
      <div class="card-label">Swap Used</div>
      <div class="card-value">${formatValue(swap.used_mb, "MB")}</div>
      ${renderProgressBar(swap.used_pct, "Swap used")}
    </div>
    <div class="card">
      <div class="card-label">Swap Total</div>
      <div class="card-value">${formatValue(swap.total_mb, "MB")}</div>
    </div>`;
}

function renderCharts(history, mem, swap) {
  const container = document.getElementById("charts");
  ensureChartLayout(container, `
    <div class="chart-panel">
      <div class="chart-title">RAM Allocation</div>
      <div class="chart-container"><canvas id="chart-ram"></canvas></div>
    </div>
    <div class="chart-panel">
      <div class="chart-title">Swap Allocation</div>
      <div class="chart-container"><canvas id="chart-swap"></canvas></div>
    </div>
    <div class="chart-panel full-width">
      <div class="chart-title">Memory Usage Over Time</div>
      <div class="chart-container tall"><canvas id="chart-mem-history"></canvas></div>
    </div>`);

  charts.ram = upsertDoughnutChart(
    charts.ram,
    document.getElementById("chart-ram"),
    ["Used", "Available"],
    [mem.used_mb || 0, mem.available_mb || 0],
    [CHART_COLORS.accent, "#e2e2e2"]
  );

  charts.swap = upsertDoughnutChart(
    charts.swap,
    document.getElementById("chart-swap"),
    ["Used", "Free"],
    [swap.used_mb || 0, swap.free_mb || 0],
    [CHART_COLORS.warning, "#e2e2e2"]
  );

  const memHist = historyToDatasets(history, {
    memory_used_pct: { label: "RAM %", color: CHART_COLORS.accent },
    swap_used_pct: { label: "Swap %", color: CHART_COLORS.warning },
  });
  charts.memHistory = upsertLineChart(
    charts.memHistory,
    document.getElementById("chart-mem-history"),
    memHist.labels,
    memHist.datasets,
    { scales: { y: { max: 100 } } }
  );
}
