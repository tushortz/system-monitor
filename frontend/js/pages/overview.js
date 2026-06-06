/** Overview page — CPU and GPU summary cards. */

let miniCharts = {};
let cpuMiniChart = null;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  renderNav("overview", "overview");
  try {
    const health = await fetchHealth();
    updateStatus(health);
    await loadOverview();
    startPolling(loadOverview);
  } catch (err) {
    document.getElementById("content").innerHTML =
      `<div class="alert alert-error">Failed to connect to API: ${err.message}</div>`;
  }
}

async function loadOverview() {
  const content = document.getElementById("content");
  try {
    const [gpuData, driver, cpuData] = await Promise.all([
      fetchGpus(),
      fetchDriver(),
      fetchCpu(),
    ]);

    if (gpuData.mode === "demo") {
      const banner = document.getElementById("demo-banner");
      banner.classList.remove("hidden");
      banner.textContent =
        driver.note || "Running in demo mode — connect an NVIDIA GPU for live data.";
    }

    const cpu = cpuData.summary;
    content.innerHTML =
      buildCpuSection(cpu) +
      buildSummaryCards(gpuData.gpus) +
      buildGpuCards(gpuData.gpus);

    updateCpuMiniChart();
    gpuData.gpus.forEach((_, i) => updateMiniChart(i));
  } catch (err) {
    showError(content, err.message);
  }
}

function buildCpuSection(cpu) {
  const cores = cpu.per_core_pct || [];
  const coreCells = cores
    .map(
      (pct, i) => `
      <div class="core-cell">
        <div class="core-cell-label">Core ${i}</div>
        <div class="core-cell-value">${pct}%</div>
        ${renderProgressBar(pct, `Core ${i} utilization`)}
      </div>`
    )
    .join("");

  return `
    <h2 class="section-title">CPU &amp; System</h2>
    <div class="card-grid">
      <div class="card">
        <div class="card-label">CPU Utilization</div>
        <div class="card-value">${formatValue(cpu.utilization_pct, "%")}</div>
        ${renderProgressBar(cpu.utilization_pct, "CPU utilization")}
      </div>
      <div class="card">
        <div class="card-label">Cores</div>
        <div class="card-value">${cpu.physical_cores}<span class="card-unit">/ ${cpu.logical_cores} threads</span></div>
      </div>
      <div class="card">
        <div class="card-label">Frequency</div>
        <div class="card-value">${formatValue(cpu.frequency_mhz, "MHz")}</div>
      </div>
      <div class="card">
        <div class="card-label">RAM Used</div>
        <div class="card-value">${Math.round(cpu.memory_used_mb || 0)}<span class="card-unit">/ ${Math.round(cpu.memory_total_mb || 0)} MB</span></div>
        ${renderProgressBar(cpu.memory_used_pct, "RAM usage")}
      </div>
      <div class="card">
        <div class="card-label">Load (1m)</div>
        <div class="card-value">${formatValue(cpu.load_1m)}</div>
      </div>
      <div class="card">
        <div class="card-label">Uptime</div>
        <div class="card-value" style="font-size:1.25rem">${formatUptime(cpu.uptime_seconds)}</div>
      </div>
    </div>
    <div class="gpu-card" style="margin-bottom:var(--spacing-lg)">
      <div class="gpu-card-header">
        <div class="gpu-name">CPU Utilization History</div>
        <a href="/cpu" class="btn btn-secondary" style="font-size:0.75rem;padding:4px 10px">View CPU →</a>
      </div>
      <div style="height:100px">
        <canvas id="cpu-mini-chart" aria-label="CPU utilization sparkline"></canvas>
      </div>
    </div>
    <div class="core-grid">${coreCells}</div>
    <h2 class="section-title">GPUs</h2>`;
}

