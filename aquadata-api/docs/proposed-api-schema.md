# DRAFT — database schema proposal (awaiting approval)

Status: **proposal only, no migration written yet.** Owner confirmed no existing
Postgres instance — both the `water` (data) and `api` (keys/usage/products)
schemas are designed here from scratch. v1 loads the 6-utility Palm Beach
dataset already in this repo; the structure is built for statewide/national
SDWIS/UCMR5 ingest without refactoring.

## `water` schema (source data)

```sql
CREATE SCHEMA IF NOT EXISTS water;

CREATE TABLE water.utilities (
    pws_id            text PRIMARY KEY,          -- e.g. 'FL4004801'
    name              text NOT NULL,
    state             char(2) NOT NULL,
    county            text,
    population_served integer NOT NULL CHECK (population_served >= 0),
    source_type       text,                      -- GW | SW | GWP
    status            text NOT NULL DEFAULT 'Active',
    snapshot_id       bigint NOT NULL            -- api.data_snapshots provenance
);

-- ZIP -> utility resolver. Many-to-many; ordering by population decides primary.
CREATE TABLE water.utility_zips (
    pws_id text NOT NULL REFERENCES water.utilities(pws_id),
    zip    char(5) NOT NULL CHECK (zip ~ '^[0-9]{5}$'),
    PRIMARY KEY (pws_id, zip)
);
CREATE INDEX ON water.utility_zips (zip);

CREATE TABLE water.violations (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pws_id          text NOT NULL REFERENCES water.utilities(pws_id),
    violation_id    text NOT NULL,
    contaminant     text,
    violation_type  text NOT NULL,               -- MCL | MR | TT | BENCHMARK
    category        text NOT NULL,
    is_health_based boolean NOT NULL,
    start_date      date NOT NULL,
    end_date        date,
    status          text NOT NULL,               -- Resolved | Ongoing | Archived
    description     text,
    snapshot_id     bigint NOT NULL,
    UNIQUE (pws_id, violation_id)
);

CREATE TABLE water.contaminant_readings (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pws_id       text NOT NULL REFERENCES water.utilities(pws_id),
    contaminant  text NOT NULL,                  -- PFOA, PFOS, Lead, Nitrate, TTHM...
    value        numeric NOT NULL,
    unit         text NOT NULL,                  -- ppt | ppb | ppm
    sample_date  date NOT NULL,
    sample_point text,
    method       text,
    epa_limit    numeric,                        -- MCL / action level in same unit
    ewg_limit    numeric,
    national_avg numeric,
    snapshot_id  bigint NOT NULL
);
CREATE INDEX ON water.contaminant_readings (pws_id, contaminant, sample_date DESC);

-- Empty in v1 (no source rows yet); scored as no_data per methodology.
CREATE TABLE water.enforcement_actions (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pws_id      text NOT NULL REFERENCES water.utilities(pws_id),
    action_type text NOT NULL CHECK (action_type IN ('formal', 'informal')),
    action_date date NOT NULL,
    description text,
    snapshot_id bigint NOT NULL
);

-- Empty in v1; ZIP-level hardness from the Hard Water Map layers when available.
CREATE TABLE water.hardness (
    zip         char(5) PRIMARY KEY CHECK (zip ~ '^[0-9]{5}$'),
    value_mg_l  numeric NOT NULL CHECK (value_mg_l >= 0),
    snapshot_id bigint NOT NULL
);

-- CCR report links surfaced in utility detail responses.
CREATE TABLE water.ccr_reports (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pws_id      text REFERENCES water.utilities(pws_id),
    year        integer NOT NULL,
    report_url  text NOT NULL,
    report_type text NOT NULL DEFAULT 'PDF',
    notes       text,
    snapshot_id bigint NOT NULL
);
```

Refresh strategy: the CLI ingests into `water_staging.*` twins, validates row
counts against the manifest (fail on >10% delta), then swaps schemas in one
transaction (`ALTER SCHEMA ... RENAME`).

## `api` schema (keys, usage, products, snapshots)

## Roles

```sql
-- Service role: owns the api schema, read-only on water data.
CREATE ROLE aquadata_api LOGIN;                -- password managed outside VCS
GRANT USAGE ON SCHEMA api TO aquadata_api;
-- OPEN ITEM: exact GRANT SELECT list on water-data tables once schema is known.
```

