# CHOTA — چھوٹا

**Small AI. Big memory.** CHOTA is an offline-first Urdu pastoral memory assistant for livestock herders around
Nushki, Balochistan. It remembers where you grazed, the places you named, the way home, your reminders and your
herd count. It works with no network, and nothing leaves the phone.

**Core principle:** CHOTA tells *recorded* apart from *assumed*. It knows when its memory is stale or incomplete,
and it says so instead of treating missing records as truth.

## What it does (MVP)

| Feature | What "honest" means here |
|---|---|
| **Grazing trip memory**: GPS breadcrumb trail, trip history, your own grazing rating | Gaps in the trail (screen off, no GPS, a jump) are kept as gaps and drawn dotted. Distance counts recorded parts only |
| **Named places**: "اس جگہ کو پرانا چارہ یاد رکھو" | Refuses to save from a stale GPS fix; stores the accuracy |
| **Home distance, direction and way back**: your own walked track, not a computed route | Answers from a stale fix say "last GPS N min ago … current position unknown" |
| **Reminders**: Urdu dates such as "کل صبح", "تین دن بعد" | A reminder shown after its time says how late it is |
| **Herd count**: confirmed vs estimated, with recount prompts | Changes said by voice or text are read back and saved only on ✓. A species with no confirmed count shows "total unknown" |
| **Urdu interaction**: typed or keyboard-mic Urdu / Roman Urdu, templated Urdu replies, Urdu text-to-speech where the phone has a voice | Historical answers say "میرے ریکارڈ میں" (in my records) |

**Not in the MVP (cut):** animal health, individual animal IDs, finances, water discovery, satellite grazing advice.
The Sentinel-2 vegetation-anomaly pipeline in `../feasibility/` is a stretch feature only (see `../FINDINGS.md`).

## Architecture

```
src/
  App.tsx        screens: Home, Trip, Ask, Reminders, Herd, Map, History, Settings; trip/reminder modals
  nlu.ts         deterministic Urdu / Roman-Urdu intent parser (no model). Test 5: rules beat on-device LLMs
  answer.ts      runs an intent against local data → templated Urdu + English answer; herd writes become
                 a PendingWrite that needs confirmation
  trail.ts       pure: recorded segments vs gaps, GPS fix freshness, forgotten-trip rule
  gps.ts         position source (real GPS or labelled demo walk), trip recorder, wake lock, open-trip check
  herd.ts        confirmed count + recorded changes → estimate / stale / no-baseline status
  reminders.ts   due-reminder check (runs while the app is open), proactive recount prompts, notifications
  db.ts          Dexie (IndexedDB) schema: trips, points, places, confirmations, herdEvents, reminders, settings
  MapView.tsx    Leaflet over an offline Sentinel-2 image, GeoNames villages, Pakistan border
  clock.ts       app clock with a demo "+N days" offset (labelled in the header)
  demo.ts        labelled demo history (includes one trip with a screen-off gap)
public/data/     basemap.jpg + bounds, villages.json (GeoNames), pakistan.geojson (geoBoundaries)
```

- **Offline:** a PWA (vite-plugin-pwa / Workbox) precaches the app, fonts and map data. Storage is IndexedDB only.
- **No AI model on the critical path.** Parsing is rules. Anything that changes the herd count is confirmed by the herder.
- **Demo mode:** simulated GPS and a clock offset, both shown as yellow badges in the header. Off = real phone GPS.

## Run

```bash
npm install
npm run dev                 # http://localhost:5173 (also on LAN: open it on a phone)
npm test                    # Urdu intent cases + trail-gap unit tests (node --test, no extra deps)
npm run build && npx vite preview --port 4173 &
node tests/e2e.mjs /tmp/shots   # Playwright: 12-step demo + honesty checks; exits non-zero on failure
```

## Known platform limits (web app)
- **GPS stops when the screen is off** or another app is in front. CHOTA keeps the screen on during a trip
  (wake lock, re-taken when you come back) and records any silence as a gap. It cannot prevent the gap.
- **Reminders fire only while CHOTA is open.** Overdue ones appear on next open, labelled late.
- Browser speech recognition needs a network connection. The offline path is the keyboard's mic (Gboard Urdu voice typing).

Status and next steps: `../STATUS.md`.
