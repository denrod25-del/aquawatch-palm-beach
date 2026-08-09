-- Track when a Stripe push was last attempted so retries can back off.
ALTER TABLE api.stripe_reports ADD COLUMN last_attempt_at timestamptz;
