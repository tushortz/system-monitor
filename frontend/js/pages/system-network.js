/** System network page — interfaces and traffic charts. */

let charts = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  renderNav("system", "system-network");
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
  const [network, history] = await Promise.all([
    fetchSystemNetwork(),
    fetchSystemHistory(["net_sent_mb_s", "net_recv_mb_s"]),
  ]);

  renderStatCards(network);
  renderCharts(history);
  renderInterfaceTable(network.interfaces);
}

function renderStatCards(network) {
  const total = network.total || {};
  const primary = network.interfaces.find((i) => i.name === "en0") || network.interfaces[0] || {};

  document.getElementById("stat-cards").innerHTML = `
    <div class="card">
      <div class="card-label">Primary Interface</div>
      <div class="card-value">${primary.name || "—"}</div>
      <div class="card-delta">${primary.is_up ? "Up" : "Down"}${primary.ipv4 ? ` · ${primary.ipv4}` : ""}</div>
    </div>
    <div class="card">
      <div class="card-label">Send Rate</div>
      <div class="card-value">${formatValue(total.send_mb_per_sec, "MB/s")}</div>
    </div>
    <div class="card">
      <div class="card-label">Receive Rate</div>
      <div class="card-value">${formatValue(total.recv_mb_per_sec, "MB/s")}</div>
    </div>
    <div class="card">
      <div class="card-label">Total Sent</div>
      <div class="card-value">${formatValue(total.bytes_sent_gb, "GB")}</div>
    </div>
    <div class="card">
      <div class="card-label">Total Received</div>
      <div class="card-value">${formatValue(total.bytes_recv_gb, "GB")}</div>
    </div>
    <div class="card">
      <div class="card-label">Active Interfaces</div>
      <div class="card-value">${network.interfaces.filter((i) => i.is_up).length}<span class="card-unit">/ ${network.interfaces.length}</span></div>
    </div>`;
}

function renderCharts(history) {
  document.getElementById("charts").innerHTML = `
    <div class="chart-panel full-width">
      <div class="chart-title">Network Throughput (MB/s)</div>
      <div class="chart-container tall"><canvas id="chart-net"></canvas></div>
    </div>`;

  const netHist = historyToDatasets(history, {
    net_sent_mb_s: { label: "Sent", color: CHART_COLORS.warning },
    net_recv_mb_s: { label: "Received", color: CHART_COLORS.teal },
  });
  destroyChart(charts.net);
  charts.net = createLineChart(
    document.getElementById("chart-net"),
    netHist.labels,
    netHist.datasets
  );
}

function renderInterfaceTable(interfaces) {
  if (!interfaces?.length) {
    document.getElementById("interface-table").innerHTML =
      `<div class="alert alert-info" style="margin-top:16px">No network interfaces detected.</div>`;
    return;
  }

  const rows = interfaces.map(
    (i) => `
    <tr>
      <td>${i.name}</td>
      <td>${i.is_up ? "Up" : "Down"}</td>
      <td>${i.ipv4 || "—"}</td>
      <td>${i.mac || "—"}</td>
      <td>${formatValue(i.speed_mbps, "Mbps")}</td>
      <td>${formatValue(i.bytes_sent_mb, "MB")}</td>
      <td>${formatValue(i.bytes_recv_mb, "MB")}</td>
    </tr>`
  ).join("");

  document.getElementById("interface-table").innerHTML = `
    <div class="data-table-wrap" style="margin-top:16px">
      <table class="data-table">
        <thead>
          <tr>
            <th>Interface</th>
            <th>Status</th>
            <th>IPv4</th>
            <th>MAC</th>
            <th>Speed</th>
            <th>Sent</th>
            <th>Received</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}
