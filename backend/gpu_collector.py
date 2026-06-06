"""GPU data collection via NVML with demo-mode fallback."""

import math
import random
import time
from abc import ABC, abstractmethod
from typing import Any

try:
    import pynvml

    _NVML_AVAILABLE = True
except ImportError:
    _NVML_AVAILABLE = False


class GpuCollector(ABC):
    """Abstract GPU metrics collector."""

    @abstractmethod
    def is_available(self) -> bool:
        """Return True when GPU data can be collected."""

    @abstractmethod
    def get_mode(self) -> str:
        """Return collector mode label (live or demo)."""

    @abstractmethod
    def get_driver_info(self) -> dict[str, Any]:
        """Return driver and NVML version info."""

    @abstractmethod
    def get_gpu_count(self) -> int:
        """Return number of GPUs."""

    @abstractmethod
    def get_gpu_summary(self, index: int) -> dict[str, Any]:
        """Return compact GPU summary for overview cards."""

    @abstractmethod
    def get_gpu_details(self, index: int) -> dict[str, Any]:
        """Return full GPU details."""

    @abstractmethod
    def get_chart_metrics(self, index: int) -> dict[str, float]:
        """Return numeric metrics for history charts."""

    @abstractmethod
    def shutdown(self) -> None:
        """Release collector resources."""


