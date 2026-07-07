# CLAUDE.md — AquaWatch Palm Beach

Guidance for AI assistants working in this repository. There is no README; this file is the primary orientation.

## What this is

**AquaWatch Palm Beach County** is a water-quality transparency and lead-generation web app for Palm Beach County, Florida. Residents look up their drinking-water utility by ZIP code and see PFAS/contaminant readings vs. EPA & EWG guidelines, regulatory violations, Consumer Confidence Reports (CCRs), and a computed water-quality "report card" (A–F grade). Commercially it is a lead-gen tool: consultation requests ("leads") and contaminant alerts are captured and emailed to `iplumbtoo@gmail.com`.

- `package.json` name is the generic template `rest-express` — ignore it; this is AquaWatch.

## Commands

```bash
npm install
npm run dev        # NODE_ENV=development tsx server/index.ts → API + Vite client on port 5000
npm run build      # tsx script/build.ts → client to dist/public, server bundle to dist/index.cjs
npm start          # NODE_ENV=production node dist/index.cjs
npm run check      # tsc --noEmit (the ONLY automated verification)
npm run db:push    # drizzle-kit push (SQLite schema)
```

- **No test framework, no linter, no CI.** `npm run check` (tsc) is the only automated check. Verify changes by running `npm run dev` and exercising the UI, or `curl`ing API routes. Deploy is via Vercel's Git integration.

## Architecture — read this before editing

### Two separate backends (the biggest gotcha)

1. **`server/`** — full Express 5 app for **local development**. Uses `better-sqlite3` (native) + Drizzle ORM, seeds `data.db`. Entry `server/index.ts` → `registerRoutes` (`server/routes.ts`) → `SqliteStorage` (`server/storage.ts`). Implements all read routes (water-systems, readings, trends, violations, summary, alerts, leads, ccr).
2. **`api/index.ts`** — **Vercel production** serverless function. Pure-JS only (no native `better-sqlite3`). Only implements `/api/alerts`, `/api/leads`, `/api/health`; stores alerts/leads in ephemeral `/tmp` JSON and emails leads. It does **not** serve the read routes.

These are independent implementations with different feature sets. Business/read logic exists in three places: `server/storage.ts`, `client/src/data/staticData.ts`, and the seed files — changing a data shape may mean touching all of them.

### Frontend reads static JSON, not the API

The React app does **not** call the API for read data. `client/src/data/staticData.ts` imports bundled JSON (`waterSystems.json`, `readings.json`, `violations.json`, `zipCcr.json`, `ccrReports.json`) and exposes synchronous query helpers. **To change what users see, edit `client/src/data/*.json`, not the server DB.** Only writes (POST alerts/leads) hit the live API via `apiRequest`/react-query mutations — which is why the missing read routes on Vercel don't break the UI.

### Scoring engine

`client/src/lib/scoring/` (barrel `index.ts`): `calculateWaterQualityScore` combines weighted categories (PFAS 0.35, regulatory 0.20, DBP 0.15, lead 0.10, nitrate 0.10, trend 0.10) → 0–100 → letter grade + risk band + recommendation. Consumed by `pages/ReportCards.tsx`.

## Tech stack

- **Language:** TypeScript (ESM, `"type": "module"`), Node 20, `strict: true`.
- **Frontend:** React 18 + Vite 7, **wouter** hash routing, **@tanstack/react-query** v5, **shadcn/ui** (new-york style, Radix) in `client/src/components/ui`, **Tailwind 3.4**, **recharts**, **framer-motion**, **lucide-react**.
- **Backend:** Express 5, Drizzle ORM + better-sqlite3, drizzle-zod + zod, nodemailer (Gmail SMTP).
- **Tooling:** `tsx` (run TS directly), `esbuild` (server bundle), `drizzle-kit`. Deploy: Vercel.

## Directory map

