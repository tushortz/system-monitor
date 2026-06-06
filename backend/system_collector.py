"""macOS system statistics collector for MacBook hardware and I/O."""

import platform
import re
import subprocess
import time
from datetime import datetime, timezone
from typing import Any

import psutil

HARDWARE_CACHE_TTL_SEC = 300.0
USER_MOUNT_PREFIXES = ("/", "/Volumes/", "/System/Volumes/Data")


class SystemCollector:
    """Collect MacBook system, battery, storage, and network statistics."""

    def __init__(self) -> None:
        self._hardware_cache: dict[str, Any] | None = None
        self._hardware_cached_at: float = 0.0
        self._prev_disk_io: Any = None
        self._prev_net_io: Any = None
        self._prev_sample_at: float | None = None

    def get_mode(self) -> str:
        """Return collector mode label."""
        return "live" if platform.system() == "Darwin" else "limited"

    def get_summary(self) -> dict[str, Any]:
        """Return compact system summary for overview cards."""
        hw = self.get_hardware()
        battery = self.get_battery()
        storage = self.get_storage()
        network = self.get_network()
        software = self.get_software()
        root = next((v for v in storage["volumes"] if v.get("mountpoint") == "/"), {})
        primary_iface = network["interfaces"][0] if network["interfaces"] else {}

        return {
            "model_name": hw.get("model_name"),
            "chip": hw.get("chip"),
            "memory_gb": hw.get("memory_gb"),
            "os_version": software.get("os_version"),
            "battery_percent": battery.get("percent"),
            "battery_plugged": battery.get("power_plugged"),
            "battery_time_left_min": battery.get("time_left_min"),
            "disk_used_pct": root.get("used_pct"),
            "disk_total_gb": root.get("total_gb"),
            "disk_free_gb": root.get("free_gb"),
            "network_interface": primary_iface.get("name"),
            "network_connected": primary_iface.get("is_up"),
            "uptime_seconds": self._get_uptime_seconds(),
        }

    def get_grouped_stats(self) -> dict[str, Any]:
        """Return all system stats grouped by category."""
        return {
            "hardware": self.get_hardware(),
            "battery": self.get_battery(),
            "storage": self.get_storage(),
            "network": self.get_network(),
            "software": self.get_software(),
        }

    def get_hardware(self) -> dict[str, Any]:
        """Return Mac hardware profile."""
        profile = self._get_hardware_profile()
        sysctl = self._get_sysctl_values({
            "hw.model": "model_identifier",
            "machdep.cpu.brand_string": "cpu_brand",
            "hw.memsize": "memory_bytes",
            "hw.ncpu": "logical_cores",
            "hw.physicalcpu": "physical_cores",
        })
        memory_bytes = sysctl.get("memory_bytes")
        return {
            **profile,
            "model_identifier": sysctl.get("model_identifier") or profile.get("model_identifier"),
            "cpu_brand": sysctl.get("cpu_brand") or profile.get("chip"),
            "logical_cores": sysctl.get("logical_cores"),
            "physical_cores": sysctl.get("physical_cores") or profile.get("performance_cores"),
            "memory_gb": round(memory_bytes / (1024 ** 3), 1) if memory_bytes else profile.get("memory_gb"),
            "architecture": platform.machine(),
            "hostname": platform.node(),
        }

    def get_battery(self) -> dict[str, Any]:
        """Return battery status and power source information."""
        battery = psutil.sensors_battery()
        pmset = self._parse_pmset_battery()

        percent = battery.percent if battery else pmset.get("percent")
        plugged = battery.power_plugged if battery else pmset.get("power_plugged")
        secsleft = battery.secsleft if battery and battery.secsleft >= 0 else None

        return {
            "present": battery is not None or pmset.get("present", False),
            "percent": round(percent, 1) if percent is not None else None,
            "power_plugged": plugged,
            "power_source": "AC Power" if plugged else "Battery Power",
            "time_left_min": round(secsleft / 60) if secsleft is not None else pmset.get("time_left_min"),
            "status": pmset.get("status"),
            "charging": pmset.get("charging"),
            "warnings": pmset.get("warnings", []),
        }

    def get_storage(self) -> dict[str, Any]:
        """Return disk volumes and I/O counters."""
        volumes: list[dict[str, Any]] = []
        for part in psutil.disk_partitions(all=False):
            if not part.mountpoint.startswith(USER_MOUNT_PREFIXES):
                continue
            if part.fstype in ("devfs", "autofs"):
                continue
            try:
                usage = psutil.disk_usage(part.mountpoint)
            except (PermissionError, OSError):
                continue
            volumes.append({
                "device": part.device,
                "mountpoint": part.mountpoint,
                "fstype": part.fstype,
                "total_gb": round(usage.total / (1024 ** 3), 2),
                "used_gb": round(usage.used / (1024 ** 3), 2),
                "free_gb": round(usage.free / (1024 ** 3), 2),
                "used_pct": round(usage.percent, 1),
            })

        volumes.sort(key=lambda v: (v["mountpoint"] != "/", v["mountpoint"]))
        io = psutil.disk_io_counters()
        rates = self._compute_io_rates()

        io_stats: dict[str, Any] = {}
        if io:
            io_stats = {
                "read_count": io.read_count,
                "write_count": io.write_count,
                "read_gb": round(io.read_bytes / (1024 ** 3), 2),
                "write_gb": round(io.write_bytes / (1024 ** 3), 2),
                "read_mb_per_sec": rates.get("disk_read_mb_s"),
                "write_mb_per_sec": rates.get("disk_write_mb_s"),
            }

        return {"volumes": volumes, "io": io_stats}

    def get_network(self) -> dict[str, Any]:
        """Return network interfaces and traffic counters."""
        addrs = psutil.net_if_addrs()
        stats = psutil.net_if_stats()
        io = psutil.net_io_counters(pernic=True)
        rates = self._compute_io_rates()

        interfaces: list[dict[str, Any]] = []
        for name, addr_list in addrs.items():
            if name.startswith("lo") or name.startswith("gif") or name.startswith("stf"):
                continue
            nic_stats = stats.get(name)
            nic_io = io.get(name)
            ipv4 = next((a.address for a in addr_list if a.family.name == "AF_INET"), None)
            ipv6 = next((a.address for a in addr_list if a.family.name == "AF_INET6"), None)
            mac = next((a.address for a in addr_list if a.family.name == "AF_LINK"), None)

            interfaces.append({
                "name": name,
                "is_up": nic_stats.isup if nic_stats else False,
                "speed_mbps": nic_stats.speed if nic_stats and nic_stats.speed > 0 else None,
                "mtu": nic_stats.mtu if nic_stats else None,
                "ipv4": ipv4,
                "ipv6": ipv6,
                "mac": mac,
                "bytes_sent_mb": round(nic_io.bytes_sent / (1024 ** 2), 2) if nic_io else 0,
                "bytes_recv_mb": round(nic_io.bytes_recv / (1024 ** 2), 2) if nic_io else 0,
                "packets_sent": nic_io.packets_sent if nic_io else 0,
                "packets_recv": nic_io.packets_recv if nic_io else 0,
                "errors_in": nic_io.errin if nic_io else 0,
                "errors_out": nic_io.errout if nic_io else 0,
            })

        interfaces.sort(key=lambda i: (not i["is_up"], i["name"] != "en0", i["name"]))
        total = psutil.net_io_counters()

        return {
            "interfaces": interfaces,
            "total": {
                "bytes_sent_gb": round(total.bytes_sent / (1024 ** 3), 2) if total else 0,
                "bytes_recv_gb": round(total.bytes_recv / (1024 ** 3), 2) if total else 0,
                "send_mb_per_sec": rates.get("net_sent_mb_s"),
                "recv_mb_per_sec": rates.get("net_recv_mb_s"),
            },
        }

    def get_software(self) -> dict[str, Any]:
        """Return macOS and runtime software information."""
        sw = self._get_sw_vers()
        return {
            "os_name": sw.get("product_name") or platform.system(),
            "os_version": sw.get("product_version") or platform.release(),
            "build_version": sw.get("build_version"),
            "kernel_version": platform.release(),
            "python_version": platform.python_version(),
            "boot_time": datetime.fromtimestamp(psutil.boot_time(), tz=timezone.utc).isoformat(),
            "uptime_seconds": self._get_uptime_seconds(),
        }

    def get_chart_metrics(self) -> dict[str, float]:
        """Return numeric metrics for system history charts."""
        battery = self.get_battery()
        storage = self.get_storage()
        network = self.get_network()
        root = next((v for v in storage["volumes"] if v.get("mountpoint") == "/"), {})
        io = storage.get("io", {})
        total = network.get("total", {})

        return {
            "battery_percent": float(battery.get("percent") or 0),
            "disk_used_pct": float(root.get("used_pct") or 0),
            "disk_read_mb_s": float(io.get("read_mb_per_sec") or 0),
            "disk_write_mb_s": float(io.get("write_mb_per_sec") or 0),
            "net_sent_mb_s": float(total.get("send_mb_per_sec") or 0),
            "net_recv_mb_s": float(total.get("recv_mb_per_sec") or 0),
        }

    def _get_hardware_profile(self) -> dict[str, Any]:
        """Return cached hardware profile from system_profiler."""
        now = time.time()
        if self._hardware_cache and now - self._hardware_cached_at < HARDWARE_CACHE_TTL_SEC:
            return self._hardware_cache

        profile: dict[str, Any] = {}
        if platform.system() == "Darwin":
            output = self._run_command(["system_profiler", "SPHardwareDataType"])
            if output:
                profile = self._parse_system_profiler(output)

        self._hardware_cache = profile
        self._hardware_cached_at = now
        return profile

    def _parse_system_profiler(self, output: str) -> dict[str, Any]:
        """Parse key fields from system_profiler hardware output."""
        field_map = {
            "Model Name": "model_name",
            "Model Identifier": "model_identifier",
            "Model Number": "model_number",
            "Chip": "chip",
            "Memory": "memory_gb",
            "System Firmware Version": "firmware_version",
            "OS Loader Version": "os_loader_version",
            "Hardware UUID": "hardware_uuid",
            "Number of Processors": "processor_count",
        }
        parsed: dict[str, Any] = {}
        cores_match = re.search(
            r"Total Number of Cores:\s*(\d+)\s*\((\d+)\s*Performance and\s*(\d+)\s*Efficiency\)",
            output,
        )
        if cores_match:
            parsed["total_cores"] = int(cores_match.group(1))
            parsed["performance_cores"] = int(cores_match.group(2))
            parsed["efficiency_cores"] = int(cores_match.group(3))

        for line in output.splitlines():
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            key = key.strip()
            value = value.strip()
            mapped = field_map.get(key)
            if not mapped or not value:
                continue
            if mapped == "memory_gb":
                parsed[mapped] = round(float(value.split()[0]), 1)
            elif mapped == "processor_count":
                parsed[mapped] = int(value)
            else:
                parsed[mapped] = value
        return parsed

    def _parse_pmset_battery(self) -> dict[str, Any]:
        """Parse pmset battery output on macOS."""
        if platform.system() != "Darwin":
            return {}
        output = self._run_command(["pmset", "-g", "batt"])
        if not output:
            return {}

        result: dict[str, Any] = {"present": "InternalBattery" in output}
        warnings = [line.strip() for line in output.splitlines() if "Battery Warning" in line]
        result["warnings"] = warnings

        match = re.search(
            r"(\d+)%;\s*(charging|discharging|charged|finishing charge|ac attached|not charging);"
            r"(?:\s*(\d+):(\d+)\s*remaining)?",
            output,
            re.IGNORECASE,
        )
        if match:
            result["percent"] = float(match.group(1))
            state = match.group(2).lower()
            result["status"] = state
            result["charging"] = state in {"charging", "finishing charge", "ac attached"}
            result["power_plugged"] = state in {"charging", "charged", "finishing charge", "ac attached"}
            if match.group(3) and match.group(4):
                result["time_left_min"] = int(match.group(3)) * 60 + int(match.group(4))

        drawing = re.search(r"Now drawing from '([^']+)'", output)
        if drawing:
            result["drawing_from"] = drawing.group(1)
        return result

    def _get_sw_vers(self) -> dict[str, str]:
        """Return macOS product version information."""
        if platform.system() != "Darwin":
            return {}
        output = self._run_command(["sw_vers"])
        if not output:
            return {}
        parsed: dict[str, str] = {}
        for line in output.splitlines():
            if "ProductName" in line:
                parsed["product_name"] = line.split(":", 1)[1].strip()
            elif "ProductVersion" in line:
                parsed["product_version"] = line.split(":", 1)[1].strip()
            elif "BuildVersion" in line:
                parsed["build_version"] = line.split(":", 1)[1].strip()
        return parsed

    def _get_sysctl_values(self, keys: dict[str, str]) -> dict[str, Any]:
        """Read multiple sysctl values."""
        result: dict[str, Any] = {}
        for sysctl_key, label in keys.items():
            value = self._run_command(["sysctl", "-n", sysctl_key])
            if not value:
                continue
            if label in {"memory_bytes", "logical_cores", "physical_cores"}:
                try:
                    result[label] = int(value)
                except ValueError:
                    result[label] = value
            else:
                result[label] = value
        return result

    def _compute_io_rates(self) -> dict[str, float]:
        """Compute disk and network throughput since last sample."""
        now = time.time()
        disk = psutil.disk_io_counters()
        net = psutil.net_io_counters()
        rates: dict[str, float] = {}

        if self._prev_sample_at and self._prev_disk_io and self._prev_net_io and disk and net:
            elapsed = now - self._prev_sample_at
            if elapsed > 0:
                rates["disk_read_mb_s"] = round(
                    (disk.read_bytes - self._prev_disk_io.read_bytes) / elapsed / (1024 ** 2), 2
                )
                rates["disk_write_mb_s"] = round(
                    (disk.write_bytes - self._prev_disk_io.write_bytes) / elapsed / (1024 ** 2), 2
                )
                rates["net_sent_mb_s"] = round(
                    (net.bytes_sent - self._prev_net_io.bytes_sent) / elapsed / (1024 ** 2), 2
                )
                rates["net_recv_mb_s"] = round(
                    (net.bytes_recv - self._prev_net_io.bytes_recv) / elapsed / (1024 ** 2), 2
                )

        self._prev_sample_at = now
        self._prev_disk_io = disk
        self._prev_net_io = net
        return rates

    def _get_uptime_seconds(self) -> int:
        """Return system uptime in seconds."""
        return round(time.time() - psutil.boot_time())

    def _run_command(self, cmd: list[str]) -> str | None:
        """Run a read-only shell command safely."""
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=8,
                check=False,
            )
            if result.returncode != 0:
                return None
            return result.stdout.strip()
        except (OSError, subprocess.TimeoutExpired):
            return None

    def shutdown(self) -> None:
        """Release collector resources."""
        pass
