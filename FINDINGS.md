# CHOTA — feasibility log

> **Product direction (locked 2026-10-03):** CHOTA is an offline-first Urdu pastoral **memory** assistant: trip
> breadcrumbs, named places, home/way back, reminders, herd count (confirmed vs estimated). It is not a
> grazing-recommendation product.
> **Satellite intelligence is stretch-only.** Tests 1/1b showed the vegetation signal is real only after strong rain
> (~2 wet seasons in 8 years) and is noise in dry periods. The pipeline is kept in `feasibility/` but is not in the
> MVP, the app or the demo (the Sentinel-2 image used as the offline basemap is only a picture, not analysis). The sections below are the experiment log; satellite "MVP scope" items are superseded.
> Current build state: `STATUS.md`.

## Test 1 (2026-10-03) — short-term signal, 40×40 km around Nushki
Scripts: `feasibility/t1_inventory.py`, `t1_signal.py`, `t1_spatial.py`.

| Check | Result |
|---|---|
| Freshness | Latest clear S2 scene 1 day old; revisit 2–3 days. **Not a constraint.** |
| Oct NDVI rangeland vs bare | 0.043 vs 0.043, indistinguishable |
| 5/10/30-day change | Moves identically on rangeland and bare soil, so atmosphere noise. **No short-term signal.** |
| OSM landmarks | 2 named places. Unusable. |

## Test 1b (2026-10-03) — seasonal anomaly, 50 km radius
Scripts: `t1b_anomaly.py` (composites, masks, CHIRPS), `t1b_analyze.py`, `t1b_lag.py`, `t1b_candidates.py`.
Method: per-pixel median NDVI of 6 clearest S2 dates in a month window (~100 m), minus the median of
the same window in the other years (2019–2026), aggregated to 4 km zones, region-wide shift removed.
Noise floor = 97.5th pct of the same statistic in the **dry season** (no rain-driven greening):
T_dry = 0.0094 NDVI, so ~2.5% of zones exceed it by chance.
Masks: outside Pakistan (**19% of the 50 km disc is Afghanistan**), >50 km, crops/built/trees/water (IO LULC 2023).

| Year | Nov–Mar rain (CHIRPS) | Mar zones > T | Apr zones > T | Largest Apr cluster |
|---|---|---|---|---|
| 2019 | 192 mm (rain mostly in Mar) | 0.0% | **11.1%** | 560 km² |
| 2020 | 160 mm (rain mostly in Jan) | **14.9%** | **24.5%** | 832 km² |
| 2021 | 68 | 0.0 | 3.3 | 192 |
| 2022 | 115 | 1.6 | 0.3 | 16 |
| 2023 | 98 | 1.1 | 3.8 | 96 |
| 2024 | 122 | 0.0 | 4.9 | 208 |
| 2025 | 92 | 1.4 | 0.0 | 0 |
| 2026 | 138 | 3.0 | 5.7 (marginal) | 208 |
| **Live Sep 10–Oct 2 2026** | — | **0 zones; region −0.005 vs normal** | | |

Readings:
- Signal is **real, rain-driven, lagged 4–8 weeks**, spatially coherent (2020: contiguous E/SE block, W drier).
- Strong only in **wet seasons (~2 of 8 years)**; moderate years are marginal (~2× noise rate); dry years show nothing.
- Effect size is small in absolute terms (+0.015–0.03 NDVI; zone NDVI ~0.10–0.12). Per-zone SNR 1.2–2.1;
  confidence comes from cluster size + coherence, not individual zones.
- Live dry-season pack correctly reports **nothing stands out**.
- GeoNames: 430 populated places within 50 km (incl. Kili Jamaldini), 384 intermittent streams, 85 springs.
  Every candidate area gets a village within ~1–5 km. **Landmarks solved.**