class NvmlCollector(GpuCollector):
    """Collect GPU metrics from NVIDIA NVML."""

    def __init__(self) -> None:
        self._initialized = False
        self._handles: list[Any] = []
        if _NVML_AVAILABLE:
            try:
                pynvml.nvmlInit()
                count = pynvml.nvmlDeviceGetCount()
                self._handles = [pynvml.nvmlDeviceGetHandleByIndex(i) for i in range(count)]
                self._initialized = count > 0
            except Exception:
                self._initialized = False

    def is_available(self) -> bool:
        return self._initialized

    def get_mode(self) -> str:
        return "live"

    def get_driver_info(self) -> dict[str, Any]:
        if not self._initialized:
            return {}
        try:
            driver = pynvml.nvmlSystemGetDriverVersion()
            nvml = pynvml.nvmlSystemGetNVMLVersion()
            cuda = None
            try:
                cuda = pynvml.nvmlSystemGetCudaDriverVersion_v2()
            except Exception:
                pass
            return {"driver_version": driver, "nvml_version": nvml, "cuda_driver_version": cuda}
        except Exception as exc:
            return {"error": str(exc)}

    def get_gpu_count(self) -> int:
        return len(self._handles)

    def _safe(self, fn: Any, default: Any = None) -> Any:
        try:
            return fn()
        except Exception:
            return default

    def get_gpu_summary(self, index: int) -> dict[str, Any]:
        details = self.get_gpu_details(index)
        mem = details.get("memory", {})
        util = details.get("utilization", {})
        return {
            "index": index,
            "name": details.get("name"),
            "uuid": details.get("uuid"),
            "temperature_c": details.get("temperature", {}).get("gpu_c"),
            "power_w": details.get("power", {}).get("usage_w"),
            "gpu_utilization_pct": util.get("gpu_pct"),
            "memory_utilization_pct": util.get("memory_pct"),
            "memory_used_mb": mem.get("used_mb"),
            "memory_total_mb": mem.get("total_mb"),
            "fan_speed_pct": details.get("fan", {}).get("speed_pct"),
        }

    def get_gpu_details(self, index: int) -> dict[str, Any]:
        handle = self._handles[index]
        name = self._safe(lambda: pynvml.nvmlDeviceGetName(handle), "Unknown")
        if isinstance(name, bytes):
            name = name.decode("utf-8")

        mem_info = self._safe(lambda: pynvml.nvmlDeviceGetMemoryInfo(handle))
        util = self._safe(lambda: pynvml.nvmlDeviceGetUtilizationRates(handle))
        temp = self._safe(lambda: pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU))
        power = self._safe(lambda: pynvml.nvmlDeviceGetPowerUsage(handle))
        power_limit = self._safe(lambda: pynvml.nvmlDeviceGetEnforcedPowerLimit(handle))
        fan = self._safe(lambda: pynvml.nvmlDeviceGetFanSpeed(handle))
        clocks = self._safe(lambda: pynvml.nvmlDeviceGetClockInfo(handle, pynvml.NVML_CLOCK_GRAPHICS))
        mem_clock = self._safe(lambda: pynvml.nvmlDeviceGetClockInfo(handle, pynvml.NVML_CLOCK_MEM))
        sm_clock = self._safe(lambda: pynvml.nvmlDeviceGetClockInfo(handle, pynvml.NVML_CLOCK_SM))
        pci = self._safe(lambda: pynvml.nvmlDeviceGetCurrPcieLinkGeneration(handle))
        pci_width = self._safe(lambda: pynvml.nvmlDeviceGetCurrPcieLinkWidth(handle))
        ecc = self._safe(lambda: pynvml.nvmlDeviceGetTotalEccErrors(
            handle, pynvml.NVML_MEMORY_ERROR_TYPE_CORRECTED, pynvml.NVML_VOLATILE_ECC
        ))
        compute = self._safe(lambda: pynvml.nvmlDeviceGetCudaComputeCapability(handle))
        processes = self._get_processes(handle)

        memory = {}
        if mem_info:
            memory = {
                "total_mb": round(mem_info.total / (1024 ** 2), 1),
                "used_mb": round(mem_info.used / (1024 ** 2), 1),
                "free_mb": round(mem_info.free / (1024 ** 2), 1),
                "used_pct": round((mem_info.used / mem_info.total) * 100, 1) if mem_info.total else 0,
            }

        return {
            "index": index,
            "name": name,
            "uuid": self._safe(lambda: pynvml.nvmlDeviceGetUUID(handle)),
            "serial": self._safe(lambda: pynvml.nvmlDeviceGetSerial(handle)),
            "vbios_version": self._safe(lambda: pynvml.nvmlDeviceGetVbiosVersion(handle)),
            "driver_model": self._safe(lambda: pynvml.nvmlDeviceGetDriverModel(handle)),
            "memory": memory,
            "utilization": {
                "gpu_pct": util.gpu if util else None,
                "memory_pct": util.memory if util else None,
            },
            "temperature": {"gpu_c": temp},
            "power": {
                "usage_w": round(power / 1000, 1) if power is not None else None,
                "limit_w": round(power_limit / 1000, 1) if power_limit is not None else None,
            },
            "fan": {"speed_pct": fan},
            "clocks_mhz": {
                "graphics": clocks,
                "memory": mem_clock,
                "sm": sm_clock,
            },
            "pcie": {"generation": pci, "width": pci_width},
            "ecc_corrected_errors": ecc,
            "compute_capability": f"{compute[0]}.{compute[1]}" if compute else None,
            "processes": processes,
        }

    def _get_processes(self, handle: Any) -> list[dict[str, Any]]:
        procs: list[dict[str, Any]] = []
        try:
            for proc in pynvml.nvmlDeviceGetComputeRunningProcesses(handle):
                procs.append({
                    "pid": proc.pid,
                    "memory_mb": round(proc.usedGpuMemory / (1024 ** 2), 1) if proc.usedGpuMemory else 0,
                    "type": "compute",
                })
        except Exception:
            pass
        try:
            for proc in pynvml.nvmlDeviceGetGraphicsRunningProcesses(handle):
                procs.append({
                    "pid": proc.pid,
                    "memory_mb": round(proc.usedGpuMemory / (1024 ** 2), 1) if proc.usedGpuMemory else 0,
                    "type": "graphics",
                })
        except Exception:
            pass
        return procs

    def get_chart_metrics(self, index: int) -> dict[str, float]:
        summary = self.get_gpu_summary(index)
        mem = summary.get("memory_total_mb") or 1
        used = summary.get("memory_used_mb") or 0
        return {
            "gpu_utilization": float(summary.get("gpu_utilization_pct") or 0),
            "memory_utilization": float(summary.get("memory_utilization_pct") or 0),
            "temperature": float(summary.get("temperature_c") or 0),
            "power": float(summary.get("power_w") or 0),
            "memory_used_pct": round((used / mem) * 100, 1),
            "fan_speed": float(summary.get("fan_speed_pct") or 0),
        }

    def shutdown(self) -> None:
        if self._initialized and _NVML_AVAILABLE:
            try:
                pynvml.nvmlShutdown()
            except Exception:
                pass


