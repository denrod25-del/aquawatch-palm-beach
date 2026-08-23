-- Checkout needs two prices per paid tier: the flat monthly subscription
-- price (stripe_price_id) and the metered overage price bound to the
-- usage meter (stripe_overage_price_id). Both are filled by `aquadata
-- stripe-setup`, never hardcoded.
ALTER TABLE api.products ADD COLUMN stripe_overage_price_id text;
