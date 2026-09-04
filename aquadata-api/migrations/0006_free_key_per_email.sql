-- Abuse control: one active free-tier key per email. Enforced in the DB so
-- concurrent signups cannot race past the application-level check.
CREATE UNIQUE INDEX keys_one_active_free_per_email_idx
    ON api.keys (email)
    WHERE product_code = 'free' AND status = 'active';
