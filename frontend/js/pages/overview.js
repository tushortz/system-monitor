/** Overview page — CPU and GPU summary cards. */

let miniCharts = {};
let cpuMiniChart = null;
let overviewGpuCount = -1;

const SPARKLINE_OPTS = {
  plugins: { legend: { display: false } },
  scales: {
    x: { display: false },
    y: { display: false, min: 0, max: 100 },
  },
};

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
    const gpus = gpuData.gpus;
    const needsRebuild = !content.querySelector("#overview-root") || overviewGpuCount !== gpus.length;

    if (needsRebuild) {
      Object.values(miniCharts).forEach((chart) => destroyChart(chart));
      miniCharts = {};
      destroyChart(cpuMiniChart);
      cpuMiniChart = null;
      overviewGpuCount = gpus.length;
      content.innerHTML =
        `<div id="overview-root">${buildCpuSection(cpu)}${buildSummaryCards(gpus)}${buildGpuCards(gpus)}</div>`;
    } else {
      updateCpuSection(cpu);
      updateSummaryCards(gpus);
      updateGpuCards(gpus);
    }

    updateCpuMiniChart();
    gpus.forEach((_, i) => updateMiniChart(i));
  } catch (err) {
    showError(content, err.message);
  }
}

function buildCpuSection(cpu) {
  const cores = cpu.per_core_pct || [];
  const coreCells = cores
    .map(
      (pct, i) => `
      <div class="core-cell" data-core="${i}">
        <div class="core-cell-label">Core ${i}</div>
        <div class="core-cell-value">${pct}%</div>
        ${renderProgressBar(pct, `Core ${i} utilization`)}
      </div>`
    )
    .join("");

  return `
    <h2 class="section-title">CPU &amp; System</h2>
    <div class="card-grid" id="cpu-summary-cards">
      <div class="card">
        <div class="card-label">CPU Utilization</div>
        <div class="card-value" data-cpu="util">${formatValue(cpu.utilization_pct, "%")}</div>
        ${renderProgressBar(cpu.utilization_pct, "CPU utilization")}
      </div>
      <div class="card">
        <div class="card-label">Cores</div>
        <div class="card-value" data-cpu="cores">${cpu.physical_cores}<span class="card-unit">/ ${cpu.logical_cores} threads</span></div>
      </div>
      <div class="card">
        <div class="card-label">Frequency</div>
        <div class="card-value" data-cpu="freq">${formatValue(cpu.frequency_mhz, "MHz")}</div>
      </div>
      <div class="card">
        <div class="card-label">RAM Used</div>
        <div class="card-value" data-cpu="ram">${Math.round(cpu.memory_used_mb || 0)}<span class="card-unit">/ ${Math.round(cpu.memory_total_mb || 0)} MB</span></div>
        ${renderProgressBar(cpu.memory_used_pct, "RAM usage")}
      </div>
      <div class="card">
        <div class="card-label">Load (1m)</div>
        <div class="card-value" data-cpu="load">${formatValue(cpu.load_1m)}</div>
      </div>
      <div class="card">
        <div class="card-label">Uptime</div>
        <div class="card-value" data-cpu="uptime" style="font-size:1.25rem">${formatUptime(cpu.uptime_seconds)}</div>
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
    <div class="core-grid" id="cpu-core-grid">${coreCells}</div>
    <h2 class="section-title">GPUs</h2>`;
}

