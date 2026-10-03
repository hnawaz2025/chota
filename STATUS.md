# CHOTA — status

_Last updated: 2026-10-03 · milestones 1–5 done · PWA is demo-ready (desktop-verified; not yet on a real phone)_

**Product (locked):** an offline-first Urdu pastoral memory assistant for livestock herders around Nushki, Balochistan.
**Principle:** CHOTA distinguishes *recorded* from *assumed*. It never treats missing records as truth.

## Milestones

| # | Milestone | State |
|---|---|---|
| 0 | Baseline commit, existing 12-step demo re-run | ✅ all steps ran, no console errors |
| 1 | Honest Trail (GPS freshness, gaps, forgotten trips) | ✅ done, e2e green |
| 2 | Herd-count safety (read-back before writing, no-baseline species) | ✅ done, e2e green |
| 3 | "In my records" wording on historical answers | ✅ done, e2e green |
| 4 | Full test run + failure report | ✅ 0 failures (details below) |
| 5 | Docs (README, FINDINGS) + PWA limits report | ✅ done |
| 6 | **Real-phone field test** (checklist below) | ⏳ next, needs a mid-range Android |

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

## What milestone 3 changed
- All historical answers start with "میرے ریکارڈ میں" / "In my records":
  - good grazing, last trip in a direction, trips this month, last trip duration, been here
- "No record" is never presented as "never happened". For example: "ہو سکتا ہے آپ گئے ہوں لیکن وہ سفر CHOTA پر ریکارڈ نہ ہوا ہو".
- Trip counts say "only trips started in CHOTA" and report unrated trips separately. Good-grazing answers mention unrated trips.
- The herd estimate is described as "based only on recorded changes".
- The history screen header says: "Only trips recorded in CHOTA — not a complete history".

## Milestone 4: PWA robustness found while testing
- **Wake lock was lost after the first screen-off.** It was requested once at trip start, but the browser releases it
  whenever the page is hidden. Fix: it is re-taken when the app becomes visible, after a reload with an open trip,
  and on "still on this trip".
- **Overdue reminders looked on-time.** A reminder that comes due while the app is closed shows on next open as
  "N دیر سے — وقت پر ایپ بند تھی". The system notification body gets a "(دیر سے)" prefix.
- Trip screen: a one-line note says the trail is not recorded with the screen off. It shows a stronger warning if
  the phone can't keep the screen on.

## Test results (final run, 2026-10-03)
| Suite | Result |
|---|---|
| `tsc -b` | clean |
| `oxlint` | 0 errors, 5 warnings (all pre-existing: inline `Row` component in Settings, MapView hook deps) |
| `npm test` (32 intent cases + 8 trail-gap tests) | **all pass** |
| `tests/e2e.mjs` (32 steps: 12 demo + honesty checks) | **all pass on 3 consecutive runs, 0 console errors** |

Failures hit and fixed along the way (all real bugs, not test noise):
1. A reminder pop-up covered the forgotten-trip prompt.
2. The voice recount wrote without confirmation. This is the old behaviour, now intentionally changed.
3. Urdu species grammar.

The only failure on the untouched baseline was "none": the old e2e had no assertions.

## Tests
- `npm test`: 32/32 Urdu intent cases, plus 8 trail-gap unit tests.
- `tests/e2e.mjs` (Playwright, production build, 390×844):
  - the 12 milestone steps
  - T1 forgotten trip, T2 gap drawn dotted, T3 stale real-GPS fix
  - H1 rejected read-back writes nothing, H2 no-baseline species with assumed quantity
  - 7/8b/8d/8e: historical answers are framed "in my records", and "no record" never means "never went"
  - step 12c now confirms the read-back before the recount is written

  It now asserts and exits non-zero on failure. Status: **all pass, 0 console errors.**

## PWA limits report

**Does the app survive the full demo flow?** Yes, in Playwright Chromium at phone size (390×844), against the
production build, including offline reload. It has **not** been run on a physical Android phone yet.

**What fails when the screen turns off?** This is from Android Chrome platform behaviour, not yet measured on our phone:
- The page is hidden, so `watchPosition` stops delivering, timers are throttled and then frozen, and the wake lock is
  released. **No breadcrumbs are recorded.**
- CHOTA's handling:
  - silence over 5 min becomes a recorded gap, drawn dotted and excluded from distance
  - the way back and duration answers state the gap
  - when the screen comes back on: an immediate GPS refresh, and the wake lock is re-taken
  - if the app was gone for over 2 h (or the trip is over 14 h old): the forgotten-trip prompt on next launch
- Not fixed:
  - the path during the gap is simply unknown
  - a screen-off **under 5 min** is not flagged, and its ends are joined as if walked (up to ~400 m at herding pace). This is the threshold trade-off.
- Reminders due during screen-off don't fire until the app is visible again, and are then labelled late.
- Swiping the app away behaves the same as screen-off, plus the forgotten-trip check.
- The demo workaround is the wake lock (screen stays on). Its battery cost over a 4–6 h trip is **unmeasured**.

**Can local notifications work reliably enough for the demo?**
- **Yes, if CHOTA is open in the foreground.** It checks every 15 s and fires a pop-up, Urdu text-to-speech if
  available, and a system notification if permission is granted.
- **No, if it's closed:**
  - the web has no scheduled local notifications (Notification Triggers was abandoned)
  - Periodic Background Sync is gated on engagement and runs at most about every 12 h
  - push needs a server and network
- For the demo, trigger reminders with the "+N days" clock, or keep the app open. Reminder parsing supports hours and
  days but not minutes ("5 منٹ بعد"). That would be a small addition if a live in-demo reminder is wanted.

**Would a minimal Capacitor wrapper materially improve the prototype?**
- **Recommendation: not now.**
- It would fix the two real limits:
  - background location, via a foreground-service plugin
  - closed-app reminders, via `@capacitor/local-notifications`
- But:
  1. This machine has no Android SDK, `adb` or Android Studio (only JDK 17), so the toolchain is a multi-GB setup first.
  2. Background location means Android 14 foreground-service types, the "Allow all the time" permission, and a
     second GPS code path. That is the riskiest part, and it can only be tested on a device.
  3. The PWA now records honestly what it can't capture, so the demo is truthful without native code.
- If time remains **after** the real-phone test, the lowest-risk step is to wrap with **local-notifications only**,
  keeping the web GPS path unchanged. Background geolocation should wait.

## Real-phone field test checklist (milestone 6)
1. Install the PWA on a mid-range Android, turn on airplane mode, and confirm the app, map and fonts load.
2. Real GPS (Demo GPS off), 30-min walk with the screen on: check breadcrumb density, accuracy, and battery %/hour.
3. Same walk with the screen off for about 10 min: confirm a gap appears, is drawn dotted, and the way back mentions it.
4. Lock the phone for 3 h during an open trip, then reopen: the forgotten-trip prompt should appear.
5. Gboard Urdu voice typing **offline** into Ask: record what text it actually emits (seeds the blind test set from Test 5).
6. Urdu text-to-speech voice: present or absent on the device.
7. Reminder due in 1 h with the app (a) open, (b) backgrounded, (c) closed: note when and whether it fires.

## Known limits / open issues
- Screen off / closed-app reminders: see the PWA limits report above.
- Never tested on a real phone. Battery cost of keeping the screen on is unknown.
- GeoNames has a duplicate "Kili Jamaldini" label (cosmetic).
- Urdu wording of the new caveats is mine; it needs review by a native speaker from the area.
