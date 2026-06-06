/** Chart.js helpers and theme configuration. */

Chart.defaults.font.family = '"Uber Move Text", "Helvetica Neue", Helvetica, Arial, sans-serif';
Chart.defaults.color = "#545454";
Chart.defaults.borderColor = "#e2e2e2";
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.padding = 16;
Chart.defaults.animation = false;

const CHART_COLORS = {
  accent: "#276ef1",
  success: "#0e8345",
  warning: "#ffc043",
  danger: "#e11900",
  purple: "#7356bf",
  teal: "#0d7474",
};

const CHART_UPDATE_MODE = "none";

/**
 * Destroy a chart instance safely.
 * @param {Chart|null} chart
 */
function destroyChart(chart) {
  if (chart) chart.destroy();
}

/**
 * Insert chart markup once; skip on later refreshes to avoid canvas flicker.
 * @param {HTMLElement|null} container
 * @param {string} html
 */
function ensureChartLayout(container, html) {
  if (!container || container.dataset.chartLayout === "ready") return;
  container.innerHTML = html;
  container.dataset.chartLayout = "ready";
}

/**
 * Build standard line chart dataset config.
 * @param {string} label
 * @param {number[]} data
 * @param {string} color
 * @returns {object}
 */
function lineDataset(label, data, color) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: color + "20",
    fill: true,
    tension: 0.3,
    pointRadius: 0,
    pointHitRadius: 8,
    borderWidth: 2,
  };
}

/**
 * Update an existing line chart in place.
 * @param {Chart} chart
 * @param {string[]} labels
 * @param {object[]} datasets
 */
function updateLineChart(chart, labels, datasets) {
  chart.data.labels = labels;
  datasets.forEach((ds, i) => {
    if (chart.data.datasets[i]) {
      chart.data.datasets[i].data = ds.data;
      chart.data.datasets[i].label = ds.label;
      if (ds.borderColor !== undefined) chart.data.datasets[i].borderColor = ds.borderColor;
      if (ds.backgroundColor !== undefined) chart.data.datasets[i].backgroundColor = ds.backgroundColor;
    } else {
      chart.data.datasets.push({ ...ds });
    }
  });
  chart.data.datasets.length = datasets.length;
  chart.update(CHART_UPDATE_MODE);
}

/**
 * Create a line chart on a canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {string[]} labels
 * @param {object[]} datasets
 * @param {object} [options]
 * @returns {Chart}
 */
function createLineChart(canvas, labels, datasets, options = {}) {
  return new Chart(canvas, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "top" },
        tooltip: { mode: "index", intersect: false },
      },
      scales: {
        x: {
          ticks: { maxTicksLimit: 8, maxRotation: 0 },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          grid: { color: "#f0f0f0" },
        },
      },
      ...options,
    },
  });
}

/**
 * Create or update a line chart without visible refresh.
 * @param {Chart|null} existing
 * @param {HTMLCanvasElement|null} canvas
 * @param {string[]} labels
 * @param {object[]} datasets
 * @param {object} [options]
 * @returns {Chart|null}
 */
function upsertLineChart(existing, canvas, labels, datasets, options = {}) {
  if (!canvas) return existing;
  if (existing?.canvas === canvas) {
    updateLineChart(existing, labels, datasets);
    return existing;
  }
  destroyChart(existing);
  return createLineChart(canvas, labels, datasets, options);
}

/**
 * Update an existing doughnut chart in place.
 * @param {Chart} chart
 * @param {string[]} labels
 * @param {number[]} data
 */
function updateDoughnutChart(chart, labels, data) {
  chart.data.labels = labels;
  chart.data.datasets[0].data = data;
  chart.update(CHART_UPDATE_MODE);
}

/**
 * Create a doughnut chart.
 * @param {HTMLCanvasElement} canvas
 * @param {string[]} labels
 * @param {number[]} data
 * @param {string[]} colors
 * @returns {Chart}
 */
function createDoughnutChart(canvas, labels, data, colors) {
  return new Chart(canvas, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 0,
        hoverOffset: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      cutout: "65%",
      plugins: {
        legend: { position: "bottom" },
      },
    },
  });
}

/**
 * Create or update a doughnut chart without visible refresh.
 * @param {Chart|null} existing
 * @param {HTMLCanvasElement|null} canvas
 * @param {string[]} labels
 * @param {number[]} data
 * @param {string[]} colors
 * @returns {Chart|null}
 */
