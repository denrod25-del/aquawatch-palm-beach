"""Structured JSON logging.

Policy: no PII beyond ZIP codes. API keys (raw or hashed) and emails are
never logged at INFO or below; nothing in this codebase passes them to a
logger, and the formatter has no access to request headers by design.
"""

import json
import logging
import time
from typing import Any


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created))
            + f".{int(record.msecs):03d}Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        extra = getattr(record, "extra_fields", None)
        if isinstance(extra, dict):
            payload.update(extra)
        if record.exc_info and record.exc_info[0] is not None:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging(level: int = logging.INFO) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)


def log_request(
    logger: logging.Logger, method: str, path: str, status: int, latency_ms: int
) -> None:
    """One line per request. path is the route template + ZIP only — never keys."""
    logger.info(
        "request",
        extra={
            "extra_fields": {
                "method": method,
                "path": path,
                "status": status,
                "latency_ms": latency_ms,
            }
        },
    )
