/** Processes page — GPU workload listing. */

let currentGpu = 0;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  renderNav("gpu", "processes");
  try {
    const health = await fetchHealth();
    updateStatus(health);
    const gpuData = await fetchGpus();
    currentGpu = renderGpuSelector(gpuData.gpus, onGpuChange);
    document.getElementById("refresh-btn").addEventListener("click", () => loadData(currentGpu));
    await loadData(currentGpu);
    startPolling(() => loadData(currentGpu));
  } catch (err) {
    document.getElementById("process-table").innerHTML =
      `<div class="alert alert-error">${err.message}</div>`;
  }
}

function onGpuChange(index) {
  currentGpu = index;
  loadData(index);
}

async function loadData(index) {
  try {
    const [procData, grouped] = await Promise.all([
      fetchProcesses(index),
      fetchGroupedStats(index),
    ]);
    renderSummary(grouped.memory, procData.processes);
    renderTable(procData.processes);
  } catch (err) {
    showError(document.getElementById("process-table"), err.message);
  }
}

function renderSummary(mem, processes) {
  const totalProcMem = processes.reduce((s, p) => s + (p.memory_mb || 0), 0);
  const el = document.getElementById("summary-cards");
  el.innerHTML = `
    <div class="card">
      <div class="card-label">Active Processes</div>
      <div class="card-value">${processes.length}</div>
    </div>
    <div class="card">
      <div class="card-label">Process Memory Total</div>
      <div class="card-value">${totalProcMem.toFixed(1)}<span class="card-unit">MB</span></div>
    </div>
    <div class="card">
      <div class="card-label">GPU VRAM Used</div>
      <div class="card-value">${formatValue(mem.used_mb, "MB")}</div>
      ${renderProgressBar(mem.used_pct, "VRAM used")}
    </div>
    <div class="card">
      <div class="card-label">Compute / Graphics</div>
      <div class="card-value">
        ${processes.filter((p) => p.type === "compute").length}
        <span class="card-unit">/ ${processes.filter((p) => p.type === "graphics").length}</span>
      </div>
      <div class="card-delta">Compute / Graphics count</div>
    </div>`;
}

function renderTable(processes) {
  const el = document.getElementById("process-table");

  if (!processes.length) {
    el.innerHTML = `<div class="alert alert-info" style="margin-top:16px">No processes currently using this GPU.</div>`;
    return;
  }

  const rows = processes
    .map(
      (p) => `
    <tr>
      <td>${p.pid}</td>
      <td><span class="badge badge-${p.type}">${p.type}</span></td>
      <td>${formatValue(p.memory_mb, "MB")}</td>
    </tr>`
    )
    .join("");

  el.innerHTML = `
    <div class="data-table-wrap" style="margin-top:16px">
      <table class="data-table">
        <thead>
          <tr>
            <th>PID</th>
            <th>Type</th>
            <th>GPU Memory</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}
