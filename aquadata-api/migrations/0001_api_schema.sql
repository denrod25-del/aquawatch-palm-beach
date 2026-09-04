-- api schema: keys, usage, products, Stripe reconciliation, snapshot registry.
-- Approved via docs/proposed-api-schema.md.

CREATE SCHEMA IF NOT EXISTS api;

CREATE TABLE api.products (
    code                    text PRIMARY KEY,
    name                    text NOT NULL,
    monthly_price_cents     integer NOT NULL CHECK (monthly_price_cents >= 0),
    included_calls          integer NOT NULL CHECK (included_calls > 0),
    limit_period            text NOT NULL CHECK (limit_period IN ('day', 'month')),
    overage_price_micro_usd integer CHECK (overage_price_micro_usd IS NULL
                                           OR overage_price_micro_usd >= 0),
    stripe_price_id         text,
    active                  boolean NOT NULL DEFAULT true
);

CREATE TABLE api.keys (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key_hash               char(64) NOT NULL UNIQUE CHECK (key_hash ~ '^[0-9a-f]{64}$'),
    product_code           text NOT NULL REFERENCES api.products(code),
    email                  text NOT NULL,
    stripe_customer_id     text,
    stripe_subscription_id text,
    status                 text NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'revoked', 'suspended')),
    created_at             timestamptz NOT NULL DEFAULT now(),
    revoked_at             timestamptz,
    CHECK (status != 'revoked' OR revoked_at IS NOT NULL)
);

-- Billing source of truth. key_id FK is enforced app-side: FKs from every
-- partition to api.keys make partition maintenance and bulk loads costly.
CREATE TABLE api.usage (
    id                 bigint GENERATED ALWAYS AS IDENTITY,
    key_id             uuid NOT NULL,
    endpoint           text NOT NULL,
    zip                char(5) CHECK (zip IS NULL OR zip ~ '^[0-9]{5}$'),
    status             smallint NOT NULL CHECK (status BETWEEN 100 AND 599),
    latency_ms         integer NOT NULL CHECK (latency_ms >= 0),
    ts                 timestamptz NOT NULL DEFAULT now(),
    stripe_reported_at timestamptz,
    PRIMARY KEY (id, ts)
) PARTITION BY RANGE (ts);

CREATE INDEX usage_key_ts_idx ON api.usage (key_id, ts);
CREATE INDEX usage_unreported_idx ON api.usage (ts) WHERE stripe_reported_at IS NULL;

-- Creates the monthly partition covering `month` if it does not exist.
CREATE FUNCTION api.ensure_usage_partition(month date) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
    part_start date := date_trunc('month', month)::date;
    part_end   date := (part_start + interval '1 month')::date;
    part_name  text := 'usage_' || to_char(part_start, 'YYYY_MM');
BEGIN
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS api.%I PARTITION OF api.usage
         FOR VALUES FROM (%L) TO (%L)',
        part_name, part_start, part_end);
    RETURN part_name;
END;
$$;

-- Current and next month so a month rollover never drops writes.
SELECT api.ensure_usage_partition(now()::date);
SELECT api.ensure_usage_partition((now() + interval '1 month')::date);

CREATE TABLE api.stripe_reports (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    idempotency_key text NOT NULL UNIQUE,
    key_id          uuid NOT NULL REFERENCES api.keys(id),
    window_start    timestamptz NOT NULL,
    window_end      timestamptz NOT NULL,
    quantity        integer NOT NULL CHECK (quantity > 0),
    status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sent', 'failed')),
    attempts        integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error      text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    sent_at         timestamptz,
    CHECK (window_end > window_start)
);

CREATE TABLE api.data_snapshots (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source        text NOT NULL,
    snapshot_date date NOT NULL,
    loaded_at     timestamptz NOT NULL DEFAULT now(),
    row_count     bigint NOT NULL CHECK (row_count >= 0),
    manifest      jsonb NOT NULL,
    is_current    boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX data_snapshots_current_idx ON api.data_snapshots (source)
    WHERE is_current;
