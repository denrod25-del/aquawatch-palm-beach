"""Billable-usage recording. api.usage is the billing source of truth."""

from http import HTTPStatus
from typing import Final

from aquadata.db.queries import DbPool

SUCCESS_RANGE: Final = range(HTTPStatus.OK, HTTPStatus.MULTIPLE_CHOICES)  # 2xx

# Route templates that bill. /coverage and /health are free; signup is not a lookup.
BILLABLE_ROUTES: Final = frozenset(
    {
        "/v1/water-quality/{zip_code}",
        "/v1/utilities/{pws_id}",
        "/v1/hardness/{zip_code}",
    }
)


class UsageRecorder:
    def __init__(self, pool: DbPool) -> None:
        self._pool = pool

    async def record(
        self, key_id: str, endpoint: str, zip_code: str | None, status: int, latency_ms: int
    ) -> None:
        """Insert one usage row. Callers only invoke this for billable 2xx."""
        assert status in SUCCESS_RANGE, "usage rows are written for 2xx only"
        assert latency_ms >= 0
        await self._pool.execute(
            """INSERT INTO api.usage (key_id, endpoint, zip, status, latency_ms)
               VALUES ($1, $2, $3, $4, $5)""",
            key_id,
            endpoint,
            zip_code,
            status,
            latency_ms,
        )
