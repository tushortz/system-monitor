"""FastAPI backend for GPU and CPU monitor dashboard."""

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from cpu_collector import CpuCollector
from gpu_collector import GpuCollector, create_collector
from metrics_store import MetricsStore
from system_collector import SystemCollector

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
POLL_INTERVAL_SEC = 2.0
CPU_HISTORY_INDEX = 0
SYSTEM_HISTORY_INDEX = 0

collector: GpuCollector
cpu_collector: CpuCollector
system_collector: SystemCollector
metrics_store: MetricsStore
cpu_metrics_store: MetricsStore
system_metrics_store: MetricsStore
_poll_task: asyncio.Task[None] | None = None


async def _poll_metrics() -> None:
    """Background task that samples GPU, CPU, and system metrics for chart history."""
    while True:
        try:
            for i in range(collector.get_gpu_count()):
                metrics_store.append(i, collector.get_chart_metrics(i))

            cpu_metrics_store.append(CPU_HISTORY_INDEX, cpu_collector.get_chart_metrics())
            for core in range(cpu_collector.get_core_count()):
                cpu_metrics_store.append(core + 1, cpu_collector.get_core_chart_metrics(core))

            system_metrics_store.append(
                SYSTEM_HISTORY_INDEX, system_collector.get_chart_metrics()
            )
        except Exception:
            pass
        await asyncio.sleep(POLL_INTERVAL_SEC)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage collector lifecycle and metric polling."""
    global collector, cpu_collector, system_collector
    global metrics_store, cpu_metrics_store, system_metrics_store, _poll_task
    collector = create_collector()
    cpu_collector = CpuCollector()
    system_collector = SystemCollector()
    metrics_store = MetricsStore(max_points=120)
    cpu_metrics_store = MetricsStore(max_points=120)
    system_metrics_store = MetricsStore(max_points=120)
    _poll_task = asyncio.create_task(_poll_metrics())
    yield
    if _poll_task:
        _poll_task.cancel()
        try:
            await _poll_task
        except asyncio.CancelledError:
            pass
    collector.shutdown()
    cpu_collector.shutdown()
    system_collector.shutdown()


app = FastAPI(title="GPU & CPU Monitor API", version="1.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

if FRONTEND_DIR.is_dir():
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/api/health")
def health() -> dict[str, Any]:
    """Health check with GPU and CPU collector status."""
    return {
        "status": "ok",
        "mode": collector.get_mode(),
        "gpu_count": collector.get_gpu_count(),
        "cpu_mode": cpu_collector.get_mode(),
        "cpu_cores": cpu_collector.get_core_count(),
        "system_mode": system_collector.get_mode(),
        "platform": system_collector.get_platform(),
    }


@app.get("/api/driver")
def driver_info() -> dict[str, Any]:
    """Return NVIDIA driver and NVML version info."""
    return collector.get_driver_info()


@app.get("/api/gpus")
def list_gpus() -> dict[str, Any]:
    """List all GPUs with summary metrics."""
    count = collector.get_gpu_count()
    return {
        "mode": collector.get_mode(),
        "count": count,
        "gpus": [collector.get_gpu_summary(i) for i in range(count)],
    }


@app.get("/api/gpus/{gpu_index}")
def gpu_details(gpu_index: int) -> dict[str, Any]:
    """Return full details for a single GPU."""
    _validate_gpu_index(gpu_index)
    return collector.get_gpu_details(gpu_index)


@app.get("/api/gpus/{gpu_index}/processes")
def gpu_processes(gpu_index: int) -> dict[str, Any]:
    """Return processes running on a GPU."""
    _validate_gpu_index(gpu_index)
    details = collector.get_gpu_details(gpu_index)
    return {"index": gpu_index, "processes": details.get("processes", [])}


@app.get("/api/gpus/{gpu_index}/history")
def gpu_history(gpu_index: int, metrics: str | None = None) -> dict[str, Any]:
    """Return time-series GPU history for chart rendering."""
    _validate_gpu_index(gpu_index)
    keys = [k.strip() for k in metrics.split(",")] if metrics else None
    return metrics_store.get_history(gpu_index, keys)


@app.get("/api/gpus/{gpu_index}/grouped")
def gpu_grouped_stats(gpu_index: int) -> dict[str, Any]:
    """Return GPU stats organized by category for detail pages."""
    _validate_gpu_index(gpu_index)
    d = collector.get_gpu_details(gpu_index)
    return {
        "index": gpu_index,
        "identity": {
            "name": d.get("name"),
            "uuid": d.get("uuid"),
            "serial": d.get("serial"),
            "vbios_version": d.get("vbios_version"),
            "compute_capability": d.get("compute_capability"),
        },
        "performance": {
            "gpu_utilization_pct": d.get("utilization", {}).get("gpu_pct"),
            "memory_utilization_pct": d.get("utilization", {}).get("memory_pct"),
            "clocks_mhz": d.get("clocks_mhz"),
            "temperature_c": d.get("temperature", {}).get("gpu_c"),
            "fan_speed_pct": d.get("fan", {}).get("speed_pct"),
        },
        "memory": d.get("memory", {}),
        "power": d.get("power", {}),
        "pcie": d.get("pcie", {}),
        "reliability": {"ecc_corrected_errors": d.get("ecc_corrected_errors")},
        "processes": d.get("processes", []),
    }


@app.get("/api/cpu")
def cpu_summary() -> dict[str, Any]:
    """Return CPU summary metrics."""
    return {
        "mode": cpu_collector.get_mode(),
        "summary": cpu_collector.get_summary(),
    }


@app.get("/api/cpu/details")
def cpu_details() -> dict[str, Any]:
    """Return full CPU and system details."""
    return cpu_collector.get_details()


@app.get("/api/cpu/grouped")
def cpu_grouped_stats() -> dict[str, Any]:
    """Return CPU stats organized by category."""
    return cpu_collector.get_grouped_stats()


@app.get("/api/cpu/processes")
def cpu_processes(limit: int = 15) -> dict[str, Any]:
    """Return top CPU-consuming processes."""
    safe_limit = max(1, min(limit, 50))
    return {"processes": cpu_collector.get_top_processes(safe_limit)}


@app.get("/api/cpu/history")
def cpu_history(metrics: str | None = None, core: int | None = None) -> dict[str, Any]:
    """Return time-series CPU history for chart rendering."""
    index = CPU_HISTORY_INDEX if core is None else core + 1
    if core is not None and (core < 0 or core >= cpu_collector.get_core_count()):
        raise HTTPException(status_code=404, detail="CPU core not found")
    keys = [k.strip() for k in metrics.split(",")] if metrics else None
    return cpu_metrics_store.get_history(index, keys)


@app.get("/api/system")
def system_summary() -> dict[str, Any]:
    """Return cross-platform system summary metrics."""
    return {
        "mode": system_collector.get_mode(),
        "platform": system_collector.get_platform(),
        "summary": system_collector.get_summary(),
    }


@app.get("/api/system/grouped")
def system_grouped_stats() -> dict[str, Any]:
    """Return system stats organized by category."""
    return system_collector.get_grouped_stats()


@app.get("/api/system/hardware")
def system_hardware() -> dict[str, Any]:
    """Return hardware profile for the current platform."""
    return system_collector.get_hardware()


@app.get("/api/system/battery")
def system_battery() -> dict[str, Any]:
    """Return battery and power source status."""
    return system_collector.get_battery()


@app.get("/api/system/storage")
def system_storage() -> dict[str, Any]:
    """Return disk volumes and I/O statistics."""
    return system_collector.get_storage()


@app.get("/api/system/network")
def system_network() -> dict[str, Any]:
    """Return network interfaces and traffic counters."""
    return system_collector.get_network()


@app.get("/api/system/software")
def system_software() -> dict[str, Any]:
    """Return operating system and runtime software information."""
    return system_collector.get_software()


@app.get("/api/system/history")
def system_history(metrics: str | None = None) -> dict[str, Any]:
    """Return time-series system history for chart rendering."""
    keys = [k.strip() for k in metrics.split(",")] if metrics else None
    return system_metrics_store.get_history(SYSTEM_HISTORY_INDEX, keys)


def _validate_gpu_index(gpu_index: int) -> None:
    if gpu_index < 0 or gpu_index >= collector.get_gpu_count():
        raise HTTPException(status_code=404, detail="GPU not found")


def _serve_page(filename: str) -> FileResponse:
    path = FRONTEND_DIR / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Page not found")
    return FileResponse(path)


@app.get("/")
def index_page() -> FileResponse:
    return _serve_page("index.html")


@app.get("/performance")
def performance_page() -> FileResponse:
    return _serve_page("performance.html")


@app.get("/memory")
def memory_page() -> FileResponse:
    return _serve_page("memory.html")


@app.get("/processes")
def processes_page() -> FileResponse:
    return _serve_page("processes.html")


@app.get("/details")
def details_page() -> FileResponse:
    return _serve_page("details.html")


@app.get("/cpu")
def cpu_page() -> FileResponse:
    return _serve_page("cpu.html")


@app.get("/cpu-memory")
def cpu_memory_page() -> FileResponse:
    return _serve_page("cpu-memory.html")


@app.get("/cpu-processes")
def cpu_processes_page() -> FileResponse:
    return _serve_page("cpu-processes.html")


@app.get("/cpu-details")
def cpu_details_page() -> FileResponse:
    return _serve_page("cpu-details.html")


@app.get("/system")
def system_page() -> FileResponse:
    return _serve_page("system.html")


@app.get("/system-hardware")
def system_hardware_page() -> FileResponse:
    return _serve_page("system-hardware.html")


@app.get("/system-battery")
def system_battery_page() -> FileResponse:
    return _serve_page("system-battery.html")


@app.get("/system-storage")
def system_storage_page() -> FileResponse:
    return _serve_page("system-storage.html")


@app.get("/system-network")
def system_network_page() -> FileResponse:
    return _serve_page("system-network.html")
