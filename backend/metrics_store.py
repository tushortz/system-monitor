"""In-memory ring buffer for GPU metric history used by charts."""

from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import Lock
from typing import Any


@dataclass
class MetricPoint:
    """Single timestamped metric sample."""

    timestamp: str
    values: dict[str, float]


@dataclass
class MetricsStore:
    """Thread-safe store of recent GPU metrics per device."""

    max_points: int = 120
    _data: dict[int, deque[MetricPoint]] = field(default_factory=dict)
    _lock: Lock = field(default_factory=Lock)

    def append(self, gpu_index: int, values: dict[str, float]) -> None:
        """Record a metric sample for a GPU."""
        point = MetricPoint(
            timestamp=datetime.now(timezone.utc).isoformat(),
            values=values,
        )
        with self._lock:
            if gpu_index not in self._data:
                self._data[gpu_index] = deque(maxlen=self.max_points)
            self._data[gpu_index].append(point)

    def get_history(self, gpu_index: int, keys: list[str] | None = None) -> dict[str, Any]:
        """Return time-series history for chart rendering."""
        with self._lock:
            points = list(self._data.get(gpu_index, []))

        if not points:
            return {"labels": [], "datasets": {}}

        labels = [p.timestamp for p in points]
        metric_keys = keys or list(points[-1].values.keys())
        datasets = {key: [p.values.get(key, 0.0) for p in points] for key in metric_keys}
        return {"labels": labels, "datasets": datasets}

    def clear(self) -> None:
        """Remove all stored history."""
        with self._lock:
            self._data.clear()
