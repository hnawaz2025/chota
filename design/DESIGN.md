# CHOTA field UI: design notes

This redesign is for the people who will actually carry the phone: herders around Nushki. It changes how the app
looks and is laid out (`app/src/App.tsx`, `app/src/index.css`). It does not change behaviour: parsing, answers,
the trail, GPS, herd, reminders, storage and speech are untouched.

Screenshots are in `design/screens/`. They show `before-*` and `after-*` at 390×844, plus some at 360×740 and two in
dark mode.

---

## 1. Who we are designing for (assumptions)

| Assumption | Confidence | Needs field validation? |
|---|---|---|
| Herders of goats and sheep (some camels and cattle) around Nushki. Home languages Balochi, Brahui and Pashto; Urdu is the shared one | Given | — |
| Many are semi-literate or non-literate, especially older men. **They read digits better than words** | Given | Yes: do they read Latin digits ("5.8 km") or prefer Urdu numerals (۵٫۸)? The UI uses Latin digits, as answer.ts does |
| They recognise icons and colours for animals, water and plants | Given | Yes: test each icon (👣 trip, 🐐 herd, 🔔 reminders, 📍 place, 🏠 home) without labels |
| Outdoors in harsh sunlight and dust, often with a cracked screen and no reading glasses | Given | Yes: test legibility at noon, screen brightness at "auto", with and without glasses |
| One hand is often busy (stick, rope, animal). The phone is glanced at briefly | Given | Yes: which thumb, and where on the screen they can reach while walking |
| Cheap Android phones: 5–6.5", 720p, slow CPU, Gboard keyboard | Given | Yes: the real browser chrome height. 360×740 minus the URL bar is closer to 360×660 |
| Phones are shared within families, so English subtitles may help a younger family member | Assumption | Yes: is the English toggle used at all? |
| Evening and night use at home (dark mode) | Given | Light check only |
| Speaking to the phone in public is acceptable | **Assumption** | **Yes**: shyness, wind noise, and talking while near animals |
| Green = good / go, red = stop / bad, yellow = attention | Assumption (widely shared) | Yes |

## 2. Design principles

1. **Sunlight first.** Use near-black ink on warm off-white. Key text meets WCAG AAA (≥7:1), and borders and
   outlines meet ≥3:1. Text that matters is never pastel or muted. Thick borders, because thin 1px light borders
   disappear in glare.
2. **The number is the answer.** Distances, counts and times are the largest things on screen. Inside spoken
   answers, digits are wrapped in bold sans-serif at 1.2× (`Emph`), so "5.8" jumps out of a Nastaliq sentence.
   The answer text itself is unchanged.
3. **One feature = one icon + one colour, everywhere.** The same pair is used on tiles, buttons, answer borders,
   cards and stats.

   | Feature | Icon | Colour |
   |---|---|---|
   | Trip | 👣 | green |
   | Place | 📍 | orange |
   | Home and way back | 🏠 | blue |
   | Herd | 🐐 (🐑 🐪 🐄 per species) | purple |
   | Reminders | 🔔 | amber |
4. **Honesty is shown by shape, never by fading.** Fading text to show uncertainty makes it unreadable in sunlight,
   so uncertainty has its own shapes:

   | Line style | Meaning |
   |---|---|
   | **Solid** | recorded or confirmed. The herd count is a solid green box with ✓. The home distance is a solid blue chip |
   | **Dashed** | estimate, last known, or awaiting your ✓. The estimate is a dashed, hatched box with ≈. A stale fix gives a dashed home chip plus "آخری GPS … پہلے". An answer waiting for confirmation has a dashed amber card |
   | **Dotted** | not recorded. Trail gaps on the map are dotted, the history row has a "┄ ⚠️ N وقفہ" pill, and trip distance is underlined dotted when it has gaps |
   | **Dashed amber "?"** | a species that was never counted |

   All of these stay full contrast.