```
api/            Vercel serverless backend. index.ts = alerts/leads/health via /tmp JSON + email.
                (storage-tmp.ts is dead code — not imported by index.ts.)
server/         Local dev Express server: index.ts, routes.ts, storage.ts (SqliteStorage),
                seed.ts, seedZipCcr.ts, email.ts, static.ts, vite.ts.
shared/schema.ts  Drizzle SQLite tables + drizzle-zod insert schemas + shared TS types.
client/src/
  pages/        Dashboard (/), CcrReports (/reports), Verification (/verification), ReportCards (/report-cards)
  components/   ChemicalTag, ThemeProvider, VerificationStatusPanel + ui/ (shadcn)
  data/         Static JSON data (the real read data source) + staticData.ts loader
  lib/          queryClient.ts, utils.ts (cn), scoring/
  hooks/        use-mobile, use-toast
script/build.ts   Custom build: vite build (client) + esbuild bundle (server → dist/index.cjs)
drizzle.config.ts, vite.config.ts, vercel.json, components.json, tailwind.config.ts
```

## Conventions

- **Path aliases** (in both `vite.config.ts` and `tsconfig.json`): `@/*` → `client/src/*`, `@shared/*` → `shared/*`, `@assets` → `attached_assets` (may not exist).
- **shadcn/ui:** components in `client/src/components/ui`; add via shadcn CLI (style "new-york", base "neutral"). Use `cn()` from `@/lib/utils`.
- **snake_case ↔ camelCase:** DB columns and data JSON use `snake_case`; `staticData.ts` maps to `camelCase` for components. Keep snake_case keys when editing data JSON.
- **Booleans are integer 0/1** in the schema (`isHealthBased`, `active`, `notified`) — filter with `=== 1`.
- **Validation:** zod schemas generated from Drizzle via `drizzle-zod` (`insertAlertSchema`, `insertLeadSchema`), used with `safeParse` in `server/routes.ts`.
- **Routing:** wouter hash routing; `main.tsx` forces `window.location.hash = "#/"`. URLs look like `/#/reports`.
- ESM everywhere; `.ts` extension imports allowed; `moduleResolution: bundler`.

## Environment & config

Loaded via `dotenv/config` in `server/index.ts`; see `.env.example`.

- `GMAIL_USER`, `GMAIL_APP_PASSWORD` — Gmail SMTP for lead emails (falls back to console log if unset).
- `ADMIN_KEY` — required as `x-admin-key` header for `GET /api/leads` in production (else 403).
- `PORT` — server port, default 5000.
- `VERCEL` / `VERCEL_ENV` — auto-set by Vercel; skip DB seeding, switch DB path to `/tmp/data.db`.
- `vercel.json` rewrites `/api/:path*` → `/api/index`, everything else → SPA `/index.html`.
- `.gitignore` excludes `data.db*` and `.env*` (keeps `.env.example`).

## Gotchas

- **Ephemeral production persistence.** On Vercel, alerts/leads live in `/tmp` and reset on cold start; the real persistence is the **email notification**. `better-sqlite3` cannot run on Vercel (native), hence the backend split.
- **`api/storage-tmp.ts` is dead code** — `api/index.ts` defines its own inline `/tmp` JSON helpers and never imports it (they even use different filenames).
- **Violations vs. benchmark exceedances:** the code distinguishes real regulatory violations from AquaWatch-computed PFAS benchmark exceedances (`violationType === "BENCHMARK"`). The verification/provenance system (`getUtilityVerificationProfile`, tiers `unverified` → `needs_review` → `source_linked` → `cross_verified`) exists specifically to avoid presenting computed benchmarks as official findings — respect this distinction when editing scoring/summary logic.
- **`script/build.ts` esbuild allowlist references deps not in `package.json`** (`@google/generative-ai`, `axios`, `openai`, `stripe`, etc.) — leftover template noise; harmless but misleading.
- **Lead recipient email is hardcoded** (`iplumbtoo@gmail.com`) in both `server/email.ts` and `api/index.ts`.
- `queryClient.ts` has `API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__"` — a build-time placeholder that normally resolves to `""` (same-origin).
- Express **5** (not 4) — catch-all routes use `"/{*path}"` syntax (see `static.ts`/`vite.ts`).