function upsertDoughnutChart(existing, canvas, labels, data, colors) {
  if (!canvas) return existing;
  if (existing?.canvas === canvas) {
    updateDoughnutChart(existing, labels, data);
    return existing;
  }
  destroyChart(existing);
  return createDoughnutChart(canvas, labels, data, colors);
}

/**
 * Update an existing bar chart in place.
 * @param {Chart} chart
 * @param {string[]} labels
 * @param {object[]} datasets
 */
function updateBarChart(chart, labels, datasets) {
  chart.data.labels = labels;
  datasets.forEach((ds, i) => {
    if (chart.data.datasets[i]) {
      chart.data.datasets[i].data = ds.data;
      chart.data.datasets[i].label = ds.label;
      if (ds.backgroundColor !== undefined) chart.data.datasets[i].backgroundColor = ds.backgroundColor;
      if (ds.borderRadius !== undefined) chart.data.datasets[i].borderRadius = ds.borderRadius;
    } else {
      chart.data.datasets.push({ ...ds });
    }
  });
  chart.data.datasets.length = datasets.length;
  chart.update(CHART_UPDATE_MODE);
}

/**
 * Create a bar chart.
 * @param {HTMLCanvasElement} canvas
 * @param {string[]} labels
 * @param {object[]} datasets
 * @returns {Chart}
 */
function createBarChart(canvas, labels, datasets) {
  return new Chart(canvas, {
    type: "bar",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: datasets.length > 1 } },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, grid: { color: "#f0f0f0" } },
      },
    },
  });
}

/**
 * Create or update a bar chart without visible refresh.
 * @param {Chart|null} existing
 * @param {HTMLCanvasElement|null} canvas
 * @param {string[]} labels
 * @param {object[]} datasets
 * @returns {Chart|null}
 */
function upsertBarChart(existing, canvas, labels, datasets) {
  if (!canvas) return existing;
  if (existing?.canvas === canvas) {
    updateBarChart(existing, labels, datasets);
    return existing;
  }
  destroyChart(existing);
  return createBarChart(canvas, labels, datasets);
}

/**
 * Update an existing radar chart in place.
 * @param {Chart} chart
 * @param {string[]} labels
 * @param {number[]} data
 */
function updateRadarChart(chart, labels, data) {
  chart.data.labels = labels;
  chart.data.datasets[0].data = data;
  chart.update(CHART_UPDATE_MODE);
}

/**
 * Create a radar chart for multi-metric snapshot.
 * @param {HTMLCanvasElement} canvas
 * @param {string[]} labels
 * @param {number[]} data
 * @returns {Chart}
 */
function createRadarChart(canvas, labels, data) {
  return new Chart(canvas, {
    type: "radar",
    data: {
      labels,
      datasets: [{
        label: "Current %",
        data,
        borderColor: CHART_COLORS.accent,
        backgroundColor: CHART_COLORS.accent + "30",
        borderWidth: 2,
        pointRadius: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        r: {
          beginAtZero: true,
          max: 100,
          ticks: { stepSize: 25 },
          grid: { color: "#e2e2e2" },
        },
      },
      plugins: { legend: { display: false } },
    },
  });
}

/**
 * Create or update a radar chart without visible refresh.
 * @param {Chart|null} existing
 * @param {HTMLCanvasElement|null} canvas
 * @param {string[]} labels
 * @param {number[]} data
 * @returns {Chart|null}
 */
function upsertRadarChart(existing, canvas, labels, data) {
  if (!canvas) return existing;
  if (existing?.canvas === canvas) {
    updateRadarChart(existing, labels, data);
    return existing;
  }
  destroyChart(existing);
  return createRadarChart(canvas, labels, data);
}

/**
 * Map history API response to chart-ready labels and datasets.
 * @param {object} history
 * @param {object<string, {label: string, color: string}>} metricConfig
 * @returns {{labels: string[], datasets: object[]}}
 */
function historyToDatasets(history, metricConfig) {
  const labels = (history.labels || []).map(formatTimeLabel);
  const datasets = Object.entries(metricConfig)
    .filter(([key]) => history.datasets?.[key])
    .map(([key, cfg]) =>
      lineDataset(cfg.label, history.datasets[key], cfg.color)
    );
  return { labels, datasets };
}
