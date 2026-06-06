/** Chart.js helpers and theme configuration. */

Chart.defaults.font.family = '"Uber Move Text", "Helvetica Neue", Helvetica, Arial, sans-serif';
Chart.defaults.color = "#545454";
Chart.defaults.borderColor = "#e2e2e2";
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.padding = 16;

const CHART_COLORS = {
  accent: "#276ef1",
  success: "#0e8345",
  warning: "#ffc043",
  danger: "#e11900",
  purple: "#7356bf",
  teal: "#0d7474",
};

/**
 * Destroy a chart instance safely.
 * @param {Chart|null} chart
 */
function destroyChart(chart) {
  if (chart) chart.destroy();
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
      cutout: "65%",
      plugins: {
        legend: { position: "bottom" },
      },
    },
  });
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
      plugins: { legend: { display: datasets.length > 1 } },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, grid: { color: "#f0f0f0" } },
      },
    },
  });
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
