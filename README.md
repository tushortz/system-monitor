# GPU & CPU Monitor Dashboard

A cross-platform real-time GPU, CPU, and system monitoring dashboard with a Python API backend and a multi-page HTML frontend using Chart.js.

Supports **macOS**, **Windows**, and **Linux**.

## Features

### CPU (live via psutil — all platforms)
- **Overview** — CPU summary cards, per-core grid, utilization sparkline
- **CPU Performance** — Utilization history, load average, per-core bar chart, time breakdown
- **RAM & Swap** — Memory doughnut charts and usage history
- **CPU Processes** — Top processes by CPU and memory usage
- **CPU Details** — Complete system info grouped by category (identity, frequency, load, etc.)

### System (live — macOS, Windows, Linux)
- **Overview** — Machine banner, battery, disk, network summary + I/O charts
- **Hardware** — Model, processor, cores, memory (platform-specific sources)
- **Battery** — Charge level, power source, time remaining, history chart
- **Storage** — Volume usage table, disk throughput charts
- **Network** — Interface list, traffic counters, throughput charts

Platform-specific data sources:
| Platform | Hardware | OS version |
|----------|----------|------------|
| macOS | `system_profiler`, `sysctl` | `sw_vers` |
| Linux | `/sys/class/dmi/id`, `/proc/cpuinfo` | `/etc/os-release` |
| Windows | PowerShell CIM (`Win32_*`) | `Win32_OperatingSystem` |

### GPU (live via NVML on Windows/Linux; demo fallback elsewhere)
- **Overview** — Summary cards and per-GPU status with sparkline charts
- **GPU Performance** — Utilization, temperature, power, fan, and clock charts
- **VRAM** — VRAM doughnut chart, process breakdown, and history
- **GPU Processes** — Active compute/graphics workloads on each GPU
- **GPU Details** — Complete GPU information grouped by category

## Requirements

- Python 3.10+
- **GPU**: NVIDIA GPU with drivers on Windows or Linux for live data; demo mode otherwise
- **CPU / System**: always live via `psutil` on macOS, Linux, and Windows

## Quick Start

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

Open [http://localhost:8000](http://localhost:8000) in your browser.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check (GPU mode, CPU cores, platform) |
| GET | `/api/cpu` | CPU summary metrics |
| GET | `/api/cpu/details` | Full CPU and system details |
| GET | `/api/cpu/grouped` | CPU stats grouped by category |
| GET | `/api/cpu/processes` | Top CPU-consuming processes |
| GET | `/api/cpu/history` | CPU time-series data for charts |
| GET | `/api/system` | Cross-platform system summary |
| GET | `/api/system/grouped` | System stats grouped by category |
| GET | `/api/system/hardware` | Hardware profile for current OS |
| GET | `/api/system/battery` | Battery and power source |
| GET | `/api/system/storage` | Disk volumes and I/O |
| GET | `/api/system/network` | Network interfaces and traffic |
| GET | `/api/system/software` | OS and runtime info |
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
│   ├── cpu_collector.py    # psutil CPU metrics
│   ├── system_collector.py # Cross-platform system metrics
│   ├── metrics_store.py    # In-memory metric history
│   └── requirements.txt
└── frontend/
    ├── index.html          # Overview (CPU + GPU)
    ├── system.html         # System overview
    ├── cpu.html            # CPU performance
    └── ...
```

## Notes

- Metrics are polled every 2 seconds and stored in a 120-point ring buffer for charts.
- Live NVIDIA GPU data requires drivers + `pynvml` on **Windows** or **Linux**.
- CPU temperature depends on platform sensors (often unavailable on macOS/Windows laptops).
- Windows hardware details use PowerShell CIM; Linux uses DMI sysfs when accessible.
