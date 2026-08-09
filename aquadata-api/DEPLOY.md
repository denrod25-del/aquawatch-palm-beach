# Deploying AquaData API to the VPS

Target: existing VPS behind Nginx. You handle DNS/SSL; this doc covers the
service, the Nginx location block, and the cron jobs.

## 1. System requirements

- Python 3.12 (`python3.12 -m venv`)
- Postgres 16 and Redis 7 reachable from the app
- Nginx with your existing SSL termination

## 2. Install

```bash
sudo useradd -r -m -d /opt/aquadata aquadata
sudo -u aquadata git clone <repo> /opt/aquadata/app
cd /opt/aquadata/app/aquadata-api
sudo -u aquadata python3.12 -m venv /opt/aquadata/venv
sudo -u aquadata /opt/aquadata/venv/bin/pip install -e .
sudo -u aquadata cp .env.example /opt/aquadata/env   # then edit with real values
sudo chmod 600 /opt/aquadata/env
```

Create the database objects and load data:

```bash
set -a; source /opt/aquadata/env; set +a
/opt/aquadata/venv/bin/python -m aquadata.cli migrate
/opt/aquadata/venv/bin/python -m aquadata.cli seed-palm-beach \
    --data-dir /opt/aquadata/app/client/src/data --snapshot-date 2025-07-01
```

## 3. systemd unit

Install `deploy/aquadata-api.service` to `/etc/systemd/system/`, then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now aquadata-api
curl -s http://127.0.0.1:8500/v1/health   # {"status":"ok",...}
```

## 4. Nginx location block

Include `deploy/nginx-aquadata.conf` inside your existing `server {}` block
(the one that already terminates SSL for the API hostname), then
`sudo nginx -t && sudo systemctl reload nginx`.

## 5. Stripe (paid tiers)

1. In the Stripe dashboard create a Billing **Meter** with event name
   `aquadata_api_call`, then metered Prices for Starter ($19/mo + $0.002/call
   overage) and Pro ($49/mo + $0.002/call overage).
2. Set each price id: `UPDATE api.products SET stripe_price_id='price_...'
   WHERE code='starter';` (same for `pro`).
3. Put `STRIPE_API_KEY` in `/opt/aquadata/env` and restart the service. The
   60s in-process batcher starts automatically when the key is present.

Until Stripe is configured, paid signup returns 503 and the free tier works;
usage keeps recording in `api.usage` and reconciles later.

## 6. Cron

```cron
# Monthly data refresh (after downloading the new snapshot + manifest)
15 6 1 * *  aquadata  . /opt/aquadata/env-export.sh && /opt/aquadata/venv/bin/python -m aquadata.cli refresh --data-dir /opt/aquadata/snapshots/current --manifest /opt/aquadata/snapshots/current/manifest.json --snapshot-date "$(date +\%Y-\%m-01)"

# Usage partitions: create next month's before it starts
0 5 25 * *  aquadata  . /opt/aquadata/env-export.sh && /opt/aquadata/venv/bin/python -m aquadata.cli ensure-partitions

# Stripe reconciliation backstop (batcher already runs in-process every 60s)
30 * * * *  aquadata  . /opt/aquadata/env-export.sh && /opt/aquadata/venv/bin/python -m aquadata.cli stripe-reconcile
```

Where `/opt/aquadata/env-export.sh` is `set -a; . /opt/aquadata/env; set +a`.

A failed refresh (missing files, >10% row-count delta) exits non-zero and
changes nothing — the previous snapshot keeps serving. The prior generation
stays queryable as schema `water_old` until the next successful refresh.

## 7. Operational notes

- **Key revocation** (`UPDATE api.keys SET status='revoked',
  revoked_at=now() WHERE id=...`) takes effect within 60s per worker
  (in-process auth cache TTL).
- **Response cache** is 24h in Redis, keyed by snapshot fingerprint — a
  successful refresh invalidates it within ~5s with no manual step.
- **Logs**: structured JSON on stdout → journald. No API keys or emails are
  ever logged; ZIP codes are the only request-scoped identifier.
- **Usage buffer**: billable rows batch-insert every 0.5s; a hard crash can
  lose at most that window (under-billing only, never over-billing).
