# CHOTA — status

_Last updated: 2026-10-03 · milestones 1–2 done_

**Product (locked):** an offline-first Urdu pastoral memory assistant for livestock herders around Nushki, Balochistan.
**Principle:** CHOTA distinguishes *recorded* from *assumed*. It never treats missing records as truth.

## Milestones

| # | Milestone | State |
|---|---|---|
| 0 | Baseline commit, existing 12-step demo re-run | ✅ all steps ran, no console errors |
| 1 | Honest Trail (GPS freshness, gaps, forgotten trips) | ✅ done, e2e green |
| 2 | Herd-count safety (read-back before writing, no-baseline species) | ✅ done, e2e green |
| 3 | "In my records" wording on historical answers | ⏳ next |
| 4 | Full test run + failure report | ⏳ |
| 5 | Docs (README, FINDINGS) + PWA limits report | ⏳ |

## What milestone 1 changed
- `src/trail.ts` (new, pure): splits a trip into **recorded segments** and **gaps**:
  - *silence*: more than 5 min with no breadcrumb
  - *jump*: more than 300 m at over 10 m/s
  - *head/tail*: silence at the start or end of the trip

  Also `fixState()` (ok / poor (±>100 m) / stale (>2 min) / none) and `isForgotten()` (2 h idle or 14 h open).
- Recorder (`gps.ts`):
  - a fix's timestamp is when it was measured, not when it arrived
  - breadcrumbs only come from fresh, accurate fixes
  - a stationary phone is asked for a fix every 30 s, so silence means "no GPS", not "standing still"
  - fixes are refreshed when the screen comes back on
  - trip start/end never stamp an old position as current
- Distance shown everywhere is **recorded distance** (gaps excluded). Trips store `gapCount` and `gapMs`.
- Map: gaps are thin dotted connectors, never solid. "You are here" turns grey when the fix is stale.
- Answers:
  - home distance and place distance say "last GPS fix N min ago … current position unknown" when the fix is stale
  - way back and last-trip duration state the unrecorded parts
  - "been here" refuses on a stale fix
  - saving a place refuses on a stale fix, and records accuracy when GPS is weak
- Trip screen: a banner says when the trail is **not** being recorded, and why.
- On launch, if a trip looks forgotten:
  - recording is held, so new fixes aren't glued onto the old trip
  - the herder chooses "end at last recorded point" or "still on this trip" (the silence stays recorded as a gap)
- Bug found by the new e2e and fixed: a reminder pop-up could cover the forgotten-trip prompt. Reminders now wait.
- Demo history: breadcrumbs every 2 min. The west trip from 19 days ago has a deliberate 50-min screen-off gap.

## What milestone 2 changed
- Herd changes and counts understood from typed or voice text are **never written directly**:
  - the app reads back what it understood ("میں نے یہ سمجھا: 2 بکریاں — فروخت۔ کیا یہ درست ہے؟")
  - it writes only after ✓; ✗ writes nothing
  - a quantity the parser assumed (no number said) is called out: "تعداد نہیں بتائی، ایک مانی"

  Keypad entries on the Herd screen are explicit taps and still save directly.
- Species with recorded changes but **no confirmed count** are now visible:
  - a herd card with "?" and "Total unknown"
  - a home-screen warning and a proactive reminder

  Before this they were invisible, because only counted species were listed.
- Confirmed vs estimate are visually distinct:
  - confirmed: solid green box with ✓
  - estimate: dashed box with ≈, labelled "not confirmed"; shown only when changes exist since the count
- Urdu grammar: singular ("1 بکری") and oblique forms ("بکریوں کی گنتی"). The old text said "بکریاں کی گنتی".
- New intent tests:
  - assumed quantity
  - "dawai li aur bakri ko di" stays `unknown` (Test 5: an LLM turned this into a death)

## Tests
- `npm test`: 32/32 Urdu intent cases, plus 8 trail-gap unit tests.
- `tests/e2e.mjs` (Playwright, production build, 390×844):
  - the 12 milestone steps
  - T1 forgotten trip, T2 gap drawn dotted, T3 stale real-GPS fix

  - H1 rejected read-back writes nothing, H2 no-baseline species with assumed quantity
  - step 12c now confirms the read-back before the recount is written

  It now asserts and exits non-zero on failure. Status: **all pass, 0 console errors.**

## Known limits / open issues
- **Screen off:** the web app gets no GPS in the background. This is now *recorded honestly as a gap*, but it isn't prevented. Native wrapping is deferred by decision.
- Reminders only fire while the app is open (see milestone 5 report).
- GeoNames has a duplicate "Kili Jamaldini" label (cosmetic).
- Urdu wording of the new caveats is mine; it needs review by a native speaker from the area.