5. **States are not just words.** Each state is shown by colour, shape and words together:

   | State | Colour | Shape | Words |
   |---|---|---|---|
   | Listening | red mic | ■ stop sign and a pulsing ring | "سن رہا ہوں…" |
   | Recording | green band | blinking red REC dot | "راستہ ریکارڈ ہو رہا ہے" |
   | Not recording | amber band | ⚠️ | the reason |
   | Trip running (home tile) | red outline | REC dot | "سفر جاری ہے" |
   | Confirm | solid green ✓ button | — | — |
   | Reject | outlined red ✗ button | — | — |
6. **Big, stable targets.** Nothing that matters is under 56px. Primary actions are 64–96px. On the trip screen,
   the big buttons sit **above** anything that can appear (answers), so they never jump when the herder reaches for
   them. Modals are bottom sheets, so their actions sit in thumb reach.
7. **Voice is the hub, typing is the fallback.** There is a 180px mic. The text box is visibly secondary (dashed
   border, ⌨️ placeholder), but stays prominent because offline the keyboard's mic fills it.
8. **Nastaliq needs room.** Text is ≥18px (1.15rem), headings 1.5rem, and line-height is about 2. Bold (700) is used
   only for short labels. Long bold Nastaliq showed letter-joining gaps in Chromium (for example "سید ھی"), so answer
   paragraphs use the regular weight (400) at a larger size.
9. **Cheap to run.** No new fonts, images or libraries. Animation uses only opacity and transform (the REC dot and
   the mic ring), and is switched off under `prefers-reduced-motion`. The old `filter: brightness` pulses were
   removed: they repaint and cost battery on slow phones.

## 3. What changed per screen, and why

### Header
- Dark bar, RTL. **Back (→) sits top-right** at 56×52px, where Urdu readers expect it. Before, it was a 36px "‹" on
  the left.
- The tagline "Small AI. Big memory." was removed from the header to save space. The brand is now "چھوٹا CHOTA".
- **DEMO GPS** and **+Nd** are bright yellow with a black border, the most visible things in the header. They mark
  simulated data and must never be missed in a demo.

### Home
- **Home chip:** 🏠 + a big "5.6 km" + the direction in Urdu, in a solid blue box. When the fix is stale, the box
  turns **dashed grey** and adds "آخری GPS N پہلے" in the warning colour. It reads as "last known" before any word
  is read.
- **Herd warnings:** RTL rows (⚠️ + species icon + text + ‹), 56px tall, amber with a strong border. They tap through
  to the herd screen.
- **Mic:** 180px (164px on 360-wide screens).
  - Idle: orange with 🎤.
  - Listening: red with ■ and an expanding ring.
- **Answer card:**
  - shows the feature icon and a thick start border in the feature colour
  - shows the heard words as "🎤 “…”"
  - digits are emphasised
  - the 🔊 replay button is a 52px circle
  - the "no Urdu voice" note is shortened, and the install steps moved to Settings
- **Read-back (✓/✗):** the card turns dashed amber, meaning "not saved yet". ✓ is a solid green 84px button and ✗
  is an outlined red one. **The card scrolls into view so the ✓/✗ is on screen.** Before, at 390×844, the buttons
  fell below the fold.
- **Shortcuts:**
  - The three feature tiles have their icon in a white disc, so 👣 and 🐐 stay visible on dark green and purple.
  - Reminders is amber with dark ink.
  - Count badges are 30px with a dark border.
  - The trip tile, while a trip runs, gets a red outline and a REC dot.
  - Map, history and settings are 76px secondary buttons.
- **Examples:** a 56px "💬 کیا پوچھ سکتے ہیں؟" row instead of a small disclosure triangle.

### Trip
- The map is 36dvh (30dvh on screens shorter than 760px).
- **Recording status is always visible:**
  - recording: a green band "● راستہ ریکارڈ ہو رہا ہے"
  - not recording: the existing amber banner (`.warn-line.gps`), now 48px and bold
