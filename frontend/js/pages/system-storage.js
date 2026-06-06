/** System storage page — volumes and disk I/O charts. */

let charts = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  renderNav("system", "system-storage");
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

function primaryVolume(volumes) {
  const preferred = volumes.find((v) => v.mountpoint === "/") ||
    volumes.find((v) => /^[A-Z]:\\$/i.test(v.mountpoint)) ||
    volumes[0];
  return preferred || {};
}

async function loadData() {
  const [storage, history] = await Promise.all([
    fetchSystemStorage(),
    fetchSystemHistory(["disk_used_pct", "disk_read_mb_s", "disk_write_mb_s"]),
  ]);

  renderStatCards(storage);
  renderCharts(history, storage);
  renderVolumeTable(storage.volumes);
}

function renderStatCards(storage) {
  const root = primaryVolume(storage.volumes);
  const io = storage.io || {};

  document.getElementById("stat-cards").innerHTML = `
    <div class="card">
      <div class="card-label">Root Volume Used</div>
      <div class="card-value">${formatValue(root.used_pct, "%")}</div>
      ${renderProgressBar(root.used_pct, "Disk usage")}
    </div>
    <div class="card">
      <div class="card-label">Free Space</div>
      <div class="card-value">${formatValue(root.free_gb, "GB")}</div>
    </div>
    <div class="card">
      <div class="card-label">Read Speed</div>
      <div class="card-value">${formatValue(io.read_mb_per_sec, "MB/s")}</div>
    </div>
    <div class="card">
      <div class="card-label">Write Speed</div>
      <div class="card-value">${formatValue(io.write_mb_per_sec, "MB/s")}</div>
    </div>
    <div class="card">
      <div class="card-label">Total Read</div>
      <div class="card-value">${formatValue(io.read_gb, "GB")}</div>
    </div>
    <div class="card">
      <div class="card-label">Total Written</div>
      <div class="card-value">${formatValue(io.write_gb, "GB")}</div>
    </div>`;
}

function renderCharts(history, storage) {
  const root = primaryVolume(storage.volumes);

  document.getElementById("charts").innerHTML = `
    <div class="chart-panel">
      <div class="chart-title">Root Volume Usage</div>
      <div class="chart-container"><canvas id="chart-doughnut"></canvas></div>
    </div>
    <div class="chart-panel">
      <div class="chart-title">Disk Usage Over Time (%)</div>
      <div class="chart-container"><canvas id="chart-used"></canvas></div>
    </div>
    <div class="chart-panel full-width">
      <div class="chart-title">Disk Throughput (MB/s)</div>
      <div class="chart-container"><canvas id="chart-io"></canvas></div>
    </div>`;

  destroyChart(charts.doughnut);
  charts.doughnut = createDoughnutChart(
    document.getElementById("chart-doughnut"),
    ["Used", "Free"],
    [root.used_gb || 0, root.free_gb || 0],
    [CHART_COLORS.accent, "#e2e2e2"]
  );

  const usedHist = historyToDatasets(history, {
    disk_used_pct: { label: "Used %", color: CHART_COLORS.accent },
  });
  destroyChart(charts.used);
  charts.used = createLineChart(
    document.getElementById("chart-used"),
    usedHist.labels,
    usedHist.datasets,
    { scales: { y: { max: 100 } } }
  );

  const ioHist = historyToDatasets(history, {
    disk_read_mb_s: { label: "Read", color: CHART_COLORS.accent },
    disk_write_mb_s: { label: "Write", color: CHART_COLORS.purple },
  });
  destroyChart(charts.io);
  charts.io = createLineChart(
    document.getElementById("chart-io"),
    ioHist.labels,
    ioHist.datasets
  );
}

function renderVolumeTable(volumes) {
  if (!volumes?.length) {
    document.getElementById("volume-table").innerHTML =
      `<div class="alert alert-info" style="margin-top:16px">No volumes detected.</div>`;
    return;
  }

  const rows = volumes.map(
    (v) => `
    <tr>
      <td>${v.mountpoint}</td>
      <td>${v.fstype}</td>
      <td>${formatValue(v.total_gb, "GB")}</td>
      <td>${formatValue(v.used_gb, "GB")}</td>
      <td>${formatValue(v.free_gb, "GB")}</td>
      <td>${formatValue(v.used_pct, "%")}</td>
    </tr>`
  ).join("");

  document.getElementById("volume-table").innerHTML = `
    <div class="data-table-wrap" style="margin-top:16px">
      <table class="data-table">
        <thead>
          <tr>
            <th>Mount</th>
            <th>FS</th>
            <th>Total</th>
            <th>Used</th>
            <th>Free</th>
            <th>Used %</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}
