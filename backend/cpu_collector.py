"""CPU and system metrics collection via psutil."""

import platform
import time
from datetime import datetime, timezone
from typing import Any

import psutil


class CpuCollector:
    """Collect live CPU, memory, and system metrics."""

    def __init__(self) -> None:
        self._boot_time = psutil.boot_time()
        psutil.cpu_percent(interval=None)
        psutil.cpu_percent(interval=None, percpu=True)

    def get_mode(self) -> str:
        """Return collector mode label."""
        return "live"

    def get_summary(self) -> dict[str, Any]:
        """Return compact CPU summary for overview cards."""
        details = self.get_details()
        util = details["utilization"]
        mem = details["memory"]
        freq = details["frequency"]
        return {
            "utilization_pct": util["overall_pct"],
            "per_core_pct": util["per_core_pct"],
            "physical_cores": details["identity"]["physical_cores"],
            "logical_cores": details["identity"]["logical_cores"],
            "frequency_mhz": freq.get("current_mhz"),
            "memory_used_mb": mem.get("used_mb"),
            "memory_total_mb": mem.get("total_mb"),
            "memory_used_pct": mem.get("used_pct"),
            "load_1m": details.get("load", {}).get("load_1m"),
            "temperature_c": details.get("temperature", {}).get("cpu_c"),
            "uptime_seconds": details.get("uptime_seconds"),
        }

    def get_details(self) -> dict[str, Any]:
        """Return full CPU and system details."""
        logical = psutil.cpu_count(logical=True) or 1
        physical = psutil.cpu_count(logical=False) or logical
        overall = psutil.cpu_percent(interval=None)
        per_core = psutil.cpu_percent(interval=None, percpu=True)
        times = psutil.cpu_times_percent(interval=None)
        freq = psutil.cpu_freq()
        mem = psutil.virtual_memory()
        swap = psutil.swap_memory()

        current_mhz = self._normalize_frequency(freq.current if freq else None)
        min_mhz = self._normalize_frequency(freq.min if freq else None)
        max_mhz = self._normalize_frequency(freq.max if freq else None)

        freq_per_core = self._safe_freq_per_core()
        load = self._get_load_average()
        temperature = self._get_cpu_temperature()

        return {
            "identity": {
                "hostname": platform.node(),
                "system": platform.system(),
                "release": platform.release(),
                "architecture": platform.machine(),
                "processor": platform.processor() or "Unknown",
                "physical_cores": physical,
                "logical_cores": logical,
            },
            "utilization": {
                "overall_pct": round(overall, 1),
                "per_core_pct": [round(v, 1) for v in per_core],
            },
            "frequency": {
                "current_mhz": current_mhz,
                "min_mhz": min_mhz,
                "max_mhz": max_mhz,
                "per_core_mhz": freq_per_core,
            },
            "times_pct": {
                "user": round(times.user, 1),
                "system": round(times.system, 1),
                "idle": round(times.idle, 1),
                "iowait": round(getattr(times, "iowait", 0) or 0, 1),
                "irq": round(getattr(times, "irq", 0) or 0, 1),
                "softirq": round(getattr(times, "softirq", 0) or 0, 1),
            },
            "memory": {
                "total_mb": round(mem.total / (1024 ** 2), 1),
                "available_mb": round(mem.available / (1024 ** 2), 1),
                "used_mb": round(mem.used / (1024 ** 2), 1),
                "free_mb": round(mem.free / (1024 ** 2), 1),
                "used_pct": round(mem.percent, 1),
            },
            "swap": {
                "total_mb": round(swap.total / (1024 ** 2), 1),
                "used_mb": round(swap.used / (1024 ** 2), 1),
                "free_mb": round(swap.free / (1024 ** 2), 1),
                "used_pct": round(swap.percent, 1),
            },
            "load": load,
            "temperature": temperature,
            "boot_time": datetime.fromtimestamp(self._boot_time, tz=timezone.utc).isoformat(),
            "uptime_seconds": round(time.time() - self._boot_time),
        }

    def get_grouped_stats(self) -> dict[str, Any]:
        """Return stats organized by category for detail pages."""
        d = self.get_details()
        return {
            "identity": d["identity"],
            "utilization": {
                "overall_pct": d["utilization"]["overall_pct"],
                "per_core_pct": d["utilization"]["per_core_pct"],
                "times_pct": d["times_pct"],
            },
            "frequency": d["frequency"],
            "memory": d["memory"],
            "swap": d["swap"],
            "load": d["load"],
            "temperature": d["temperature"],
            "system": {
                "boot_time": d["boot_time"],
                "uptime_seconds": d["uptime_seconds"],
            },
        }

    def get_chart_metrics(self) -> dict[str, float]:
        """Return numeric metrics for system-wide history charts."""
        summary = self.get_summary()
        swap = self.get_details()["swap"]
        load = summary.get("load_1m") or 0
        logical = summary.get("logical_cores") or 1
        return {
            "cpu_utilization": float(summary["utilization_pct"]),
            "memory_used_pct": float(summary["memory_used_pct"]),
            "swap_used_pct": float(swap.get("used_pct") or 0),
            "load_normalized": round(float(load) / logical * 100, 1),
            "temperature": float(summary.get("temperature_c") or 0),
        }

    def get_core_count(self) -> int:
        """Return number of logical CPU cores."""
        return psutil.cpu_count(logical=True) or 1

    def get_core_chart_metrics(self, core_index: int) -> dict[str, float]:
        """Return chart metrics for a single CPU core."""
        per_core = self.get_details()["utilization"]["per_core_pct"]
        value = per_core[core_index] if core_index < len(per_core) else 0.0
        return {"core_utilization": float(value)}

    def get_top_processes(self, limit: int = 15) -> list[dict[str, Any]]:
        """Return top processes sorted by CPU usage."""
        processes: list[dict[str, Any]] = []
        for proc in psutil.process_iter(["pid", "name", "username", "cpu_percent", "memory_percent"]):
            try:
                info = proc.info
                cpu = info.get("cpu_percent") or 0.0
                mem = info.get("memory_percent") or 0.0
                if cpu <= 0 and mem <= 0:
                    continue
                processes.append({
                    "pid": info["pid"],
                    "name": info.get("name") or "unknown",
                    "username": info.get("username") or "—",
                    "cpu_percent": round(cpu, 1),
                    "memory_percent": round(mem, 1),
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue

        processes.sort(key=lambda p: p["cpu_percent"], reverse=True)
        return processes[:limit]

    def _normalize_frequency(self, mhz: float | None) -> float | None:
        """Return frequency in MHz when the reading looks valid."""
        if mhz is None or mhz < 100:
            return None
        return round(mhz, 1)

    def _safe_freq_per_core(self) -> list[float | None]:
        """Return per-core frequencies when supported by the platform."""
        try:
            freqs = psutil.cpu_freq(percpu=True)
            if not freqs:
                return []
            return [self._normalize_frequency(f.current if f else None) for f in freqs]
        except Exception:
            return []

    def _get_load_average(self) -> dict[str, float | None]:
        """Return 1/5/15 minute load averages on Unix systems."""
        try:
            load_1, load_5, load_15 = psutil.getloadavg()
            return {
                "load_1m": round(load_1, 2),
                "load_5m": round(load_5, 2),
                "load_15m": round(load_15, 2),
            }
        except (AttributeError, OSError):
            return {"load_1m": None, "load_5m": None, "load_15m": None}

    def _get_cpu_temperature(self) -> dict[str, float | None]:
        """Return CPU temperature from platform sensors when available."""
        try:
            temps = psutil.sensors_temperatures()
            if not temps:
                return {"cpu_c": None}

            for key in ("coretemp", "cpu_thermal", "k10temp", "zenpower", "apple", "acpitz", "cpu-thermal"):
                if key in temps and temps[key]:
                    current = temps[key][0].current
                    return {"cpu_c": round(current, 1) if current is not None else None}

            first_group = next(iter(temps.values()), [])
            if first_group:
                current = first_group[0].current
                return {"cpu_c": round(current, 1) if current is not None else None}
        except (AttributeError, OSError):
            pass
        return {"cpu_c": None}

    def shutdown(self) -> None:
        """Release collector resources."""
        pass
