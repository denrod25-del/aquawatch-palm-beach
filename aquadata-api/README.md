# AquaData API (v1 — in progress)

Metered REST API returning drinking-water quality data by US ZIP code.
Florida-first; architecture scales nationally. Python 3.12 + FastAPI + asyncpg,
Postgres 16, Redis, Stripe metered billing.

## Current status

**Blocked on external assets — see `docs/proposed-api-schema.md` open items.**

Done so far (all data-independent):

- Project scaffold: `pyproject.toml` (ruff + mypy strict configured), `src/` layout.
- `aquadata.core.validation` — strict ZIP validation (`^\d{5}$`, ASCII-only,
  reject-don't-coerce). Unit-tested against the spec's edge cases.
- `aquadata.core.keys` — `ak_live_` + 32-hex key generation, SHA-256 hashing
  (raw keys are never stored or logged), constant-time hash comparison.
  Round-trip unit-tested.
- `docker-compose.yml` — local Postgres 16 + Redis 7.
- Draft `api` schema proposal for approval: `docs/proposed-api-schema.md`.

Blocked (needs input from the owner):

1. Connection string + schema dump for the existing Postgres (SDWIS / UCMR5 /
   CCR data). Nothing in this repo or environment has it.
2. The CITY data dictionary (52 FL utilities → PWS IDs → ZIPs). This repo only
   contains the 6-utility Palm Beach County dataset.
3. The Hard Water Map five-layer scoring function. This repo's scoring engine
   (`client/src/lib/scoring/`) is a different 6-component model with different
   weights and no hardness layer.

## Development

```bash
cd aquadata-api
python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'
docker compose up -d          # local Postgres + Redis
.venv/bin/pytest              # unit tests (no DB required yet)
.venv/bin/ruff check .
.venv/bin/mypy
```

Note: the build sandbox currently has Python 3.11; the project targets 3.12
(no 3.12-only syntax is used yet, so tests run on both).
