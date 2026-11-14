"""In-memory sliding-window rate limiter.

Good for a single server process. If the app ever runs as several processes,
move this to a shared store.
"""
import time
from collections import defaultdict, deque


class RateLimiter:
    def __init__(self, limit: int, window_seconds: float):
        self.limit = limit
        self.window = window_seconds
        self.hits: dict[str, deque] = defaultdict(deque)

    def allow(self, key: str, now: float | None = None) -> bool:
        now = time.monotonic() if now is None else now
        hits = self.hits[key]
        while hits and hits[0] <= now - self.window:
            hits.popleft()
        if len(hits) >= self.limit:
            return False
        hits.append(now)
        if len(self.hits) > 10_000:  # stop the table growing without bound
            self._prune(now)
        return True

    def _prune(self, now: float) -> None:
        stale = [k for k, h in self.hits.items() if not h or h[-1] <= now - self.window]
        for k in stale:
            del self.hits[k]