- The screen-off note is larger, with a 📱 icon.
- **Stats:** ⏱ / 👣 / 🏠 next to 1.7rem numbers. Recorded distance is underlined dotted when the trip has gaps.
- **Actions:**
  - "یہ جگہ یاد رکھو" (📍, orange) and "واپسی کا راستہ" (🏠, blue) are side by side, 92px tall.
  - "سفر ختم کریں" (⏹, dark) is full width below them, separated by a gap.
  - They now come **before** the voice bar and answers, so they don't move.
  - At 360×740 the whole action set is visible without scrolling. Before, "End trip" was below the fold.
- The voice bar has a 68px mic that turns into ■ while listening.
- The **DEMO walk** controls are kept, marked with the yellow DEMO style, with ⏸ and the "N m/s" text unchanged.

### Name a place (modal)
- The title has 📍.
- The capture status is a coloured pill:
  - green "✓ جگہ نوٹ کر لی · گھر سے 6.4 کلومیٹر"
  - amber when GPS is stale, poor or missing
- The input is 60px with a 68px mic.
- **Tags:** an equal 5-column grid of 84px buttons with a large icon. The selected tag gets a fill, a thicker border
  **and a ✓ badge**, so it does not rely on colour alone.
- Save is an orange (place colour) 64px button at the bottom.

### Herd
- The species icon sits in the card header.
- **Boxes:**
  - Confirmed: solid green, ✓ and a 2.8rem number.
  - Estimate: dashed and hatched, with ≈ and the number in **full-contrast ink**. Before, it was grey italic, which
    was hard to read in sun.
  - Never counted: dashed amber "?".
- Event rows are now in Urdu ("فروخت · آج") with a coloured −2 / +1. Before, they were English "sale · today".
- "Count now" (🔢, purple) and "Record change" (±) are 64px.
- "Add species" is a 64px dashed purple button instead of a text link.
- Count pad:
  - species chips have animal icons
  - the number field is 3rem
  - "Confirm" is green
- Event pad:
  - 72px stepper
  - the four "minus" reasons in a 2×2 grid instead of a cramped row of four

### Reminders
- **Added a mic** to the add-reminder bar, reusing the same `listen()` pattern as naming a place. Words go into the
  box, and the herder taps ＋.
- Cards:
  - a 10px amber start border
  - the due time is large, with ⏰ and an emphasised hour
  - the reminder text is 1.25rem bold
  - "✓ ہو گیا" (green) and "⏰ ایک گھنٹہ بعد" are 64px
- A fired reminder pop-up for a herd recount shows "🔢 ابھی گنتی کریں" as a full-width purple button above ✓ / ⏰.

### Map, history and settings
- **Legend:** drawn line samples, with a dotted sample for "ریکارڈ نہیں".
- **Place rows:** RTL, with a big icon and name, distance in big digits, and direction and age in Urdu.
- **History rows:**
  - a coloured start border for the rating
  - distance in big digits
  - duration and direction in Urdu
  - a "┄ ⚠️ N وقفہ" pill for gaps
  - a rating chip with 🟢 / 🟡 / 🔴
- **Settings:**
  - 28px checkboxes in 52px rows
  - the Urdu-voice install hint now lives here
  - demo controls are unchanged

## 4. Tokens

**Colour (light).** Contrast was checked with the WCAG formula.