## Assumptions
**Validated**
- Fresh imagery (1–3 day latency)
- A seasonal "greener than usual" signal exists and is detectable in wet years, with a 4–8 week lag after rain
- Dry-season null control behaves (method doesn't hallucinate zones)
- GeoNames supplies recognisable village landmarks
- Whole pipeline runs from open data with no Earth Engine account (Planetary Computer + CHC + geoBoundaries + GeoNames)

**Invalidated**
- 5–10-day vegetation trend is meaningful
- Dry-season rangeland/bare separation
- A calendar-fixed window (March) works; it must follow rainfall
- March 2026 is a good replay (it isn't: noise level)
- OSM landmarks

**Untested**
- Offline Urdu ASR / TTS on the target phone (now the critical path)
- Ground truth: do herders recall spring 2019/2020 east/southeast being good?

## Risks
- Satellite feature is seasonal; most days it says "nothing stands out". Value is real but episodic.
- Small absolute NDVI effect: must not be presented as forage quantity
- 50 km disc crosses the Afghan border; masking is mandatory
- CHIRPS is 5 km and gauge-sparse here: use for "did it rain", not for where
- Background GPS in a PWA stops when the screen is off

## Zone schema (stretch feature only, not built)
```json
{
  "zone_id": "SE_01",
  "direction": "southeast", "direction_ur": "جنوب مشرق",
  "distance_km": 31.4,
  "near_landmark": "Kili Qadar Bakhsh", "landmark_offset_km": 2.1,
  "area_km2": 832,
  "signal": "greener_than_usual",            // or "normal" / "drier_than_usual" / "no_data"
  "greener_than_usual_by": 0.015,            // NDVI vs same-month 2019-2026, region shift removed
  "confidence": "medium",                    // high|medium|low from SNR + cluster size; no fake decimals
  "baseline": "same month, 7 other years (2019-2026)",
  "observation_window": "2020-04-04/2020-04-29",
  "observation_age_days": 3,
  "season_rain_mm": 160,
  "data_mode": "replay"                      // live | replay, always shown
}
```

## ~~MVP scope~~ (satellite-era plan; superseded 2026-10-03)
_Items 1–2 moved to Stretch. Items 3–4 are in the locked MVP and built in `app/` (rules-based Urdu, no packs)._

1. Offline regional pack: zone GeoJSON + Pakistan mask + GeoNames subset + raster tiles (PMTiles)
2. Two packs: **live Sep–Oct 2026** ("nothing stands out, region slightly drier than usual") and **labelled replay** (wet season)
3. Home coordinate, breadcrumb trail, trip history, "you were here X days ago"
4. Fixed set of Urdu intents → templated Urdu answers (pending Test 4)

## Stretch (only if time remains after the MVP is demo-ready)
- **Satellite anomaly pack**, rain-triggered, and only shown after a strong wet season. Must say "nothing stands out" on most days and must never be presented as forage quantity
- Rain-triggered auto-refresh of the anomaly pack
- Herder-recorded observations as ground truth
- Water layer (excluded by default)

## Decision (2026-10-03, after Test 1b)
Satellite anomaly is demoted to an **event-driven stretch feature** (pipeline preserved in `feasibility/`).
CHOTA is being reconsidered as an offline Urdu livestock/pastoral memory assistant; compared against Farm Memory.
Context from Test 1b: within 50 km of Nushki, land cover is ~66% rangeland, ~30% bare, ~2% cropland.

## Test 5 (2026-10-03): Urdu speech-to-ledger extraction
Gold set `test5/gold.jsonl` written and frozen **before** any parser (42 utterances, 46 events; 30 Urdu script as ASR
would emit, 12 Roman Urdu; sha256 in `gold.sha256`). Scorer `test5/score.py`. Caveat: I wrote both test set and rules,
so the rules number is optimistic; a blind held-out set from real herder phrasing is required.

| Extractor | Fully correct | Event F1 | Amounts | Median / max latency (M4) | Size |
|---|---|---|---|---|---|
| **Rules (`rules.py`), first run, untuned** | **36/42 (86%)** | **0.94** | 18/20 | ~0 | ~15 KB code |
| Gemma-3n-E2B Q4 | 21/42 (50%) | 0.92 | 12/21 | 1.0 s / 9.3 s | 2.8 GB |
| Gemma-3n-E2B + number pre-normalization | 23/42 (55%) | 0.91 | 12/21 | 1.0 s / 4.3 s (CPU 4-thread: 1.25 / 11.6 s) | 2.8 GB |
| Qwen3-1.7B Q4 (+ prenorm) | 10 (15)/42 | 0.73 | 3/17 (9/14) | 0.7 s | 1.0 GB |
| Qwen2.5-1.5B Q4 | 7/42 | 0.50 | 1/12 | 0.6 s | 1.0 GB |
| Gemma-3-1B Q4 | 0/42 | 0.31 | 1/8 | 0.5 s | 0.8 GB |

Findings:
- Small LLMs recognise *that* an event happened (Gemma-3n F1 0.92) but fail on amounts, tense/date and event splitting,
  and **hallucinated a death** ("dawai li ... bakri ko di" -> death). Unacceptable for a ledger.
- Rules: 100% on species, qty, credit, item; all 3 missing-price follow-ups flagged. Known bugs: "sava lakh" (=125000),
  noun-only clause merge ("کھل اور دانہ"), "medicine bought + given" merge, Roman "aur" in counts, future-return date in trip.
- Phone proxy: Gemma-3n on 4 CPU threads ~1.25 s median on M4, so expect several seconds on a mid-range Android, and 2.8 GB.

Decision: **rules-first extraction + Urdu readback confirmation + follow-up questions**; LLM not on the critical path
(optional fallback only for utterances the rules can't parse, always confirmed).
Open risk: rules are brittle to ASR spelling errors. Next: blind set as *real Gboard Urdu voice-typing output*.

## Decision (2026-10-03): product locked
MVP: grazing trip memory (local GPS breadcrumbs), user-saved named places, home distance + direction + breadcrumb way
back, local reminders, herd count with confirmed vs estimated state and recount prompts, local Urdu interaction.
Cut: animal health diagnosis/observations, individual animal ID, detailed finances, water discovery, satellite
grazing recommendation as core. (Test 5's ledger amounts/credit fields are therefore not used by the app.)
Principle: CHOTA must distinguish *recorded* from *assumed*. Implementation notes in `STATUS.md`.
