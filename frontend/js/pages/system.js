/** System overview page — cross-platform system summary and I/O charts. */

let charts = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  renderNav("system", "system");
  try {
    const health = await fetchHealth();
    updateStatus(health);
    await loadData();
    startPolling(loadData);
  } catch (err) {
    document.getElementById("stat-cards").innerHTML =
      `<div class="alert alert-error">${err.message}</div>`;
  }
}

async function loadData() {
  const [systemData, grouped, history] = await Promise.all([
    fetchSystem(),
    fetchSystemGrouped(),
    fetchSystemHistory([
      "battery_percent",
      "disk_read_mb_s",
      "disk_write_mb_s",
      "net_sent_mb_s",
      "net_recv_mb_s",
    ]),
  ]);

  renderMachineBanner(systemData.summary, grouped.software);
  renderStatCards(systemData.summary);
  renderCharts(history, grouped);
}

function renderMachineBanner(summary, software) {
  const osLabel = summary.os_name || software?.os_name || formatPlatform(summary.platform);
  const osVersion = summary.os_version || software?.os_version || "—";
  document.getElementById("machine-banner").innerHTML = `
    <div class="gpu-card-header">
      <div>
        <div class="gpu-name">${summary.model_name || osLabel}</div>
        <div style="font-size:0.875rem;color:var(--color-text-secondary);margin-top:4px">
          ${summary.chip || ""}${summary.chip && summary.memory_gb ? " · " : ""}${summary.memory_gb ? `${formatValue(summary.memory_gb, "GB RAM")}` : ""}${(summary.chip || summary.memory_gb) ? " · " : ""}${osLabel} ${osVersion}
        </div>
      </div>
      <span class="gpu-index">${formatPlatform(summary.platform)}</span>
    </div>`;
}

function renderStatCards(s) {
  document.getElementById("stat-cards").innerHTML = `
    <div class="card">
      <div class="card-label">Battery</div>
      <div class="card-value">${formatValue(s.battery_percent, "%")}</div>
      ${renderProgressBar(s.battery_percent, "Battery level")}
      <div class="card-delta">${s.battery_plugged ? "On AC power" : "On battery"}${s.battery_time_left_min ? ` · ${s.battery_time_left_min} min left` : ""}</div>
    </div>
    <div class="card">
      <div class="card-label">Disk Used</div>
      <div class="card-value">${formatValue(s.disk_used_pct, "%")}</div>
      ${renderProgressBar(s.disk_used_pct, "Disk usage")}
      <div class="card-delta">${formatValue(s.disk_free_gb, "GB free")} of ${formatValue(s.disk_total_gb, "GB")}${s.disk_mountpoint ? ` · ${s.disk_mountpoint}` : ""}</div>
    </div>
    <div class="card">
      <div class="card-label">Primary Network</div>
      <div class="card-value">${s.network_interface || "—"}</div>
      <div class="card-delta">${s.network_connected ? "Connected" : "Disconnected"}</div>
    </div>
    <div class="card">
      <div class="card-label">Uptime</div>
      <div class="card-value" style="font-size:1.25rem">${formatUptime(s.uptime_seconds)}</div>
    </div>`;
}

function renderCharts(history, grouped) {
  const container = document.getElementById("charts");
  ensureChartLayout(container, `
    <div class="chart-panel">
      <div class="chart-title">Battery Level (%)</div>
      <div class="chart-container"><canvas id="chart-battery"></canvas></div>
    </div>
    <div class="chart-panel">
      <div class="chart-title">Disk Throughput (MB/s)</div>
      <div class="chart-container"><canvas id="chart-disk"></canvas></div>
    </div>
    <div class="chart-panel full-width">
      <div class="chart-title">Network Throughput (MB/s)</div>
      <div class="chart-container"><canvas id="chart-net"></canvas></div>
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

  const diskHist = historyToDatasets(history, {
    disk_read_mb_s: { label: "Read", color: CHART_COLORS.accent },
    disk_write_mb_s: { label: "Write", color: CHART_COLORS.purple },
  });
  charts.disk = upsertLineChart(
    charts.disk,
    document.getElementById("chart-disk"),
    diskHist.labels,
    diskHist.datasets
  );

  const netHist = historyToDatasets(history, {
    net_sent_mb_s: { label: "Sent", color: CHART_COLORS.warning },
    net_recv_mb_s: { label: "Received", color: CHART_COLORS.teal },
  });
  charts.net = upsertLineChart(
    charts.net,
    document.getElementById("chart-net"),
    netHist.labels,
    netHist.datasets
  );
}