## Tables

```sql
CREATE SCHEMA IF NOT EXISTS api;

-- Tier configuration. Pricing lives in the DB, not code, per spec.
CREATE TABLE api.products (
    code            text PRIMARY KEY,           -- 'free' | 'starter' | 'pro'
    name            text NOT NULL,
    monthly_price_cents integer NOT NULL CHECK (monthly_price_cents >= 0),
    included_calls  integer NOT NULL CHECK (included_calls > 0),
    limit_period    text NOT NULL CHECK (limit_period IN ('day', 'month')),
    overage_price_micro_usd integer,            -- NULL = hard cap (free tier)
    stripe_price_id text,                       -- NULL for free tier
    active          boolean NOT NULL DEFAULT true
);

-- Seed (per spec; confirm before I write the migration):
--   free:    $0,  100/day,   no overage, no card
--   starter: $19, 5000/mo,   overage 2000 micro-USD ($0.002/call)
--   pro:     $49, 50000/mo,  overage 2000 micro-USD

CREATE TABLE api.keys (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key_hash        char(64) NOT NULL UNIQUE,   -- SHA-256 hex; raw key never stored
    product_code    text NOT NULL REFERENCES api.products(code),
    email           text NOT NULL,
    stripe_customer_id     text,
    stripe_subscription_id text,
    status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'revoked', 'suspended')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    revoked_at      timestamptz,
    CHECK (status != 'revoked' OR revoked_at IS NOT NULL)
);

-- Every billable request. Partitioned by month on ts.
CREATE TABLE api.usage (
    id          bigint GENERATED ALWAYS AS IDENTITY,
    key_id      uuid NOT NULL,                  -- FK enforced app-side; FKs to
                                                -- partitioned parents are costly
    endpoint    text NOT NULL,
    zip         char(5),
    status      smallint NOT NULL,
    latency_ms  integer NOT NULL CHECK (latency_ms >= 0),
    ts          timestamptz NOT NULL DEFAULT now(),
    -- Stripe reconciliation bookkeeping:
    stripe_reported_at timestamptz,             -- NULL = not yet pushed to Stripe
    PRIMARY KEY (id, ts)
) PARTITION BY RANGE (ts);
-- Monthly partitions created by the refresh/maintenance job, e.g.:
--   CREATE TABLE api.usage_2026_08 PARTITION OF api.usage
--     FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE INDEX ON api.usage (key_id, ts);
CREATE INDEX ON api.usage (stripe_reported_at) WHERE stripe_reported_at IS NULL;

-- One row per Stripe usage-record push attempt (batched every 60s).
CREATE TABLE api.stripe_reports (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    idempotency_key  text NOT NULL UNIQUE,
    key_id           uuid NOT NULL REFERENCES api.keys(id),
    window_start     timestamptz NOT NULL,
    window_end       timestamptz NOT NULL,
    quantity         integer NOT NULL CHECK (quantity > 0),
    status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'sent', 'failed')),
    attempts         integer NOT NULL DEFAULT 0,
    last_error       text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    sent_at          timestamptz,
    CHECK (window_end > window_start)
);

-- Loaded-snapshot registry; meta.sources in every response reads from here.
CREATE TABLE api.data_snapshots (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source        text NOT NULL,                -- 'sdwis' | 'ucmr5' | 'ccr' | ...
    snapshot_date date NOT NULL,
    loaded_at     timestamptz NOT NULL DEFAULT now(),
    row_count     bigint NOT NULL CHECK (row_count >= 0),
    manifest      jsonb NOT NULL,
    is_current    boolean NOT NULL DEFAULT false
);
-- Exactly one current snapshot per source:
CREATE UNIQUE INDEX ON api.data_snapshots (source) WHERE is_current;
```

## Remaining open items

1. Rate-limit counters live in Redis only (sliding window); `api.usage` in
   Postgres is the billing source of truth. Confirm that split is acceptable.
2. v1 data load = the 6-utility / 68-ZIP Palm Beach dataset from this repo
   (owner-confirmed). The 52-utility CITY dictionary drops into
   `water.utilities` + `water.utility_zips` later with no schema change.