function buildSummaryCards(gpus) {
  if (!gpus.length) {
    return `<div class="alert alert-info">No GPUs detected.</div>`;
  }

  const avgUtil = Math.round(
    gpus.reduce((s, g) => s + (g.gpu_utilization_pct || 0), 0) / gpus.length
  );
  const avgTemp = Math.round(
    gpus.reduce((s, g) => s + (g.temperature_c || 0), 0) / gpus.length
  );
  const totalMem = gpus.reduce((s, g) => s + (g.memory_total_mb || 0), 0);
  const usedMem = gpus.reduce((s, g) => s + (g.memory_used_mb || 0), 0);
  const totalPower = gpus.reduce((s, g) => s + (g.power_w || 0), 0);

  return `
    <div class="card-grid">
      <div class="card">
        <div class="card-label">GPUs Detected</div>
        <div class="card-value">${gpus.length}</div>
      </div>
      <div class="card">
        <div class="card-label">Avg GPU Utilization</div>
        <div class="card-value">${avgUtil}<span class="card-unit">%</span></div>
        ${renderProgressBar(avgUtil, "Average GPU utilization")}
      </div>
      <div class="card">
        <div class="card-label">Avg Temperature</div>
        <div class="card-value">${avgTemp}<span class="card-unit">°C</span></div>
      </div>
      <div class="card">
        <div class="card-label">Total VRAM Used</div>
        <div class="card-value">${Math.round(usedMem)}<span class="card-unit">/ ${Math.round(totalMem)} MB</span></div>
        ${renderProgressBar(totalMem ? (usedMem / totalMem) * 100 : 0, "VRAM usage")}
      </div>
      <div class="card">
        <div class="card-label">Combined Power</div>
        <div class="card-value">${totalPower.toFixed(0)}<span class="card-unit">W</span></div>
      </div>
    </div>`;
}

function buildGpuCards(gpus) {
  return `<div class="gpu-grid">${gpus
    .map(
      (gpu) => `
    <article class="gpu-card">
      <div class="gpu-card-header">
        <div>
          <div class="gpu-name">${gpu.name}</div>
          <div style="font-size:0.75rem;color:var(--color-text-muted);margin-top:4px">${gpu.uuid || ""}</div>
        </div>
        <span class="gpu-index">GPU ${gpu.index}</span>
      </div>
      <div class="gpu-metrics">
        <div class="gpu-metric">
          <div class="gpu-metric-label">GPU Util</div>
          <div class="gpu-metric-value">${formatValue(gpu.gpu_utilization_pct, "%")}</div>
          ${renderProgressBar(gpu.gpu_utilization_pct, "GPU utilization")}
        </div>
        <div class="gpu-metric">
          <div class="gpu-metric-label">Memory Util</div>
          <div class="gpu-metric-value">${formatValue(gpu.memory_utilization_pct, "%")}</div>
          ${renderProgressBar(gpu.memory_utilization_pct, "Memory utilization")}
        </div>
        <div class="gpu-metric">
          <div class="gpu-metric-label">VRAM</div>
          <div class="gpu-metric-value">${formatValue(gpu.memory_used_mb)} / ${formatValue(gpu.memory_total_mb)} MB</div>
        </div>
        <div class="gpu-metric">
          <div class="gpu-metric-label">Temperature</div>
          <div class="gpu-metric-value">${formatValue(gpu.temperature_c, "°C")}</div>
        </div>
        <div class="gpu-metric">
          <div class="gpu-metric-label">Power</div>
          <div class="gpu-metric-value">${formatValue(gpu.power_w, "W")}</div>
        </div>
        <div class="gpu-metric">
          <div class="gpu-metric-label">Fan</div>
          <div class="gpu-metric-value">${formatValue(gpu.fan_speed_pct, "%")}</div>
        </div>
      </div>
      <div style="margin-top:16px;height:80px">
        <canvas id="mini-chart-${gpu.index}" aria-label="GPU ${gpu.index} utilization sparkline"></canvas>
      </div>
    </article>`
    )
    .join("")}</div>`;
}

async function updateCpuMiniChart() {
  const canvas = document.getElementById("cpu-mini-chart");
  if (!canvas) return;

  try {
    const history = await fetchCpuHistory(["cpu_utilization"]);
    const labels = (history.labels || []).map(formatTimeLabel);
    const data = history.datasets?.cpu_utilization || [];

    destroyChart(cpuMiniChart);
    cpuMiniChart = createLineChart(canvas, labels, [
      lineDataset("CPU %", data, CHART_COLORS.success),
    ], {
      plugins: { legend: { display: false } },
      scales: {
        x: { display: false },
        y: { display: false, min: 0, max: 100 },
      },
    });
  } catch {
    /* sparkline is non-critical */
  }
}

async function updateMiniChart(index) {
  const canvas = document.getElementById(`mini-chart-${index}`);
  if (!canvas) return;

  try {
    const history = await fetchHistory(index, ["gpu_utilization"]);
    const labels = (history.labels || []).map(formatTimeLabel);
    const data = history.datasets?.gpu_utilization || [];

    destroyChart(miniCharts[index]);
    miniCharts[index] = createLineChart(canvas, labels, [
      lineDataset("GPU %", data, CHART_COLORS.accent),
    ], {
      plugins: { legend: { display: false } },
      scales: {
        x: { display: false },
        y: { display: false, min: 0, max: 100 },
      },
    });
  } catch {
    /* sparkline is non-critical */
  }
}