| Token | Value | Use | Contrast |
|---|---|---|---|
| `--bg` | `#f3ead9` | page | — |
| `--card` | `#fffdf8` | cards, sheets | — |
| `--ink` | `#1a120b` | text | 15.5 on bg, 18.2 on card |
| `--muted` | `#4e3b28` | secondary text | 8.9 on bg (AAA) — before: `#7a6a58`, 4.6 |
| `--line` | `#8a7456` | borders | ≥3:1 |
| `--trip` | `#1b5e34` | trip, confirmed | white 7.8 |
| `--place` | `#8c3a0a` | place, mic | white 7.7 |
| `--home` | `#1d4f80` | home, way back | white 8.5 |
| `--herd` | `#553081` | herd | white 9.9 |
| `--rem` | `#f0b400` | reminders | ink 9.9 |
| `--stop` | `#2b211a` | end trip, header, send | white 15.7 |
| `--warn` / `--warn-ink` | `#ffe9b8` / `#5a2e00` | caveats, stale, estimate | 9.6 |
| `--good-bg` / `--good-ink` | `#dff3e4` / `#0f4a25` | recording, ✓ | 8.9 |
| `--demo` | `#ffd84d` + black border | DEMO badges | ink 13.4 |

**Dark mode** keeps the same structure:
- `--bg` `#141110`, `--card` `#221c17`, `--ink` `#fff7ec` (17.7), `--muted` `#d8c8b2` (11.5)
- the feature colours stay as fills; lighter `--*-fg` versions are used for text on dark cards
- `--stop` lightens to `#5a4636`, so dark buttons stay visible

**Type.**

| Element | Size | Weight | Line height |
|---|---|---|---|
| Urdu (Noto Nastaliq) | 1.15rem | 400; 700 for short labels | 2 |
| Big Urdu | 1.5rem | 400 for answer paragraphs | 2 |
| English subtitle | .78rem in `--muted` | — | — |
| Numbers | 1.7–3rem, system sans | 800 | — |

**Spacing and targets.**
- 16px side gutter, 10–12px gaps.
- Minimum target 48px (demo-only controls 40px). Normal actions 56–64px. Primary actions 72–96px. Mic 180px.
- Radius 14–20px.

## 5. Open questions for testing with herders

1. **Icons:**
   - Is 👣 understood as "trip / where I walked", or would a herder expect an animal (the old 🐐)?
   - Is 🐐 right for the whole herd when many keep sheep?
   - Is 🪨 understood as "landmark"?
2. **Digits:** do they read "5.8 km" more easily, or "5.8 کلومیٹر", or Urdu numerals? Should "km" become "کلومیٹر"
   in the big numbers?
3. **Compass words** (جنوب مشرق) assume they think in compass directions. Would "towards the village X" or a
   phone-compass arrow work better? An arrow would need a heading sensor, so it was not added.
4. **Dashed vs solid:** after a short explanation, do herders understand "dashed = not sure"? Can they tell the
   confirmed and estimated herd boxes apart without reading?
5. **Mic placement:** the mic is at about 35–45% of screen height. Can they reach it one-handed while walking?
   Should there be a second mic on the trip screen at the very bottom?
6. **"End trip" has no confirmation when tapped**, only by voice. That is unchanged, because it would change
   behaviour and the e2e flow. Do accidental taps happen (pocket, dust, cracked screen)? If so, consider
   press-and-hold.
7. **Speaker vs screen:** with an Urdu voice installed, do they still look at the answer text? If not, the answer
   cards could shrink to number + icon.
8. **English subtitles:** do they add clutter or help a younger family member? Should the default be off?
9. **Sun test:** test at noon, at "auto" brightness, with a cracked or dusty screen. Is amber (reminders) still
   distinct from the warning colour? Is the dark orange mic still clearly "the button"?
10. **Event-type icons** (sold, died, lost, slaughtered) were deliberately left as +/− and words. Culturally
    appropriate pictograms need local input.
11. **Wording:** the shortened UI strings (for example "🔇 اس فون پر اردو آواز نہیں…") need review by a native
    speaker from the area, as do the existing caveats.

## 6. Not done, on purpose
- **No logic changes.** No end-trip confirmation, no new intents, no change to answer text.
- **No global `dir="rtl"`.** Only the header, warning rows, home chip and list rows are RTL. A full RTL flip would
  touch Leaflet controls and every layout, and is a larger, separately tested change.
- **No custom icon set or new font.** Emoji are free, offline and familiar on Android. Their look varies by phone
  vendor, so check them on the target phones.
