# CHOTA field UI: design notes

This redesign is for the people who will actually carry the phone: herders around Nushki. It changes how the app
looks and is laid out (`app/src/App.tsx`, `app/src/index.css`). It does not change behaviour: parsing, answers,
the trail, GPS, herd, reminders, storage and speech are untouched.

Screenshots are in `design/screens/`:
- `before-*`: the original UI.
- `after-dark-*`: the current UI in its default dark charcoal theme.
- `after-sun-*`: the current UI in ☀️ sun mode.

All are at 390×844, with some at 360×740.

**The current colours are in [Palette v2](#palette-v2-current).** It replaced the per-feature colours of the first
redesign (sections 2.3 and 4 describe that earlier version, and are kept for the record).

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
3. *(Superseded by Palette v2: features now differ by emoji + label, not hue.)* **One feature = one icon + one colour, everywhere.** The same pair is used on tiles, buttons, answer borders,
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
8. **Nastaliq needs room.** Text is ≥18px (1.15rem), headings 1.5rem, and line-height is 2.5 (see §4a). Bold (700) is used
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
  - **Start Trip is a full-width tile** (icon beside the label), so "سفر شروع کریں" stays on one line even at 360px.
    Herd and Reminders sit side by side underneath.
  - The feature tiles have their icon in a white disc, so 👣 and 🐐 stay visible on dark green and purple.
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
- **Stats:** each cell is [icon, 8px gap, 1.6rem number] on one row, with the label underneath. Recorded distance is underlined dotted when the trip has gaps.
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
- **Tags:** a 3-column grid of 84px buttons (icon on its own line above a one-line label). The selected tag gets a fill, a thicker border
  **and a ✓ badge**, so it does not rely on colour alone.
- Save is an orange (place colour) 64px button at the bottom.

### Herd
- The species icon sits in the card header.
- **Boxes:**
  - Confirmed: solid green, ✓ and a 2.6rem number, labelled "تصدیق شدہ گنتی".
  - Estimate: dashed and hatched, with ≈, the number in **full-contrast ink**, the label "اندازہ (تصدیق نہیں)", and
    the recorded changes as bare digits "+0 / −2". Before, it was grey italic, which
    was hard to read in sun.
  - Never counted: dashed amber "?".
- Event rows are now in Urdu ("فروخت · آج") with a coloured −2 / +1. Before, they were English "sale · today".
- "Count now" (🔢, purple) and "Record change" (±) are 64px, with the icon above a one-line label.
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

**Colour (first redesign, superseded by [Palette v2](#palette-v2-current)).** Contrast was checked with the WCAG formula.

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
| Urdu (Noto Nastaliq) | 1.15rem | 400; 700 for short labels | 2.5 (`--ur-lh`) |
| Big Urdu | 1.5rem | 400 for answer paragraphs | 2.5 |
| English subtitle | .78rem in `--muted`, 8px below the Urdu | — | 1.3 |
| Numbers | 1.7–3rem, system sans | 800 | — |

### 4a. Label spacing (checked automatically)

The first redesign looked cluttered: the Urdu line sat on its English subtitle, emojis touched words, and some
labels ran to the edge of their box. These rules fix that. `app/tests/layout.mjs` enforces them at 390×844 and
360×740, in light and dark, across home (empty, with an answer, with a read-back), trip, way back, naming, rating,
reminder pop-up, herd (with an estimated, a stale and a never-counted species), count and event pads, reminders,
history, map and settings.

| Token | Value | Rule |
|---|---|---|
| `--ur-lh` | 2.5 | Line-height of Urdu text. Noto Nastaliq's glyph box (font ascent + descent) is about 2.5em, so at 2.5 the ink stays inside the line box. With the old 2.0, letters stuck out about 0.25em above and below and touched borders and subtitles |
| `--sub-gap` | 8px | Clear space between an Urdu line and its English subtitle (`.tx > .ur:not(:last-child)`). It drops to 4px in the small secondary buttons and the place tags |
| `--ic-gap` | 10px | Icon to text. Every emoji or icon is its own `.ic` box (the `I` / `Lab` helpers in App.tsx), never inline in a sentence. Icons use the system font, so the emoji's box isn't inflated by Nastaliq's metrics |
| `--pad-in` | 10px | Minimum horizontal padding between text and any box border |

The check measures real glyph boxes with `Range.getClientRects()`, not element boxes, and asserts:
1. Urdu and English glyph boxes don't intersect, with ≥4px between them.
2. Every visible text node and icon lies inside its nearest box (button, card, tile, modal, answer, pill, herd box),
   inset by 2px. Content scrolled inside a modal counts as inside.
3. No icon overlaps any sibling text or icon.

Result: **2026 violations before → 0 after.**

To keep labels inside their boxes, a few UI-chrome labels were shortened. The meaning is kept, and every text the
e2e relies on is unchanged.

| Before | After |
|---|---|
| "آخری تصدیق شدہ گنتی" | "تصدیق شدہ گنتی" |
| "اندازاً اب (تصدیق شدہ نہیں)" | "اندازہ (تصدیق نہیں)" |
| "درج شدہ: +0 / −2" | "+0 / −2" |
| "درج شدہ تبدیلیاں / کل تعداد معلوم نہیں" (never-counted box) | "درج تبدیلیاں / کل معلوم نہیں" |

The full sentences "کوئی تصدیق شدہ گنتی نہیں" and the stale and never-counted warnings stay as they were.

**Spacing and targets.**
- 16px side gutter, 10–12px gaps.
- Minimum target 48px (demo-only controls 40px). Normal actions 56–64px. Primary actions 72–96px. Mic 180px.
- Radius 14–20px.

## Palette v2 (current)

A reviewer, endorsed by the user, said the first redesign was too busy: brown, green, purple, yellow, blue, orange,
red, white outlines, heavy and dotted borders, and several button styles. It looked like a hackathon prototype, not
a finished product. Palette v2 strips colour back to meaning.

### Rules
1. **Colour = meaning only.** Features (trip, herd, reminders, places, home) are told apart by **emoji + label**, not
   hue. The purple herd, amber reminders tile and blue/green feature tiles are gone. Every emoji is kept, as the user
   asked.
2. **Brand brown** marks the brand and the primary actions: the big mic, Start Trip, and the main button on each
   screen.
3. **Green** means recording, active, confirmed, good grazing, or ✓. The mic turns green while listening (active),
   with ■ and a pulsing ring. The running-trip tile is green with a REC dot. The recording dot is green.
4. **Amber** means warning, stale, okay grazing, or assumed. The read-back card waiting for ✓ is amber.
5. **Red** means poor, error, ✗, or destructive.
6. **Blue is gone from the UI.** Home and way back use the brand primary button with 🏠. The only blue left is the
   map's "you are here" dot, a near-universal map convention, which turns grey when the fix is stale.
7. **One button system:**
   - **Primary:** filled brand, white text (`.big-btn`).
   - **Secondary:** one quiet style, a surface tone with a thin line (`.big-btn.secondary`, `.end`, tiles, chips,
     card actions, "+1 hour", Skip, stepper…).
   - **Confirm ✓:** filled green.
   - **Reject ✗:** red outline.

   The orange/blue/purple/dark variants are retired. Old class names (`place`, `back`, `end`, `ok`, `herdc`) are kept
   but map onto these four styles.
8. **Calm containers.**
   - One card style: surface tone, 1px line.
   - Separation comes from spacing and surface tone, not heavy borders.
   - Strong 3px marks appear only where they carry meaning: the confirmed herd box, the dashed estimate and
     never-counted boxes, the start mark on warnings and the history rating.
   - One radius scale: `--r-s` 10px for pills and small boxes, `--r-m` 14px for buttons and inputs, `--r-l` 20px for
     cards, tiles and sheets.
9. **Honesty semantics, quieter but intact.**
   - **Dashed** is only for estimate, unconfirmed or last known: the ≈ estimate box, the never-counted "?" box, the
     read-back waiting for ✓, and the home distance from a stale fix.
   - **Dotted** is only for trail gaps: map gaps, the history "وقفہ" pill, and the dotted underline on trip distance
     with gaps.
   - Solid is everything recorded or confirmed.
   - The decorative hatching on the estimate box is gone. The dashed border + ≈ carry it.
   - The typing box is no longer dashed, so dashed keeps one meaning.
   - System reminders are no longer dashed (the "CHOTA" badge marks them).
10. **Map trails:** rating colours stay green / amber / red (unrated grey). **Today's live trail is cream (`#fff4e0`)
    with a dark brown casing**, so it is visible on the brown satellite image and isn't confused with "okay" amber.
    The legend shows the same cased line.
11. **Demo markers stay obvious but tidy:** solid yellow pills with dark ink (DEMO GPS, +Nd, DEMO walk, and the
    selected demo speed). Yellow is used for nothing else.

### Themes
- **Dark charcoal is the default.** This was the user's decision. It no longer follows the phone's
  `prefers-color-scheme`.
- **☀️ Sun mode** is a strong light theme for direct sunlight. It is a one-tap toggle at the left end of the header
  (☀️ ↔ 🌙). It sets `<html data-theme="light">`, is remembered in `localStorage` (`chota.theme`, read and written
  in try/catch), and is applied before first paint.

### Tokens: every colour and its one meaning
Contrast is WCAG, computed. "AAA" means ≥7:1.

**Surfaces and text** (dark / sun)

| Token | Dark | Sun | Meaning | Contrast |
|---|---|---|---|---|
| `--bg` | `#161412` | `#faf7f0` | page | — |
| `--surface` | `#221e1b` | `#ffffff` | cards, tiles, sheets, inputs | — |
| `--surface-2` | `#2c2723` | `#ece5d8` | secondary buttons | ink on it: 12.9 / 15.1 |
| `--head` | `#0e0c0b` | `#3d2410` | header bar | white 14.4+ |
| `--ink` | `#f5efe6` | `#14100c` | all key text | 16.1 / 17.7 on bg |
| `--muted` | `#cdc3b6` | `#45382b` | English subtitles, secondary text | 10.6 / 10.6 on bg; ≥8.5 on every surface |
| `--line` | `#3a342f` | `#ddd3c3` | thin dividers only (decorative; nothing relies on it) | 1.5 / 1.4 |
| `--line-strong` | `#8a7f73` | `#6b5d4d` | inputs, the dashed estimate border, home chip | 4.7 / 6.0 (≥3:1 non-text) |

**Brand**

| Token | Dark | Sun | Meaning | Contrast |
|---|---|---|---|---|
| `--brand` | `#7a4520` | `#6e3d1b` | primary action fill, big mic, Start Trip | white 7.8 / 9.0 |
| `--brand-fg` | `#e8a874` | `#6e3d1b` | brand as text: links, focus ring, selected row | 9.0 / 8.4 on bg |
| header wordmark | `#f3c59a` | `#f3c59a` | "چھوٹا" | 12.3 / 9.1 on header |

**Meaning colours**

| Token | Dark | Sun | Meaning | Contrast |
|---|---|---|---|---|
| `--good` | `#155f33` | `#155f33` | fill: ✓ confirm, listening / active, trip running | white 7.7 |
| `--good-fg` / `--good-bg` | `#8fd8a4` / `#17301f` | `#14562f` / `#ddf0e2` | confirmed count, recording line, "good" tint | 8.5 / 7.3 |
| `--warn` | `#f0b400` | `#f0b400` | fill / border: warning, stale, okay, assumed | ink 10.1 |
| `--warn-fg` / `--warn-bg` | `#f2c14e` / `#3a2c10` | `#6b4500` / `#fdecc0` | caveat text on its tint | 8.1 / 7.2 |
| `--bad` | `#a3271b` | `#a3271b` | fill / border: ✗, poor, destructive | white 7.3 |
| `--bad-fg` / `--bad-bg` | `#ff9e92` / `#3b1a16` | `#8f1f15` / `#fbe1dc` | poor / minus text on its tint | 7.9 / 7.1 |
| `--demo` | `#ffd84d` | `#ffd84d` | simulated data only | ink 13.7 |

**Map** (fixed, not themed)
- Rating trails: good `#2e9e4f`, okay `#d9a21b`, poor `#c4442f`, unrated `#5b6b7a`.
- Live trail `#fff4e0` on a `#2a1a0e` casing.
- Gaps dotted in the trail's colour.

**Shape:** `--r-s` 10px · `--r-m` 14px · `--r-l` 20px · `--bw` 1px (normal lines) · `--bw-mark` 3px (meaningful marks
only).

The spacing tokens (§4a) are unchanged. `tests/layout.mjs` now runs **dark (default) and sun mode** at 390×844 and
360×740, and reports **0 violations** in all four combinations.

### v2.1: the mic is the focus (user feedback)
The user asked for a smaller header, "offline" instead of "online", a smaller home strip and examples box, and
slightly smaller English, so the eye goes to the big mic and the Urdu.

| Element | Before | After |
|---|---|---|
| Header height | 54px | 44px |
| Wordmark | 21.6px | 17.6px |
| DEMO GPS / +Nd pills | 11.5px text | 9.9px text (still solid yellow, dark ink) |
| Back / ☀️ buttons | 52×52 / 48×44 | 48×44 / 44×36 |
| English subtitles | 12.5px (big: 13.6px; tags 10.9px) | **11.5px** (big: 12.5px; tags and screen note 11px). Never under 11px; the 8px Urdu → English gap is unchanged |
| Home strip | 76px, 2px strong border, 27px number, 18.4px Urdu | 69px, 1px quiet border, 21.6px number, 16px Urdu (a stale fix still gets the 2px dashed border) |
| Examples box | 78px, filled surface | 69px, transparent with a thin line, muted text until opened |
| Big mic | top at 158px | top at 141px (moved up by the smaller header and strip) |

- **Network badge → offline-ready badge.** The header now shows **"📴 آف لائن ✓"** (title: "offline ✓ — CHOTA works
  without internet").
  - It appears only once the service worker actually holds the app (`navigator.serviceWorker.controller` is set, or
    `serviceWorker.ready` has resolved).
  - Until then it shows a quiet dashed "⏳", and nothing where service workers don't exist. It never claims offline
    before the cache exists.
  - Live network state is no longer shown in the header.
  - The badge has no hue (thin white outline): it is reassurance, not an alert.
- **AI fallback (Test 7) in Palette v2:**
  - "Did you mean" `.choice` buttons use the one secondary style (surface-2, thin line, icon above Urdu above
    English).
  - The "🤖 AI کا اندازہ" tag is muted text with no new colour.

### Unsure / to validate
- **Dark default in direct sun.** A dark theme is harder to read in glare than a light one, which is why sun mode
  exists. Field-test whether herders find the ☀️ toggle, and whether sun mode should be the default during the day.
  (An automatic switch would need the ambient-light sensor, which the web can't reliably reach.)
- **Green for "listening".** The palette makes listening "active = green". Many people expect a red record dot. The
  ■ stop sign and pulsing ring carry the state either way.
- **Losing feature colour.** Features are now told apart only by emoji + label. Check that herders still find Herd
  and Reminders as fast as with the coloured tiles.

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
