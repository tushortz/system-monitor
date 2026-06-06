# GPU & CPU Monitor Dashboard

A real-time GPU and CPU monitoring dashboard with a Python API backend and a multi-page HTML frontend using Chart.js.

## Features

### CPU (live via psutil)
- **Overview** — CPU summary cards, per-core grid, utilization sparkline
- **CPU Performance** — Utilization history, load average, per-core bar chart, time breakdown
- **RAM & Swap** — Memory doughnut charts and usage history
- **CPU Processes** — Top processes by CPU and memory usage
- **CPU Details** — Complete system info grouped by category (identity, frequency, load, etc.)

### System — MacBook (live via psutil & macOS tools)
- **Overview** — Machine banner, battery, disk, network summary + I/O charts
- **Hardware** — Model, chip, cores, memory, firmware, macOS version
- **Battery** — Charge level, power source, time remaining, history chart
- **Storage** — Volume usage table, disk throughput charts
- **Network** — Interface list, traffic counters, throughput charts

### GPU (live via NVML, demo fallback)
- **Overview** — Summary cards and per-GPU status with sparkline charts
- **GPU Performance** — Utilization, temperature, power, fan, and clock charts
- **VRAM** — VRAM doughnut chart, process breakdown, and history
- **GPU Processes** — Active compute/graphics workloads on each GPU
- **GPU Details** — Complete GPU information grouped by category

## Requirements

- Python 3.10+
- NVIDIA GPU with drivers (for live GPU data)
- Without an NVIDIA GPU, GPU metrics run in **demo mode** with simulated data
- CPU metrics are always **live** via `psutil` (macOS, Linux, Windows)

## Quick Start

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

Open [http://localhost:8000](http://localhost:8000) in your browser.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check (GPU mode, CPU cores) |
| GET | `/api/cpu` | CPU summary metrics |
| GET | `/api/cpu/details` | Full CPU and system details |
| GET | `/api/cpu/grouped` | CPU stats grouped by category |
| GET | `/api/cpu/processes` | Top CPU-consuming processes |
| GET | `/api/cpu/history` | CPU time-series data for charts |
| GET | `/api/system` | MacBook system summary |
| GET | `/api/system/grouped` | System stats grouped by category |
| GET | `/api/system/hardware` | Mac hardware profile |
| GET | `/api/system/battery` | Battery and power source |
| GET | `/api/system/storage` | Disk volumes and I/O |
| GET | `/api/system/network` | Network interfaces and traffic |
| GET | `/api/system/software` | macOS and runtime info |
| GET | `/api/system/history` | System time-series data for charts |
| GET | `/api/driver` | NVIDIA driver and NVML version info |
| GET | `/api/gpus` | List all GPUs with summary stats |
| GET | `/api/gpus/{index}` | Full details for one GPU |
| GET | `/api/gpus/{index}/grouped` | GPU stats grouped by category |
| GET | `/api/gpus/{index}/processes` | Running GPU processes |
| GET | `/api/gpus/{index}/history` | GPU time-series data for charts |

## Project Structure

```
gpu-monitor/
├── backend/
│   ├── app.py              # FastAPI application
│   ├── gpu_collector.py    # NVML + demo GPU data collection
│   ├── cpu_collector.py    # psutil CPU/system metrics
│   ├── metrics_store.py    # In-memory metric history
│   └── requirements.txt
└── frontend/
    ├── index.html          # Overview (CPU + GPU)
    ├── cpu.html            # CPU performance
    ├── cpu-memory.html     # RAM & swap
    ├── cpu-processes.html  # CPU processes
    ├── cpu-details.html    # CPU details
    ├── performance.html    # GPU performance
    ├── memory.html         # GPU VRAM
    ├── processes.html      # GPU processes
    ├── details.html        # GPU details
    ├── css/styles.css
    └── js/
        ├── api.js
        ├── common.js
        ├── charts.js
        └── pages/
```

## Notes

- Metrics are polled every 2 seconds and stored in a 120-point ring buffer for charts.
- On Linux servers with NVIDIA GPUs, install the NVIDIA driver and `pynvml` for live GPU data.
- CPU temperature is shown when supported by platform sensors (may be unavailable on macOS).
