# AquaData composite score — methodology v1.0 (DRAFT, pending approval)

Scale: **0–100, higher is better.** Every number in a response is traceable to a
source row with a snapshot date (`meta.sources`). The score is informational and
is not a substitute for utility CCRs or certified lab testing.

## Components and weights (proposed)

| Component | Weight | What it measures |
|---|---|---|
| `violations_5yr` | 30% | SDWIS violations in the trailing 5 years, health-based weighted heavier |
| `pfas_ucmr5` | 30% | PFAS occurrence vs EPA MCLs (UCMR5 / CCR sampling) |
| `lead_copper_90th_pct` | 20% | Lead 90th-percentile vs the 15 ppb action level |
| `enforcement_5yr` | 10% | Formal/informal SDWIS enforcement actions, trailing 5 years |
| `hardness` | 10% | Aesthetic/secondary quality (scaling, appliance wear) — lowest weight because it is not a health standard |

Weights were set to keep the emphasis of the existing AquaWatch engine (PFAS
heaviest, regulatory history second) while conforming to the five-layer
structure. **These are proposed, not final.**

## Per-component normalization (each yields 0–100)

### violations_5yr
Start at 100. For each violation with `start_date` in the trailing 5 years:
health-based −25, monitoring/reporting/other −8, plus −10 if the violation is
unresolved (`status = 'Ongoing'`). Floor at 0.

### pfas_ucmr5
Let `r` = max over detected compounds of `value / epa_mcl` (per-compound MCLs:
PFOA 4 ppt, PFOS 4 ppt, PFHxS 10, PFNA 10, HFPO-DA 10). Using each compound's
most recent sample only.
- No detections: 100
- `0 < r <= 1`: linear 100 → 60
- `1 < r <= 5`: linear 60 → 0
- `r > 5`: 0

### lead_copper_90th_pct
`p90` = lead 90th-percentile (ppb) from the most recent monitoring period.
- `p90 = 0`: 100
- `0 < p90 <= 15` (action level): linear 100 → 50
- `15 < p90 <= 30`: linear 50 → 0
- `p90 > 30`: 0

### enforcement_5yr
Start at 100. Formal action −35, informal action −15, floor 0.

### hardness
mg/L as CaCO3, USGS bands; scored for consumer experience, not health:
| Range | Classification | Score |
|---|---|---|
| 0–60 | soft | 100 |
| 61–120 | moderately_hard | 85 |
| 121–180 | hard | 70 |
| 181–250 | very_hard | 55 |
| >250 | very_hard | 40 |

## Missing-data policy (proposed)

A component with no source rows for the utility is reported as
`{"status": "no_data"}` — never scored as 0 and never fabricated. Its weight is
redistributed proportionally across the components that do have data, and the
response's `score.confidence` drops from `"full"` to `"partial"` listing the
missing components. If fewer than two components have data, no composite is
returned (`"composite": null`, `"confidence": "insufficient_data"`).

Known v1 gaps for the Palm Beach dataset: `enforcement_5yr` and `hardness`
have no source rows yet; both will report `no_data` until SDWIS enforcement
and hardness layers are ingested.

## Multi-utility ZIPs

The composite shown at the top level is the primary utility's (largest
`population_served`); per-utility scores appear in `score.components`.

## Versioning

`methodology_version` is returned in every response. Any change to weights,
normalization, or missing-data policy increments the version; historical
versions remain documented here.
