# AquaData API (v1)

Metered REST API returning drinking-water quality data by US ZIP code, under
B. Symbolic LLC. Florida-first (Palm Beach County dataset loaded in v1); the
schema and resolver scale to statewide/national ingest with no refactoring.

Stack: Python 3.12, FastAPI + asyncpg (no ORM), Postgres 16, Redis, Stripe
metered billing. Engineering tier: strict — inputs validated at boundaries,
every return checked, ruff + mypy `strict` clean, real-Postgres integration
tests (no mocked DB).

## Endpoints

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /v1/water-quality/{zip}` | key | Flagship: utilities, composite score, PFAS vs EPA MCLs, violations, hardness |
| `GET /v1/utilities/{pws_id}` | key | Full utility detail: violation history, contaminant table, CCR links |
| `GET /v1/hardness/{zip}` | key | Lightweight hardness-only lookup |
| `GET /v1/coverage` | none | Supported states, utility + ZIP counts |
| `GET /v1/health` | none | Liveness/readiness (checks Postgres + Redis) |
| `POST /v1/keys/signup` | none | Self-serve key issue (free tier live; paid via Stripe Checkout) |

Auth: `X-API-Key: ak_live_<32 hex>`. Keys are stored SHA-256 hashed and never
logged. OpenAPI docs live at `/docs` with full field descriptions.

Behavior guarantees:
- Malformed ZIP (`ZIP+4`, alpha, 4-digit, unicode digits) → `422` before any DB touch.
- Valid ZIP outside coverage → `200` with `coverage: "unsupported_region"`.
- Multi-utility ZIPs list all systems ordered by population served;
  `is_primary` marks the largest; per-utility scores in `score.utilities`.
- Every response's `meta.sources` is read from `api.data_snapshots` — never
  hardcoded. Scoring is versioned (`docs/methodology.md`, v1.0 approved
  2026-08-09) with a renormalizing missing-data policy.

## Tiers (seeded in `api.products`; pricing lives in the DB)

| Tier | Price | Included | Window |
|---|---|---|---|
| free | $0 | 100 calls | per day (sliding 24h) |
| starter | $19/mo | 5,000 calls | per month (sliding 30d) |
| pro | $49/mo | 50,000 calls | per month (sliding 30d) |

Overage on paid tiers: $0.002/call via Stripe metered billing. Limits are
enforced per key (never per IP) with an atomic Redis sliding window; exceeding
returns `429` with `Retry-After`.

## Billing pipeline

`api.usage` (month-partitioned) is the billing source of truth. Usage rows
buffer in memory ≤0.5s and batch-insert (a hard crash can only ever
*under*-bill). A 60s background batcher stages unreported paid usage into
`api.stripe_reports` atomically with deterministic idempotency keys, then
pushes Stripe meter events with exponential backoff. If Stripe is down,
nothing is lost — `aquadata stripe-reconcile` (or the next cycle) replays.

Provisioning is one idempotent command: `aquadata stripe-setup` creates the
usage meter, per-tier Products, and flat + metered Prices from the
`api.products` rows and stores the price ids back in the DB. Paid signup then
issues the key immediately (status `suspended`) with a Stripe Checkout link;
the signature-verified `/v1/stripe/webhook` activates the key on
`checkout.session.completed` and re-suspends on
`customer.subscription.deleted`.

## Local development

```bash
cd aquadata-api
python3 -m venv .venv && .venv/bin/pip install -e '.[dev]'
docker compose up -d                  # Postgres 16 + Redis 7
export DATABASE_URL=postgresql://aquadata:aquadata-local-dev@127.0.0.1:5432/aquadata
export REDIS_URL=redis://127.0.0.1:6379/0
.venv/bin/python -m aquadata.cli migrate
.venv/bin/python -m aquadata.cli seed-palm-beach \
    --data-dir ../client/src/data --snapshot-date 2025-07-01
.venv/bin/uvicorn aquadata.api.main:app --workers 4
```

Tests (spin up a throwaway `aquadata_test` DB; `ab` from apache2-utils is
required for the load smoke):

```bash
.venv/bin/pytest          # unit + integration + billing + rate limit + load smoke
.venv/bin/ruff check .
.venv/bin/mypy
```

## Operations

- `aquadata migrate` — apply SQL migrations (hash-tracked, advisory-locked).
- `aquadata refresh --data-dir D --manifest M --snapshot-date YYYY-MM-DD` —
  stage → validate (>10% row-count delta fails loudly) → atomic schema swap.
  See `data/manifest.palm-beach.json` for the manifest shape.
- `aquadata ensure-partitions` — create current+next month usage partitions.
- `aquadata stripe-reconcile` — replay unsent usage to Stripe.

Deployment (nginx + systemd + cron): see `DEPLOY.md`.

## Data status (v1)

Loaded sources: `ccr` (6 utilities, 107 ZIP mappings, violations, CCR links)
and `readings` (PFAS/lead/nitrate/DBP samples) — real harvested Palm Beach
County data. Not yet ingested: `enforcement` and `hardness`; their score
components report `no_data` and the composite renormalizes (see
`docs/methodology.md`). The 52-utility statewide dictionary drops into
`water.utilities`/`water.utility_zips` via `aquadata refresh` when ready.
