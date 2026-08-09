"""FastAPI application factory: routes, middleware, caching, lifecycle."""

import asyncio
import contextlib
import json
import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import asyncpg
import redis.asyncio as aioredis
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse

from aquadata.api import schemas
from aquadata.api.deps import KeyContext, require_api_key
from aquadata.api.signup import signup
from aquadata.config import Settings, load_settings
from aquadata.core.jsonlog import configure_logging, log_request
from aquadata.core.validation import ZipValidationError, validate_zip
from aquadata.db import queries
from aquadata.services import assembler
from aquadata.services.ratelimit import RateLimiter
from aquadata.services.stripe_meter import StripeMeter, StripeMeterEventClient
from aquadata.services.usage import BILLABLE_ROUTES, SUCCESS_RANGE, UsageRecorder

logger = logging.getLogger("aquadata.request")

_MAX_PWS_ID_LEN = 12

_DESCRIPTION = """
Drinking-water quality by US ZIP code: composite score, PFAS occurrence vs
EPA MCLs, violation history, and water hardness — every number traceable to a
source snapshot listed in `meta.sources`.

Authenticate with the `X-API-Key` header. `/v1/coverage` and `/v1/health`
are public. Scoring methodology: see docs/methodology.md (versioned; the
current version is returned in every score block).
"""


def _error(status_code: int, code: str, detail: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"error": code, "detail": detail})


def _validated_zip(raw: str) -> str:
    try:
        return validate_zip(raw)
    except ZipValidationError as exc:
        raise _error(422, "invalid_zip", str(exc)) from exc


async def _cache_fingerprint(pool: Any) -> str:
    """Changes whenever a snapshot loads, so refreshes invalidate the cache."""
    latest = await pool.fetchval(
        "SELECT max(loaded_at) FROM api.data_snapshots WHERE is_current"
    )
    return str(latest.timestamp()) if latest is not None else "none"


async def _cached_json(request: Request, build_key: str, ttl: int, payload_fn: Any) -> Response:
    """Serve from Redis if present; otherwise build, validate implicitly, store."""
    redis_client = request.app.state.redis
    fingerprint = await _cache_fingerprint(request.app.state.pool)
    cache_key = f"resp:{build_key}:{fingerprint}"
    cached = await redis_client.get(cache_key)
    if cached is not None:
        return Response(content=cached, media_type="application/json")
    payload = await payload_fn()
    body = json.dumps(payload, separators=(",", ":"))
    await redis_client.set(cache_key, body, ex=ttl)
    return Response(content=body, media_type="application/json")


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings: Settings = app.state.settings
    pool = await asyncpg.create_pool(settings.database_url, min_size=2, max_size=10)
    assert pool is not None
    redis_client = aioredis.Redis.from_url(settings.redis_url)
    app.state.pool = pool
    app.state.redis = redis_client
    app.state.limiter = RateLimiter(redis_client)
    app.state.usage = UsageRecorder(pool)
    meter_task: asyncio.Task[None] | None = None
    if settings.stripe_api_key is not None:
        meter = StripeMeter(pool, StripeMeterEventClient(settings.stripe_api_key))
        meter_task = asyncio.create_task(meter.run_forever(settings.stripe_batch_seconds))
    try:
        yield
    finally:
        if meter_task is not None:
            meter_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await meter_task
        await redis_client.aclose()
        await pool.close()


def create_app(settings: Settings | None = None) -> FastAPI:
    configure_logging()
    app = FastAPI(
        title="AquaData API",
        version="1.0.0",
        description=_DESCRIPTION,
        lifespan=_lifespan,
    )
    app.state.settings = settings if settings is not None else load_settings()
    _register_middleware(app)
    _register_routes(app)
    return app


def _register_middleware(app: FastAPI) -> None:
    @app.middleware("http")
    async def usage_and_logging(request: Request, call_next: Any) -> Response:
        started = time.perf_counter()
        response: Response = await call_next(request)
        latency_ms = int((time.perf_counter() - started) * 1000)

        route = request.scope.get("route")
        template = getattr(route, "path", request.url.path)
        log_request(logger, request.method, template, response.status_code, latency_ms)

        context: KeyContext | None = getattr(request.state, "key_context", None)
        is_billable = template in BILLABLE_ROUTES
        if context is not None and is_billable and response.status_code in SUCCESS_RANGE:
            zip_param = request.path_params.get("zip_code")
            await request.app.state.usage.record(
                context.key_id, template, zip_param, response.status_code, latency_ms
            )
        return response

    @app.exception_handler(HTTPException)
    async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
        body = exc.detail if isinstance(exc.detail, dict) else {"error": "http_error",
                                                                "detail": str(exc.detail)}
        return JSONResponse(status_code=exc.status_code, content=body, headers=exc.headers)


