/** CPU processes page — top processes by CPU usage. */

document.addEventListener("DOMContentLoaded", init);

async function init() {
  renderNav("cpu", "cpu-processes");
  try {
    const health = await fetchHealth();
    updateStatus(health);
    document.getElementById("refresh-btn").addEventListener("click", loadData);
    await loadData();
    startPolling(loadData);
  } catch (err) {
    document.getElementById("process-table").innerHTML =
      `<div class="alert alert-error">${err.message}</div>`;
  }
}

async function loadData() {
  try {
    const [procData, cpuData] = await Promise.all([
      fetchCpuProcesses(),
      fetchCpu(),
    ]);
    renderSummary(cpuData.summary, procData.processes);
    renderTable(procData.processes);
  } catch (err) {
    showError(document.getElementById("process-table"), err.message);
  }
}

function renderSummary(cpu, processes) {
  const totalCpu = processes.reduce((s, p) => s + (p.cpu_percent || 0), 0);
  document.getElementById("summary-cards").innerHTML = `
    <div class="card">
      <div class="card-label">System CPU</div>
      <div class="card-value">${formatValue(cpu.utilization_pct, "%")}</div>
      ${renderProgressBar(cpu.utilization_pct, "CPU utilization")}
    </div>
    <div class="card">
      <div class="card-label">Tracked Processes</div>
      <div class="card-value">${processes.length}</div>
    </div>
    <div class="card">
      <div class="card-label">Top Processes CPU Σ</div>
      <div class="card-value">${totalCpu.toFixed(1)}<span class="card-unit">%</span></div>
    </div>
    <div class="card">
      <div class="card-label">RAM Used</div>
      <div class="card-value">${formatValue(cpu.memory_used_pct, "%")}</div>
      ${renderProgressBar(cpu.memory_used_pct, "RAM usage")}
    </div>`;
}

function renderTable(processes) {
  const el = document.getElementById("process-table");

  if (!processes.length) {
    el.innerHTML = `<div class="alert alert-info" style="margin-top:16px">No active processes with measurable CPU usage.</div>`;
    return;
  }

  const rows = processes
    .map(
      (p) => `
    <tr>
      <td>${p.pid}</td>
      <td>${p.name}</td>
      <td>${p.username}</td>
      <td>${formatValue(p.cpu_percent, "%")}</td>
      <td>${formatValue(p.memory_percent, "%")}</td>
    </tr>`
    )
    .join("");

  el.innerHTML = `
    <div class="data-table-wrap" style="margin-top:16px">
      <table class="data-table">
        <thead>
          <tr>
            <th>PID</th>
            <th>Name</th>
            <th>User</th>
            <th>CPU</th>
            <th>Memory</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}
