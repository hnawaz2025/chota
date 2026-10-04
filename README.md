# CHOTA · چھوٹا

**Small AI. Big memory.** An offline, voice-first Urdu memory assistant for livestock herders in Balochistan.

CHOTA remembers what a herder would otherwise have to keep in their head: where they grazed, where they found water and
shade, the way back home, what they need to do on the way back, and how many animals they have. It runs entirely on a
cheap phone, with no internet and no server, and nothing ever leaves the device.

> **Live app:** [chota-iota.vercel.app](https://chota-iota.vercel.app) · **Tech walkthrough (60 s):** [How I built CHOTA](https://claude.ai/artifact/GMNr1YDXGTi6cCJwGAAYf2)

---

## Why I built this

I'm from Balochistan, and I've watched people in my own family live this.

About **70% of people in Balochistan depend on livestock, directly or indirectly**, and the province holds around
**40% of Pakistan's livestock** ([Express Tribune](https://tribune.com.pk/story/2116676/1-balochistan-contributes-40-total-livestock)).
Herders carry a large part of the local economy on their shoulders. Yet almost everything they know lives only in
their memory: which direction had good grass last week, where the karez still had water, how far they walked, how many
animals went out and how many came back.

Memory alone works until it doesn't:

- **Planning is guesswork.** Without a record of where grazing was good or water was found, every day starts from scratch.
- **Storms, drought and heat turn mistakes into losses.** In a sandstorm, or on a day of extreme heat, knowing that
  there is water 2 km to the north-west and shade near it can save animals, and the herder.
- **Losses can't be proven.** After a flood, a drought or a theft, a clear count of the herd before and after is what
  makes compensation or insurance possible. Without records, a herder has only their word.

I wanted to build something that respects how herders already work: by voice, in Urdu, outdoors, on whatever phone
they have, without signal. And it had to be honest about what it doesn't know.

---

## What it does

Talk to it in Urdu or Roman Urdu. One big mic; everything else is a shortcut.

| Feature | Example | Why it's honest |
|---|---|---|
| **Trip memory** | "سفر شروع کرو" records a GPS trail | GPS gaps stay gaps (drawn dotted); distance counts only what was recorded |
| **Named places** | "اس جگہ کا نام چشمہ رکھیں" saves 💧 water here | Never saved from an old GPS fix; no name said → it asks |
| **The way home** | "واپسی کا راستہ دکھاؤ" | Shows the herder's *own* recorded trail plus home direction and distance; never invents a route |
| **Where to go today** | "گرمی ہے، قریب پانی والی جگہ بتاؤ" | Answers only from the herder's own records, with their age; says today's conditions are unknown |
| **Reminders** | "واپسی پر کریم چاچا کی بکریاں چھوڑنی ہیں" fires when the trip ends | Read back before saving; a late reminder says it's late |
| **Herd count** | "میرے پاس 47 بکریاں ہیں", "دو بکریاں بیچیں" | A physical count is the only confirmed number; the estimate is always labelled as one; after a trip it asks you to count what came home and flags any difference instead of guessing |

**The principle running through all of it:** CHOTA tells *recorded* apart from *assumed*. Historical answers say
"میرے ریکارڈ میں" (in my records). Nothing that changes a record is saved without the herder's ✓.

---

## How I built it

### 1. Experiments before code
I tested the big ideas before building anything. Two of them changed the project.

- **Satellite grazing advice: cut.** I analysed eight years of Sentinel-2 vegetation data around Nushki. The
  "greener than usual" signal was real only after heavy rain (2 of 8 years) and was noise in dry months, so I cut it
  from the product rather than ship advice I couldn't trust. ([`feasibility/`](feasibility), [`FINDINGS.md`](FINDINGS.md))
- **Small AI models vs simple rules: rules won.** I ran four small on-device language models against hand-written
  Urdu rules on 42 herder sentences. Rules got **86%** right; the best model got **50%**, and one **invented an animal
  death** that was never said. For a herder's records, that is unacceptable. ([`test5/`](test5))

### 2. Rules first, my own AI second
Language understanding has two layers:

1. **Rules** (`app/src/core/nlu.ts`): precise, and they extract the details: numbers ("ساڑھے چھ"), animals, times
   ("کل صبح 6 بجے", "واپسی پر"), directions, place names, and needs (water, heat, nearby).
2. **My own intent classifier** (`app/src/core/intentModel.ts`, trained in [`ml/`](ml)): a small model (letter-chunk
   TF-IDF + logistic regression) trained on 9,200 Urdu, Roman-Urdu and English sentences, including speech-typing
   misspellings. It is **203 KB**, runs in **0.1 ms**, fully offline, and it only **picks one of 23 commands**. It
   never writes text, so it cannot invent a record.

How they work together:

- the AI gives a second opinion and overrules a weak rule guess when it is confident
- when unsure, it asks "کیا آپ کا مطلب یہ ہے؟" with two buttons
- out-of-scope questions (animal health, prices, weather) are declined
- anything that changes a record is read back in Urdu for ✓

### 3. An honest, offline app
- **Offline web app (PWA):** React + TypeScript, built with Vite. A service worker saves the app, fonts, satellite map
  and AI model on the first visit; after that it works in airplane mode.
- **On-phone memory:** IndexedDB (via Dexie). Trips, GPS points, places, herd counts and changes, reminders. Every
  record keeps its time, so answers can say how old a memory is.
- **Honest GPS:** a point is only saved from a fresh, accurate fix. Silence over 5 minutes becomes a gap, an old fix
  is "last known", and near home it simply says "at home" instead of a jittery distance.
- **Designed for the field:** Urdu first, with optional English subtitles. Dark by default, with a ☀️ sun mode for
  direct sunlight. Large buttons. The home screen fits one phone screen.

### 4. Checked by machines
- **96** Urdu command tests and **12** trail/time unit tests
- **49** end-to-end checks that drive the real built app, including one complete herder's trip from start to recount
- a layout check that measures every Urdu and English label for overlaps at three phone sizes, in both themes
- every misheard real sentence I hit became a permanent test

---

## Results

On realistic sentences the AI never trained on:

| Test set | Correct | Wrong actions |
|---|---|---|
| New realistic set (113 sentences) | **94%** | **0** |
| Set written before the rules existed (41) | **98%** | **0** |
| Real user sentences | **2 / 2** | **0** |

"Wrong action" means doing the wrong thing. When CHOTA isn't sure, it asks instead, which is the safe outcome.

---

## Limitations (honestly)

- **Not yet field-tested** on a real phone with herders. Battery life, real outdoor GPS and real phrasing are unproven.
- **Web-app limits:** GPS stops when the screen is off (CHOTA records this honestly as a gap and keeps the screen
  awake during trips), and reminders fire only while the app is open.
- **Offline voice** depends on the phone keyboard's Urdu voice typing (Gboard). Spoken answers need an Urdu voice
  installed on the phone.
- **AI test data** is mostly sentences I wrote; only two come from real users so far.
- **Urdu wording** needs review by native speakers from the area.

**Next:** a field test in Nushki, test sentences spoken by herders, and on-device speech recognition.

---

## Try it

1. Open [chota-iota.vercel.app](https://chota-iota.vercel.app) on a phone (or a desktop browser in phone view).
2. **Settings → Load demo history.** This loads a demo area around Kili Jamaldini, Nushki: 22 trips, water points,
   shade and a herd. Keep **Demo GPS** on.
3. Tap the big mic, or type:
   - `سفر شروع کرو` (start a trip; set the demo walk to 200 m/s)
   - `اس جگہ کا نام چشمہ رکھیں`
   - `واپسی پر کریم چاچا کی 4 بکریاں ان کے گھر چھوڑنی ہیں یاد دلانا`
   - `واپسی کا راستہ دکھاؤ`
   - `سفر ختم`
4. **Settings → +1 / +3 / +14 days** moves the app clock to see reminders fire and recount prompts appear.

---

## Run it locally

```bash
cd app
npm install
npm run dev            # http://localhost:5173
npm run check          # typecheck + lint + unit tests
npm run build && npx vite preview --port 4173 &
npm run test:e2e       # end-to-end flow (Playwright, needs the preview running)
npm run test:layout    # label overlap check at 3 phone sizes × 2 themes
```

Retrain the AI (Python 3 with scikit-learn):

```bash
python ml/data.py && python ml/train.py 8000 4.0 && node ml/evaluate.ts ml/heldout_user.jsonl ml/heldout_v2.jsonl
```

---

## Repository

```
app/                  the app (React + TypeScript PWA)
  src/core/           pure logic, unit-tested in Node: nlu (rules), intentModel (AI), trail (GPS honesty), geo
  src/data/           on-phone database and demo data
  src/services/       answer (understand → act), gps, reminders, herd, speech, clock
  src/ui/             shared components, the voice box, dialogs, the offline map
  src/screens/        one file per screen
  public/data/        offline satellite map, villages, border, AI model
  tests/              unit, end-to-end and layout tests
ml/                   AI training data, training, evaluation, held-out test sets
feasibility/          satellite experiments (Sentinel-2, CHIRPS)
test5/                rules vs on-device LLMs experiment
design/               design notes and screenshots
FINDINGS.md           experiment log and decisions
STATUS.md             build log
```

---

## Data and credits

- Satellite basemap: Copernicus Sentinel-2 (ESA), via Microsoft Planetary Computer
- Rainfall: CHIRPS (Climate Hazards Center, UC Santa Barbara)
- Villages: GeoNames (CC BY 4.0) · Border: geoBoundaries
- Urdu font: Noto Nastaliq Urdu (SIL Open Font License)
- Built with React, Vite, Dexie, Leaflet, scikit-learn, llama.cpp (experiments) and Playwright, with
  [Claude Code](https://claude.com/claude-code) as my coding assistant.

The demo data is fictional and clearly labelled in the app.