function updateCpuSection(cpu) {
  const set = (sel, html) => {
    const el = document.querySelector(sel);
    if (el) el.innerHTML = html;
  };
  set('[data-cpu="util"]', formatValue(cpu.utilization_pct, "%"));
  set('[data-cpu="cores"]', `${cpu.physical_cores}<span class="card-unit">/ ${cpu.logical_cores} threads</span>`);
  set('[data-cpu="freq"]', formatValue(cpu.frequency_mhz, "MHz"));
  set('[data-cpu="ram"]', `${Math.round(cpu.memory_used_mb || 0)}<span class="card-unit">/ ${Math.round(cpu.memory_total_mb || 0)} MB</span>`);
  set('[data-cpu="load"]', formatValue(cpu.load_1m));
  set('[data-cpu="uptime"]', formatUptime(cpu.uptime_seconds));

  const cards = document.getElementById("cpu-summary-cards");
  if (cards) {
    const bars = cards.querySelectorAll(".progress-bar");
    if (bars[0]) updateProgressBar(bars[0], cpu.utilization_pct);
    if (bars[1]) updateProgressBar(bars[1], cpu.memory_used_pct);
  }

  (cpu.per_core_pct || []).forEach((pct, i) => {
    const cell = document.querySelector(`.core-cell[data-core="${i}"]`);
    if (!cell) return;
    const value = cell.querySelector(".core-cell-value");
    if (value) value.textContent = `${pct}%`;
    updateProgressBar(cell.querySelector(".progress-bar"), pct);
  });
}