class DemoCollector(GpuCollector):
    """Simulated GPU data for development without NVIDIA hardware."""

    GPU_NAMES = ["NVIDIA GeForce RTX 4090", "NVIDIA GeForce RTX 3080"]

    def __init__(self, gpu_count: int = 2) -> None:
        self._gpu_count = gpu_count
        self._start = time.time()
        random.seed(42)

    def is_available(self) -> bool:
        return True

    def get_mode(self) -> str:
        return "demo"

    def get_driver_info(self) -> dict[str, Any]:
        return {
            "driver_version": "550.90.07 (demo)",
            "nvml_version": "12.550.90 (demo)",
            "cuda_driver_version": 12040,
            "note": "Demo mode — no NVIDIA GPU detected",
        }

    def get_gpu_count(self) -> int:
        return self._gpu_count

    def _wave(self, offset: float, base: float, amplitude: float) -> float:
        t = time.time() - self._start
        return base + amplitude * math.sin(t / 8 + offset)

    def get_gpu_summary(self, index: int) -> dict[str, Any]:
        details = self.get_gpu_details(index)
        mem = details["memory"]
        return {
            "index": index,
            "name": details["name"],
            "uuid": details["uuid"],
            "temperature_c": details["temperature"]["gpu_c"],
            "power_w": details["power"]["usage_w"],
            "gpu_utilization_pct": details["utilization"]["gpu_pct"],
            "memory_utilization_pct": details["utilization"]["memory_pct"],
            "memory_used_mb": mem["used_mb"],
            "memory_total_mb": mem["total_mb"],
            "fan_speed_pct": details["fan"]["speed_pct"],
        }

    def get_gpu_details(self, index: int) -> dict[str, Any]:
        total_mb = 24576 if index == 0 else 10240
        used_pct = self._wave(index, 55, 25)
        used_mb = round(total_mb * used_pct / 100, 1)
        gpu_util = round(self._wave(index + 1, 62, 30), 1)
        mem_util = round(self._wave(index + 2, 48, 20), 1)
        temp = round(self._wave(index + 3, 68, 12), 1)
        power = round(self._wave(index + 4, 220 if index == 0 else 180, 40), 1)

        return {
            "index": index,
            "name": self.GPU_NAMES[index % len(self.GPU_NAMES)],
            "uuid": f"GPU-DEMO-{index:04d}-UUID",
            "serial": f"DEMO-SN-{1000 + index}",
            "vbios_version": "94.02.42.00.01",
            "driver_model": "WDDM",
            "memory": {
                "total_mb": total_mb,
                "used_mb": used_mb,
                "free_mb": round(total_mb - used_mb, 1),
                "used_pct": round(used_pct, 1),
            },
            "utilization": {"gpu_pct": gpu_util, "memory_pct": mem_util},
            "temperature": {"gpu_c": temp},
            "power": {"usage_w": power, "limit_w": 450 if index == 0 else 320},
            "fan": {"speed_pct": round(self._wave(index + 5, 45, 20), 1)},
            "clocks_mhz": {
                "graphics": round(self._wave(index, 1800, 200)),
                "memory": round(self._wave(index, 9500, 500)),
                "sm": round(self._wave(index, 1750, 180)),
            },
            "pcie": {"generation": 4, "width": 16},
            "ecc_corrected_errors": 0,
            "compute_capability": "8.9" if index == 0 else "8.6",
            "processes": [
                {"pid": 12345 + index, "memory_mb": round(used_mb * 0.4, 1), "type": "compute"},
                {"pid": 23456 + index, "memory_mb": round(used_mb * 0.25, 1), "type": "graphics"},
            ],
        }

    def get_chart_metrics(self, index: int) -> dict[str, float]:
        summary = self.get_gpu_summary(index)
        return {
            "gpu_utilization": float(summary["gpu_utilization_pct"]),
            "memory_utilization": float(summary["memory_utilization_pct"]),
            "temperature": float(summary["temperature_c"]),
            "power": float(summary["power_w"]),
            "memory_used_pct": float(summary["memory_used_mb"] / summary["memory_total_mb"] * 100),
            "fan_speed": float(summary["fan_speed_pct"]),
        }

    def shutdown(self) -> None:
        pass


def create_collector() -> GpuCollector:
    """Instantiate live NVML collector or demo fallback."""
    nvml = NvmlCollector()
    if nvml.is_available():
        return nvml
    nvml.shutdown()
    return DemoCollector()
