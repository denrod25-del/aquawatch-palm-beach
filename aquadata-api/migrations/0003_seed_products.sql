-- Tier seed rows (approved pricing). stripe_price_id is filled in from the
-- environment at deploy time via the CLI, never hardcoded here.

INSERT INTO api.products
    (code, name, monthly_price_cents, included_calls, limit_period,
     overage_price_micro_usd, stripe_price_id, active)
VALUES
    ('free',    'Free',    0,    100,   'day',   NULL, NULL, true),
    ('starter', 'Starter', 1900, 5000,  'month', 2000, NULL, true),
    ('pro',     'Pro',     4900, 50000, 'month', 2000, NULL, true)
ON CONFLICT (code) DO NOTHING;
