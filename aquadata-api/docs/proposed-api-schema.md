# DRAFT — `api` schema proposal (awaiting approval)

Status: **proposal only, no migration written yet.** Per the build spec, migrations
against the existing database require your sign-off, and the water-data side cannot
be designed until I can inspect the existing schema (connection string / dump not
yet available in the build environment).

The `api` schema below (keys, usage, products, snapshots) is *almost* independent
of the water-data tables, so it can be reviewed now. Open items that depend on the
existing DB are flagged inline.

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

## Open items blocking the rest of step 1

1. Existing water-data schema (SDWIS/UCMR5/CCR tables) — need connection string
   or `pg_dump --schema-only` output.
2. CITY data dictionary (52 utilities → PWS IDs → ZIPs) — not present in this
   repo; need the file or its repo.
3. Rate-limit counters live in Redis only (sliding window); the DB is the
   billing source of truth. Confirm that split is acceptable.
