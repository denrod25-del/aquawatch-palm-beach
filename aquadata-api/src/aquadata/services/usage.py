"""Billable-usage recording. api.usage is the billing source of truth.

Rows buffer in memory and flush in batches (interval or size triggered, and
always on shutdown) so the request path never waits on a Postgres write.
Crash window: at most FLUSH_INTERVAL seconds of usage can be lost, which
under-bills — the error can only ever favor the customer.
"""

import asyncio
import contextlib
import logging
from http import HTTPStatus
from typing import Final

from aquadata.db.queries import DbPool

logger = logging.getLogger("aquadata.usage")

SUCCESS_RANGE: Final = range(HTTPStatus.OK, HTTPStatus.MULTIPLE_CHOICES)  # 2xx
FLUSH_INTERVAL_SECONDS: Final = 0.5
MAX_BUFFERED_ROWS: Final = 500

# Route templates that bill. /coverage and /health are free; signup is not a lookup.
BILLABLE_ROUTES: Final = frozenset(
    {
        "/v1/water-quality/{zip_code}",
        "/v1/utilities/{pws_id}",
        "/v1/hardness/{zip_code}",
    }
)

_INSERT_SQL: Final = """
INSERT INTO api.usage (key_id, endpoint, zip, status, latency_ms)
VALUES ($1::uuid, $2, $3, $4, $5)
"""

Row = tuple[str, str, str | None, int, int]


class UsageRecorder:
    def __init__(self, pool: DbPool, flush_interval: float = FLUSH_INTERVAL_SECONDS) -> None:
        assert flush_interval > 0
        self._pool = pool
        self._flush_interval = flush_interval
        self._buffer: list[Row] = []
        self._task: asyncio.Task[None] | None = None

    def record(
        self, key_id: str, endpoint: str, zip_code: str | None, status: int, latency_ms: int
    ) -> None:
        """Buffer one usage row; callers only invoke this for billable 2xx."""
        assert status in SUCCESS_RANGE, "usage rows are written for 2xx only"
        assert latency_ms >= 0
        self._buffer.append((key_id, endpoint, zip_code, status, latency_ms))
        if len(self._buffer) >= MAX_BUFFERED_ROWS:
            # Size-triggered flush; errors are logged inside flush().
            task = asyncio.get_running_loop().create_task(self.flush())
            task.add_done_callback(lambda _t: None)

    async def flush(self) -> int:
        """Write all buffered rows in one batch; returns rows written."""
        if not self._buffer:
            return 0
        rows, self._buffer = self._buffer, []
        try:
            await self._pool.executemany(_INSERT_SQL, rows)
        except Exception:
            # Never drop billing rows on a transient DB error — requeue.
            self._buffer = rows + self._buffer
            logger.exception("usage flush failed; %d rows requeued", len(rows))
            return 0
        return len(rows)

    def start(self) -> None:
        assert self._task is None
        self._task = asyncio.get_running_loop().create_task(self._run())

    async def _run(self) -> None:
        while True:
            await asyncio.sleep(self._flush_interval)
            await self.flush()

    async def stop(self) -> None:
        """Cancel the loop and drain the buffer."""
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None
        await self.flush()