def _register_routes(app: FastAPI) -> None:  # noqa: PLR0915 - route table reads top to bottom
    error_responses: dict[int | str, dict[str, Any]] = {
        401: {"model": schemas.ErrorResponse, "description": "Missing or unknown API key."},
        422: {"model": schemas.ErrorResponse, "description": "Malformed input."},
        429: {"model": schemas.ErrorResponse, "description": "Rate limit exceeded."},
    }

    @app.get(
        "/v1/water-quality/{zip_code}",
        response_model=schemas.WaterQualityResponse,
        responses=error_responses,
        summary="Water quality by ZIP",
        description="The flagship lookup: utilities serving the ZIP (largest first), "
        "composite score with per-component traceability, PFAS vs EPA MCLs, violation "
        "summary, and hardness. A real but out-of-coverage ZIP returns 200 with "
        "`coverage: unsupported_region` and empty data blocks.",
    )
    async def water_quality(
        zip_code: str, request: Request, _key: KeyContext = Depends(require_api_key)
    ) -> Response:
        zip_valid = _validated_zip(zip_code)
        ttl = request.app.state.settings.cache_ttl_seconds
        return await _cached_json(
            request,
            f"wq:{zip_valid}",
            ttl,
            lambda: assembler.build_water_quality(request.app.state.pool, zip_valid),
        )

    @app.get(
        "/v1/utilities/{pws_id}",
        response_model=schemas.UtilityDetailResponse,
        responses={**error_responses, 404: {"model": schemas.ErrorResponse}},
        summary="Utility detail",
        description="Full detail for one public water system: violation history, "
        "contaminant table, CCR report links, and its score.",
    )
    async def utility_detail(
        pws_id: str, request: Request, _key: KeyContext = Depends(require_api_key)
    ) -> Response:
        if not pws_id.isalnum() or len(pws_id) > _MAX_PWS_ID_LEN:
            raise _error(422, "invalid_pws_id", "PWS ID must be alphanumeric, max 12 chars.")
        pws_upper = pws_id.upper()
        pool = request.app.state.pool
        if await queries.utility_by_id(pool, pws_upper) is None:
            raise _error(404, "unknown_utility", f"No utility with PWS ID {pws_upper}.")
        ttl = request.app.state.settings.cache_ttl_seconds

        async def _payload() -> dict[str, Any]:
            detail = await assembler.build_utility_detail(pool, pws_upper)
            assert detail is not None  # existence checked above
            return detail

        return await _cached_json(request, f"util:{pws_upper}", ttl, _payload)

    @app.get(
        "/v1/hardness/{zip_code}",
        response_model=schemas.HardnessResponse,
        responses=error_responses,
        summary="Hardness by ZIP",
        description="Lightweight hardness-only lookup: value in mg/L as CaCO3 plus the "
        "USGS classification band.",
    )
    async def hardness(
        zip_code: str, request: Request, _key: KeyContext = Depends(require_api_key)
    ) -> Response:
        zip_valid = _validated_zip(zip_code)
        ttl = request.app.state.settings.cache_ttl_seconds
        return await _cached_json(
            request,
            f"hard:{zip_valid}",
            ttl,
            lambda: assembler.build_hardness(request.app.state.pool, zip_valid),
        )

    @app.get(
        "/v1/coverage",
        response_model=schemas.CoverageResponse,
        summary="Coverage",
        description="Public: supported states, utility counts, and mapped ZIP count.",
    )
    async def coverage(request: Request) -> Response:
        return await _cached_json(
            request,
            "coverage",
            request.app.state.settings.cache_ttl_seconds,
            lambda: assembler.build_coverage(request.app.state.pool),
        )

    @app.get(
        "/v1/health",
        response_model=schemas.HealthResponse,
        summary="Liveness/readiness",
        description="Public: checks Postgres and Redis connectivity.",
    )
    async def health(request: Request) -> JSONResponse:
        checks: dict[str, str] = {}
        try:
            await request.app.state.pool.fetchval("SELECT 1")
            checks["postgres"] = "ok"
        except Exception:  # noqa: BLE001 - a health check reports, never raises
            checks["postgres"] = "error"
        try:
            await request.app.state.redis.ping()
            checks["redis"] = "ok"
        except Exception:  # noqa: BLE001
            checks["redis"] = "error"
        healthy = all(v == "ok" for v in checks.values())
        return JSONResponse(
            status_code=200 if healthy else 503,
            content={"status": "ok" if healthy else "degraded", "checks": checks},
        )

    @app.post(
        "/v1/keys/signup",
        response_model=schemas.SignupResponse,
        status_code=201,
        responses={422: {"model": schemas.ErrorResponse}, 503: {"model": schemas.ErrorResponse}},
        summary="Create an API key",
        description="Free tier: returns a key immediately (shown once, stored hashed). "
        "Paid tiers return a Stripe Checkout link once billing is configured.",
    )
    async def keys_signup(body: schemas.SignupRequest, request: Request) -> dict[str, Any]:
        return await signup(request.app.state.pool, body.email, body.product_code)
