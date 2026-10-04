# CHOTA app

The offline Urdu PWA. For what CHOTA is, why it exists, and how to try it, see the [main README](../README.md).

## Commands

```bash
npm install
npm run dev            # dev server, http://localhost:5173
npm run check          # typecheck + lint + unit tests
npm run build          # production build into dist/
npx vite preview --port 4173 &
npm run test:e2e       # Playwright end-to-end flow against the preview (49 checks)
npm run test:layout    # every label checked for overlaps, 3 phone sizes × dark/sun
```

## Code map

| Folder | What lives there | Rules of the road |
|---|---|---|
| `src/core/` | `nlu.ts` (rules parser), `intentModel.ts` (AI classifier), `trail.ts` (recorded vs gaps, GPS freshness), `geo.ts` | Pure functions, no browser or database; unit-tested with `node --test` |
| `src/data/` | `db.ts` (IndexedDB schema via Dexie), `demo.ts` (labelled demo data) | All records stay on the phone and carry their own time |
| `src/services/` | `answer.ts` (understand → act), `gps.ts` (position + trip recorder), `reminders.ts`, `herd.ts`, `speech.ts`, `clock.ts` | Anything that changes a record goes through a read-back (`PendingWrite`) unless the herder tapped it directly |
| `src/ui/` | `common.tsx` (label, icons, modal), `VoiceAsk.tsx`, `modals.tsx`, `MapView.tsx`, `constants.ts`, `hooks.ts` | Urdu first, English subtitle optional; icons never touch text |
| `src/screens/` | One file per screen: Home, Trip, Herd, Reminders, MapScreen, History, Settings | |
| `src/App.tsx` | Shell: header, navigation, the after-trip sequence (reminder → rating → count) | One modal at a time |

## How a sentence is handled

```
text → core/nlu.parse (rules) ──┬─ understood ──┐
                                └─ not sure ─────┤→ core/intentModel.classify (AI) second opinion
                                                 ▼
                              services/answer: question → answer now
                                               record change → read-back → ✓ commitPending / ✗ nothing
```

The thresholds (`AI_MIN_P`, `AI_OVERRIDE_P`, `AI_FIRST_P`, `OOS_VETO_P` in `services/answer.ts`) were chosen on
held-out data with `ml/evaluate.ts`, which runs the same policy as the app.
