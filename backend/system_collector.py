"""Cross-platform system statistics collector for macOS, Windows, and Linux."""

import json
import os
import platform
import re
import subprocess
import time
from datetime import datetime, timezone
from typing import Any

import psutil

HARDWARE_CACHE_TTL_SEC = 300.0
SYSTEM_NAME = platform.system()


class SystemCollector:
    """Collect system, battery, storage, and network metrics on all major OSes."""

    def __init__(self) -> None:
        self._hardware_cache: dict[str, Any] | None = None
        self._hardware_cached_at: float = 0.0
        self._prev_disk_io: Any = None
        self._prev_net_io: Any = None
        self._prev_sample_at: float | None = None

    def get_platform(self) -> str:
        """Return OS family name (Darwin, Windows, Linux)."""
        return SYSTEM_NAME

    def get_mode(self) -> str:
        """Return collector mode label."""
        return "live"

    def get_summary(self) -> dict[str, Any]:
        """Return compact system summary for overview cards."""
        hw = self.get_hardware()
        battery = self.get_battery()
        storage = self.get_storage()
        network = self.get_network()
        software = self.get_software()
        root = self._primary_volume(storage["volumes"])
        primary_iface = self._primary_interface(network["interfaces"])

        return {
            "platform": SYSTEM_NAME,
            "model_name": hw.get("model_name"),
            "chip": hw.get("chip") or hw.get("cpu_brand"),
            "memory_gb": hw.get("memory_gb"),
            "os_name": software.get("os_name"),
            "os_version": software.get("os_version"),
            "battery_percent": battery.get("percent"),
            "battery_plugged": battery.get("power_plugged"),
            "battery_time_left_min": battery.get("time_left_min"),
            "disk_used_pct": root.get("used_pct"),
            "disk_total_gb": root.get("total_gb"),
            "disk_free_gb": root.get("free_gb"),
            "disk_mountpoint": root.get("mountpoint"),
            "network_interface": primary_iface.get("name"),
            "network_connected": primary_iface.get("is_up"),
            "uptime_seconds": self._get_uptime_seconds(),
        }

    def get_grouped_stats(self) -> dict[str, Any]:
        """Return all system stats grouped by category."""
        return {
            "platform": {"os_family": SYSTEM_NAME},
            "hardware": self.get_hardware(),
            "battery": self.get_battery(),
            "storage": self.get_storage(),
            "network": self.get_network(),
            "software": self.get_software(),
        }

    def get_hardware(self) -> dict[str, Any]:
        """Return hardware profile for the current platform."""
        profile = self._get_hardware_profile()
        memory_gb = profile.get("memory_gb")
        if memory_gb is None:
            memory_gb = round(psutil.virtual_memory().total / (1024 ** 3), 1)

        logical = psutil.cpu_count(logical=True)
        physical = psutil.cpu_count(logical=False) or logical

        return {
            **profile,
            "platform": SYSTEM_NAME,
            "cpu_brand": profile.get("cpu_brand") or profile.get("chip") or platform.processor() or "Unknown",
            "logical_cores": profile.get("logical_cores") or logical,
            "physical_cores": profile.get("physical_cores") or physical,
            "memory_gb": memory_gb,
            "architecture": platform.machine(),
            "hostname": platform.node(),
        }

    def get_battery(self) -> dict[str, Any]:
        """Return battery status and power source information."""
        battery = psutil.sensors_battery()
        extra = self._platform_battery_details()

        percent = battery.percent if battery else extra.get("percent")
        plugged = battery.power_plugged if battery else extra.get("power_plugged")
        secsleft = battery.secsleft if battery and battery.secsleft >= 0 else None

        if plugged is None and extra.get("power_plugged") is not None:
            plugged = extra.get("power_plugged")

        return {
            "present": battery is not None or extra.get("present", False),
            "percent": round(percent, 1) if percent is not None else None,
            "power_plugged": plugged,
            "power_source": "AC Power" if plugged else "Battery Power",
            "time_left_min": round(secsleft / 60) if secsleft is not None else extra.get("time_left_min"),
            "status": extra.get("status"),
            "charging": extra.get("charging") if extra.get("charging") is not None else bool(plugged and percent and percent < 100),
            "warnings": extra.get("warnings", []),
            "drawing_from": extra.get("drawing_from"),
        }

    def get_storage(self) -> dict[str, Any]:
        """Return disk volumes and I/O counters."""
        volumes: list[dict[str, Any]] = []
        for part in psutil.disk_partitions(all=False):
            if not self._include_partition(part):
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

        primary = self._primary_mountpoint()
        volumes.sort(key=lambda v: (v["mountpoint"] != primary, v["mountpoint"]))
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
        preferred = self._preferred_interface_names()

        interfaces: list[dict[str, Any]] = []
        for name, addr_list in addrs.items():
            if self._skip_interface(name):
                continue
            nic_stats = stats.get(name)
            nic_io = io.get(name)
            ipv4 = self._address_for_family(addr_list, {"AF_INET", "2"})
            ipv6 = self._address_for_family(addr_list, {"AF_INET6", "23"})
            mac = self._address_for_family(addr_list, {"AF_LINK", "AF_PACKET", "-1", "17"})

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

        interfaces.sort(
            key=lambda i: (
                not i["is_up"],
                i["name"] not in preferred,
                preferred.index(i["name"]) if i["name"] in preferred else 999,
                i["name"],
            )
        )
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
        """Return operating system and runtime software information."""
        os_info = self._get_os_info()
        return {
            "platform": SYSTEM_NAME,
            "os_name": os_info.get("os_name") or platform.system(),
            "os_version": os_info.get("os_version") or platform.release(),
            "build_version": os_info.get("build_version"),
            "edition": os_info.get("edition"),
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
        root = self._primary_volume(storage["volumes"])
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
        """Return cached platform-specific hardware profile."""
        now = time.time()
        if self._hardware_cache and now - self._hardware_cached_at < HARDWARE_CACHE_TTL_SEC:
            return self._hardware_cache

        if SYSTEM_NAME == "Darwin":
            profile = self._hardware_darwin()
        elif SYSTEM_NAME == "Windows":
            profile = self._hardware_windows()
        elif SYSTEM_NAME == "Linux":
            profile = self._hardware_linux()
        else:
            profile = self._hardware_generic()

        self._hardware_cache = profile
        self._hardware_cached_at = now
        return profile

    def _hardware_darwin(self) -> dict[str, Any]:
        """Collect hardware details on macOS."""
        profile: dict[str, Any] = {}
        output = self._run_command(["system_profiler", "SPHardwareDataType"])
        if output:
            profile = self._parse_system_profiler(output)

        sysctl = self._get_sysctl_values({
            "hw.model": "model_identifier",
            "machdep.cpu.brand_string": "cpu_brand",
            "hw.memsize": "memory_bytes",
            "hw.ncpu": "logical_cores",
            "hw.physicalcpu": "physical_cores",
        })
        memory_bytes = sysctl.get("memory_bytes")
        if memory_bytes:
            profile["memory_gb"] = round(memory_bytes / (1024 ** 3), 1)
        profile.update({k: v for k, v in sysctl.items() if k != "memory_bytes"})
        if not profile.get("chip"):
            profile["chip"] = sysctl.get("cpu_brand")
        return profile

    def _hardware_linux(self) -> dict[str, Any]:
        """Collect hardware details on Linux."""
        vendor = self._read_text_file("/sys/class/dmi/id/sys_vendor")
        product = self._read_text_file("/sys/class/dmi/id/product_name")
        version = self._read_text_file("/sys/class/dmi/id/product_version")
        board = self._read_text_file("/sys/class/dmi/id/board_name")
        cpu_brand = self._linux_cpu_model()

        model_name = " ".join(p for p in [vendor, product] if p) or board or "Linux PC"
        return {
            "model_name": model_name.strip(),
            "model_identifier": version,
            "manufacturer": vendor,
            "product_name": product,
            "board_name": board,
            "chip": cpu_brand,
            "cpu_brand": cpu_brand,
        }

    def _hardware_windows(self) -> dict[str, Any]:
        """Collect hardware details on Windows via CIM."""
        profile: dict[str, Any] = {}
        system = self._powershell_json(
            "Get-CimInstance Win32_ComputerSystem | "
            "Select-Object Manufacturer,Model,TotalPhysicalMemory | ConvertTo-Json -Compress"
        )
        processor = self._powershell_json(
            "Get-CimInstance Win32_Processor | "
            "Select-Object Name,NumberOfCores,NumberOfLogicalProcessors | ConvertTo-Json -Compress"
        )

        if isinstance(system, dict):
            manufacturer = system.get("Manufacturer")
            model = system.get("Model")
            profile["manufacturer"] = manufacturer
            profile["model_name"] = f"{manufacturer} {model}".strip() if manufacturer or model else None
            memory = system.get("TotalPhysicalMemory")
            if memory:
                profile["memory_gb"] = round(int(memory) / (1024 ** 3), 1)

        if isinstance(processor, dict):
            profile["cpu_brand"] = processor.get("Name")
            profile["chip"] = processor.get("Name")
            profile["physical_cores"] = processor.get("NumberOfCores")
            profile["logical_cores"] = processor.get("NumberOfLogicalProcessors")
        elif isinstance(processor, list) and processor:
            first = processor[0]
            profile["cpu_brand"] = first.get("Name")
            profile["chip"] = first.get("Name")
            profile["physical_cores"] = first.get("NumberOfCores")
            profile["logical_cores"] = first.get("NumberOfLogicalProcessors")

        if not profile:
            return self._hardware_generic()
        return profile

    def _hardware_generic(self) -> dict[str, Any]:
        """Fallback hardware profile from Python platform module."""
        uname = platform.uname()
        return {
            "model_name": uname.node or platform.node(),
            "cpu_brand": platform.processor() or uname.processor,
            "chip": platform.processor() or uname.processor,
        }

    def _get_os_info(self) -> dict[str, str]:
        """Return OS name and version for the current platform."""
        if SYSTEM_NAME == "Darwin":
            return self._get_sw_vers()
        if SYSTEM_NAME == "Linux":
            return self._parse_os_release()
        if SYSTEM_NAME == "Windows":
            return self._get_windows_os_info()
        uname = platform.uname()
        return {"os_name": uname.system, "os_version": uname.release}

    def _platform_battery_details(self) -> dict[str, Any]:
        """Return platform-specific battery metadata."""
        if SYSTEM_NAME == "Darwin":
            return self._parse_pmset_battery()
        return {"present": psutil.sensors_battery() is not None}

    def _primary_mountpoint(self) -> str:
        """Return primary system volume mount point."""
        if SYSTEM_NAME == "Windows":
            return os.environ.get("SystemDrive", "C:") + "\\"
        return "/"

    def _primary_volume(self, volumes: list[dict[str, Any]]) -> dict[str, Any]:
        """Return the primary system volume from a volume list."""
        primary = self._primary_mountpoint()
        return next((v for v in volumes if v.get("mountpoint") == primary), volumes[0] if volumes else {})

    def _primary_interface(self, interfaces: list[dict[str, Any]]) -> dict[str, Any]:
        """Return the preferred active network interface."""
        preferred = self._preferred_interface_names()
        for name in preferred:
            match = next((i for i in interfaces if i["name"] == name), None)
            if match:
                return match
        return interfaces[0] if interfaces else {}

    def _preferred_interface_names(self) -> list[str]:
        """Return preferred interface names ordered by platform."""
        if SYSTEM_NAME == "Darwin":
            return ["en0", "en1"]
        if SYSTEM_NAME == "Windows":
            return ["Ethernet", "Wi-Fi", "Wi-Fi 2", "WLAN"]
        return ["eth0", "enp0s3", "enp0s31f6", "wlan0", "wlo1", "eno1"]

    def _include_partition(self, part: Any) -> bool:
        """Return True when a partition should appear in storage stats."""
        if SYSTEM_NAME == "Windows":
            return len(part.mountpoint) >= 2 and part.mountpoint[1] == ":"

        skip_fstypes = {"devfs", "autofs", "tmpfs", "devtmpfs", "squashfs", "overlay", "tracefs", "proc", "sysfs", "cgroup", "cgroup2"}
        if part.fstype in skip_fstypes:
            return False

        if SYSTEM_NAME == "Darwin":
            return part.mountpoint.startswith(("/", "/Volumes/"))

        if SYSTEM_NAME == "Linux":
            skip_prefixes = ("/snap", "/run", "/dev", "/sys", "/proc", "/var/lib/docker", "/var/snap")
            if part.mountpoint.startswith(skip_prefixes):
                return False
            return True

        return True

    def _skip_interface(self, name: str) -> bool:
        """Return True when a network interface should be hidden."""
        lowered = name.lower()
        if SYSTEM_NAME == "Windows":
            return "loopback" in lowered or lowered.startswith("isatap") or lowered.startswith("teredo")
        if lowered.startswith(("lo", "gif", "stf", "docker", "veth", "br-", "virbr")):
            return True
        return False

    def _address_for_family(self, addr_list: list[Any], families: set[str]) -> str | None:
        """Return the first address matching a socket address family."""
        for addr in addr_list:
            family = str(addr.family.name if hasattr(addr.family, "name") else addr.family)
            if family in families:
                return addr.address
        return None

    def _linux_cpu_model(self) -> str | None:
        """Parse CPU model from /proc/cpuinfo on Linux."""
        content = self._read_text_file("/proc/cpuinfo")
        if not content:
            return None
        for line in content.splitlines():
            if line.lower().startswith("model name"):
                return line.split(":", 1)[1].strip()
        return None

    def _parse_os_release(self) -> dict[str, str]:
        """Parse /etc/os-release on Linux."""
        content = self._read_text_file("/etc/os-release")
        if not content:
            return {}
        values: dict[str, str] = {}
        for line in content.splitlines():
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"')
        return {
            "os_name": values.get("NAME") or values.get("PRETTY_NAME"),
            "os_version": values.get("VERSION_ID") or values.get("VERSION"),
            "build_version": values.get("BUILD_ID"),
            "edition": values.get("VARIANT"),
        }

    def _get_windows_os_info(self) -> dict[str, str]:
        """Return Windows version details."""
        data = self._powershell_json(
            "Get-CimInstance Win32_OperatingSystem | "
            "Select-Object Caption,Version,BuildNumber | ConvertTo-Json -Compress"
        )
        if isinstance(data, dict):
            return {
                "os_name": data.get("Caption"),
                "os_version": data.get("Version"),
                "build_version": data.get("BuildNumber"),
            }

        name, version, build, _platform = platform.win32_ver()
        return {
            "os_name": name or "Windows",
            "os_version": version or platform.release(),
            "build_version": build,
        }

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
        return {
            "os_name": parsed.get("product_name"),
            "os_version": parsed.get("product_version"),
            "build_version": parsed.get("build_version"),
        }

    def _get_sysctl_values(self, keys: dict[str, str]) -> dict[str, Any]:
        """Read multiple sysctl values on macOS/BSD."""
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

    def _powershell_json(self, command: str) -> Any:
        """Run a PowerShell command and parse JSON output on Windows."""
        if SYSTEM_NAME != "Windows":
            return None
        output = self._run_command(
            ["powershell", "-NoProfile", "-Command", command],
            timeout=12,
        )
        if not output:
            return None
        try:
            return json.loads(output)
        except json.JSONDecodeError:
            return None

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

    def _read_text_file(self, path: str) -> str | None:
        """Read a small text file when permitted."""
        try:
            with open(path, encoding="utf-8", errors="ignore") as handle:
                return handle.read().strip()
        except OSError:
            return None

    def _run_command(self, cmd: list[str], timeout: int = 8) -> str | None:
        """Run a read-only command safely."""
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
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