function buildSummaryCards(gpus) {
  if (!gpus.length) {
    return `<div class="alert alert-info" id="gpu-summary-cards">No GPUs detected.</div>`;
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
    <div class="card-grid" id="gpu-summary-cards">
      <div class="card">
        <div class="card-label">GPUs Detected</div>
        <div class="card-value" data-gpu-summary="count">${gpus.length}</div>
      </div>
      <div class="card">
        <div class="card-label">Avg GPU Utilization</div>
        <div class="card-value" data-gpu-summary="util">${avgUtil}<span class="card-unit">%</span></div>
        ${renderProgressBar(avgUtil, "Average GPU utilization")}
      </div>
      <div class="card">
        <div class="card-label">Avg Temperature</div>
        <div class="card-value" data-gpu-summary="temp">${avgTemp}<span class="card-unit">°C</span></div>
      </div>
      <div class="card">
        <div class="card-label">Total VRAM Used</div>
        <div class="card-value" data-gpu-summary="vram">${Math.round(usedMem)}<span class="card-unit">/ ${Math.round(totalMem)} MB</span></div>
        ${renderProgressBar(totalMem ? (usedMem / totalMem) * 100 : 0, "VRAM usage")}
      </div>
      <div class="card">
        <div class="card-label">Combined Power</div>
        <div class="card-value" data-gpu-summary="power">${totalPower.toFixed(0)}<span class="card-unit">W</span></div>
      </div>
    </div>`;
}

function updateSummaryCards(gpus) {
  if (!gpus.length) return;

  const avgUtil = Math.round(
    gpus.reduce((s, g) => s + (g.gpu_utilization_pct || 0), 0) / gpus.length
  );
  const avgTemp = Math.round(
    gpus.reduce((s, g) => s + (g.temperature_c || 0), 0) / gpus.length
  );
  const totalMem = gpus.reduce((s, g) => s + (g.memory_total_mb || 0), 0);
  const usedMem = gpus.reduce((s, g) => s + (g.memory_used_mb || 0), 0);
  const totalPower = gpus.reduce((s, g) => s + (g.power_w || 0), 0);

  const set = (key, html) => {
    const el = document.querySelector(`[data-gpu-summary="${key}"]`);
    if (el) el.innerHTML = html;
  };
  set("count", String(gpus.length));
  set("util", `${avgUtil}<span class="card-unit">%</span>`);
  set("temp", `${avgTemp}<span class="card-unit">°C</span>`);
  set("vram", `${Math.round(usedMem)}<span class="card-unit">/ ${Math.round(totalMem)} MB</span>`);
  set("power", `${totalPower.toFixed(0)}<span class="card-unit">W</span>`);

  const cards = document.getElementById("gpu-summary-cards");
  if (cards) {
    const bars = cards.querySelectorAll(".progress-bar");
    if (bars[0]) updateProgressBar(bars[0], avgUtil);
    if (bars[1]) updateProgressBar(bars[1], totalMem ? (usedMem / totalMem) * 100 : 0);
  }
}

function buildGpuCards(gpus) {
  return `<div class="gpu-grid" id="gpu-card-grid">${gpus
    .map(
      (gpu) => `
    <article class="gpu-card" data-gpu-card="${gpu.index}">
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
          <div class="gpu-metric-value" data-metric="gpu">${formatValue(gpu.gpu_utilization_pct, "%")}</div>
          ${renderProgressBar(gpu.gpu_utilization_pct, "GPU utilization")}
        </div>
        <div class="gpu-metric">
          <div class="gpu-metric-label">Memory Util</div>
          <div class="gpu-metric-value" data-metric="mem">${formatValue(gpu.memory_utilization_pct, "%")}</div>
          ${renderProgressBar(gpu.memory_utilization_pct, "Memory utilization")}
        </div>
        <div class="gpu-metric">
          <div class="gpu-metric-label">VRAM</div>
          <div class="gpu-metric-value" data-metric="vram">${formatValue(gpu.memory_used_mb)} / ${formatValue(gpu.memory_total_mb)} MB</div>
        </div>
        <div class="gpu-metric">
          <div class="gpu-metric-label">Temperature</div>
          <div class="gpu-metric-value" data-metric="temp">${formatValue(gpu.temperature_c, "°C")}</div>
        </div>
        <div class="gpu-metric">
          <div class="gpu-metric-label">Power</div>
          <div class="gpu-metric-value" data-metric="power">${formatValue(gpu.power_w, "W")}</div>
        </div>
        <div class="gpu-metric">
          <div class="gpu-metric-label">Fan</div>
          <div class="gpu-metric-value" data-metric="fan">${formatValue(gpu.fan_speed_pct, "%")}</div>
        </div>
      </div>
      <div style="margin-top:16px;height:80px">
        <canvas id="mini-chart-${gpu.index}" aria-label="GPU ${gpu.index} utilization sparkline"></canvas>
      </div>
    </article>`
    )
    .join("")}</div>`;
}

function updateGpuCards(gpus) {
  gpus.forEach((gpu) => {
    const card = document.querySelector(`[data-gpu-card="${gpu.index}"]`);
    if (!card) return;

    const set = (metric, text) => {
      const el = card.querySelector(`[data-metric="${metric}"]`);
      if (el) el.textContent = text;
    };
    set("gpu", formatValue(gpu.gpu_utilization_pct, "%"));
    set("mem", formatValue(gpu.memory_utilization_pct, "%"));
    set("vram", `${formatValue(gpu.memory_used_mb)} / ${formatValue(gpu.memory_total_mb)} MB`);
    set("temp", formatValue(gpu.temperature_c, "°C"));
    set("power", formatValue(gpu.power_w, "W"));
    set("fan", formatValue(gpu.fan_speed_pct, "%"));

    const bars = card.querySelectorAll(".progress-bar");
    if (bars[0]) updateProgressBar(bars[0], gpu.gpu_utilization_pct);
    if (bars[1]) updateProgressBar(bars[1], gpu.memory_utilization_pct);
  });
}

async function updateCpuMiniChart() {
  const canvas = document.getElementById("cpu-mini-chart");
  if (!canvas) return;

  try {
    const history = await fetchCpuHistory(["cpu_utilization"]);
    const labels = (history.labels || []).map(formatTimeLabel);
    const data = history.datasets?.cpu_utilization || [];

    cpuMiniChart = upsertLineChart(
      cpuMiniChart,
      canvas,
      labels,
      [lineDataset("CPU %", data, CHART_COLORS.success)],
      SPARKLINE_OPTS
    );
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

    miniCharts[index] = upsertLineChart(
      miniCharts[index],
      canvas,
      labels,
      [lineDataset("GPU %", data, CHART_COLORS.accent)],
      SPARKLINE_OPTS
    );
  } catch {
    /* sparkline is non-critical */
  }
}
