/**
 * Deterministic Urdu / Roman-Urdu intent parser. No model, no generation.
 * Benchmarked approach from feasibility Test 5 (rules beat 1-2B on-device LLMs, which also invented records).
 */
import type { Species, HerdEventType, PlaceType } from './db'
import { DIRS, DIR_UR, type Dir } from './geo.ts'

// ---------- normalization ----------
const CHARMAP: Record<string, string> = {
  'ي': 'ی', 'ى': 'ی', 'ك': 'ک', 'ه': 'ہ', 'ۀ': 'ہ', 'ة': 'ہ', 'ۓ': 'ے',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
}
export function normalize(text: string): string[] {
  const t = [...text].map(c => CHARMAP[c] ?? c).join('')
    .replace(/[ً-ٰٟ]/g, '').toLowerCase().replace(/[،۔,.!?؟"']/g, ' ')
  return t.split(/\s+/).filter(Boolean)
}

// ---------- numbers ----------
const UR_NUM = 'ایک دو تین چار پانچ چھ سات آٹھ نو دس گیارہ بارہ تیرہ چودہ پندرہ سولہ سترہ اٹھارہ انیس بیس اکیس بائیس تئیس چوبیس پچیس چھبیس ستائیس اٹھائیس انتیس تیس اکتیس بتیس تینتیس چونتیس پینتیس چھتیس سینتیس اڑتیس انتالیس چالیس اکتالیس بیالیس تینتالیس چوالیس پینتالیس چھیالیس سینتالیس اڑتالیس انچاس پچاس اکاون باون ترپن چون پچپن چھپن ستاون اٹھاون انسٹھ ساٹھ اکسٹھ باسٹھ ترسٹھ چونسٹھ پینسٹھ چھیاسٹھ سڑسٹھ اڑسٹھ انہتر ستر اکہتر بہتر تہتر چوہتر پچھتر چھہتر ستتر اٹھہتر اناسی اسی اکیاسی بیاسی تراسی چوراسی پچاسی چھیاسی ستاسی اٹھاسی نواسی نوے اکانوے بانوے ترانوے چورانوے پچانوے چھیانوے ستانوے اٹھانوے ننانوے'.split(' ')
const RO_NUM = 'ek do teen char panch chay saat aath nau das gyarah barah terah chaudah pandrah solah satrah atharah unees bees ikkees baees teees chaubees pachees chhabbees sattaees athaees untees tees iktees battees taintees chauntees paintees chhattees saintees artees untalees chalees iktalees bayalees taintalees chawalees paintalees chhiyalees saintalees artalees unchaas pachaas'.split(' ')
const NUM: Record<string, number> = {}
UR_NUM.forEach((w, i) => (NUM[w] = i + 1)); RO_NUM.forEach((w, i) => (NUM[w] = i + 1))
Object.assign(NUM, { 'چھے': 6, aik: 1, chaar: 4, paanch: 5, chhe: 6, che: 6, sat: 7, ath: 8, bara: 12, pandra: 15,
  bis: 20, tis: 30, pachas: 50, 'ڈیڑھ': 1.5, 'ڈھائی': 2.5, dedh: 1.5, dhai: 2.5 })
const PREFIX: Record<string, number> = { 'سوا': 0.25, 'ساڑھے': 0.5, 'پونے': -0.25, sava: 0.25, sawa: 0.25, sadhe: 0.5, saade: 0.5 }
const MULT: Record<string, number> = { 'ہزار': 1e3, hazar: 1e3, hazaar: 1e3, 'لاکھ': 1e5, lakh: 1e5, 'سو': 100, sau: 100 }

const numval = (t: string) => /^\d+(\.\d+)?$/.test(t) ? parseFloat(t) : NUM[t]

export interface NumSpan { start: number; end: number; value: number; money: boolean }
export function parseNumbers(toks: string[]): NumSpan[] {
  const out: NumSpan[] = []
  let i = 0
  while (i < toks.length) {
    const pre = PREFIX[toks[i]]
    let j = pre !== undefined ? i + 1 : i
    let v = j < toks.length ? numval(toks[j]) : undefined
    let k = j + 1
    if (v === undefined && pre !== undefined && MULT[toks[j]]) { v = 1; k = j }      // "sava lakh"
    if (v === undefined) { i++; continue }
    if (pre !== undefined) v += pre
    let total = 0, money = false
    while (k < toks.length && MULT[toks[k]]) {                                     // "do lakh das hazar"
      v *= MULT[toks[k]]; money = true; k++
      const nv = k < toks.length ? numval(toks[k]) : undefined
      if (nv !== undefined && MULT[toks[k + 1]] && MULT[toks[k + 1]] < MULT[toks[k - 1]]) { total += v; v = nv; k++ }
    }
    out.push({ start: i, end: k, value: total + v, money }); i = Math.max(k, i + 1)
  }
  return out
}

// ---------- lexicon ----------
const SPECIES_WORDS: Record<Species, string> = {
  goat: 'بکری بکریاں بکریوں بکرا بکرے bakri bakriyan bakriyon bakra bakre goat goats',
  sheep: 'بھیڑ بھیڑیں بھیڑوں دنبہ دنبے مینڈھا میمنا میمنے bher bhed bheren bheden dumba dumbe memna memne sheep',
  camel: 'اونٹ اونٹنی اونٹوں oont unt camel camels',
  cattle: 'گائے گائیں بیل بھینس gaye gai bail bhens cow cows cattle',
}
const SPEC: Record<string, Species> = {}
for (const [s, ws] of Object.entries(SPECIES_WORDS)) ws.split(' ').forEach(w => (SPEC[w] = s as Species))
const has = (text: string, ...subs: string[]) => subs.some(s => text.includes(s))

const DIR_WORDS: [string[], Dir][] = [
  [['شمال مغرب', 'northwest', 'north west', 'shumal maghrib'], 'northwest'],
  [['شمال مشرق', 'northeast', 'north east', 'shumal mashriq'], 'northeast'],
  [['جنوب مغرب', 'southwest', 'south west', 'junoob maghrib'], 'southwest'],
  [['جنوب مشرق', 'southeast', 'south east', 'junoob mashriq'], 'southeast'],
  [['شمال', 'north', 'shumal'], 'north'], [['جنوب', 'south', 'junoob'], 'south'],
  [['مشرق', 'east', 'mashriq'], 'east'], [['مغرب', 'west', 'maghrib'], 'west'],
]
export function findDir(text: string): Dir | undefined {
  for (const [ws, d] of DIR_WORDS) if (ws.some(w => text.includes(w))) return d
}

// ---------- dates ----------
const DAY = 86400000
const WEEKDAYS: Record<string, number> = { 'پیر': 1, 'منگل': 2, 'بدھ': 3, 'جمعرات': 4, 'جمعہ': 5, 'اتوار': 0,
  peer: 1, mangal: 2, budh: 3, jumerat: 4, juma: 5, jumma: 5, itwar: 0 }
/** What was assumed when the herder didn't say it. The answer must state it, like an assumed herd quantity. */
export type WhenAssumed = 'no_time' | 'no_date_or_time' | 'am' | 'pm'
export interface When { at: number; assumed?: WhenAssumed }

const PART: [string[], 'morning' | 'noon' | 'evening' | 'night'][] = [
  [['صبح', 'subah', 'subha', 'morning', 'am'], 'morning'], [['دوپہر', 'dopahar', 'afternoon', 'noon'], 'noon'],
  [['شام', 'shaam', 'sham', 'evening', 'pm'], 'evening'], [['رات', 'raat', 'night'], 'night'],
]
const BAJE = ['بجے', 'بجکر', 'baje', 'bje', 'bajay', 'bajey', "o'clock", 'oclock']

/** Clock time said in the phrase: "6:00", "6 بجے", "چھ بجے", "ساڑھے چھ بجے", "at 6", "6 am". */
function clockTime(text: string, toks: string[]): { h: number; m: number } | undefined {
  const c = text.match(/(\d{1,2}):(\d{2})/)
  if (c) return { h: +c[1], m: +c[2] }
  const i = toks.findIndex(t => BAJE.includes(t))
  if (i > 0) {
    const v = numval(toks[i - 1]), pre = PREFIX[toks[i - 2]]
    if (v !== undefined && Number.isInteger(v) && v <= 24) {
      if (pre === 0.25) return { h: v, m: 15 }
      if (pre === 0.5) return { h: v, m: 30 }
      if (pre === -0.25) return { h: v - 1, m: 45 }
      return { h: v, m: 0 }
    }
    if (v === 1.5) return { h: 1, m: 30 }      // ڈیڑھ بجے
    if (v === 2.5) return { h: 2, m: 30 }      // ڈھائی بجے
  }
  const e = text.match(/\b(\d{1,2})\s*(am|pm)\b/) ?? text.match(/\bat (\d{1,2})\b/)
  if (e) return { h: +e[1], m: 0 }
}

/**
 * Due time for a future phrase. A spoken clock time wins; morning/evening words set AM/PM.
 * Defaults when not said (and reported as assumed): a day without a time -> morning 8 / noon 13 / evening 17 /
 * night 20 / else 9; no day and no time -> one hour from now; an hour without AM/PM -> 5-11 morning, 12-4 afternoon.
 */
export function parseWhen(text: string, toks: string[], nowMs: number): When {
  const d = new Date(nowMs)
  let days: number | undefined
  const m = text.match(/(\S+) (دن|din|ghante|گھنٹے|hours?|days?) (بعد|baad|later)/) ?? text.match(/in (\S+) (hours?|days?)/)
  if (m) {
    const n = numval(m[1]) ?? 1
    if (/^(گھنٹے|ghante|hours?)$/.test(m[2])) return { at: nowMs + n * 3600000 }
    days = n
  } else if (toks.includes('پرسوں') || toks.includes('parson') || has(text, 'day after tomorrow')) days = 2
  else if (toks.includes('کل') || toks.includes('kal') || toks.includes('tomorrow')) days = 1
  else if (has(text, 'اگلے ہفتے', 'agle hafte', 'next week')) days = 7
  else if (toks.includes('آج') || toks.includes('اج') || toks.includes('aaj') || toks.includes('aj') || toks.includes('today') || toks.includes('tonight')) days = 0
  else for (const [w, wd] of Object.entries(WEEKDAYS)) if (toks.includes(w)) { days = ((wd - d.getDay() + 7) % 7) || 7; break }

  const part = PART.find(([ws]) => ws.some(w => toks.includes(w)))?.[1]
  const clock = clockTime(text, toks)
  let assumed: WhenAssumed | undefined
  let h: number, min = 0
  if (clock) {
    h = clock.h; min = clock.m
    if (h < 12) {
      if (part === 'noon' || part === 'evening') h += 12
      else if (part === 'night') h = h >= 6 ? h + 12 : h
      else if (part !== 'morning') { if (h >= 1 && h <= 4) { h += 12; assumed = 'pm' } else if (h >= 5) assumed = 'am' }
    }
  } else {
    if (days === undefined) return { at: nowMs + 3600000, assumed: 'no_date_or_time' }
    h = part === 'morning' ? 8 : part === 'evening' ? 17 : part === 'night' ? 20 : part === 'noon' ? 13 : 9
    if (!part) assumed = 'no_time'
  }
  const due = new Date(nowMs + (days ?? 0) * DAY); due.setHours(h, min, 0, 0)
  // A time with no day: today if still ahead, else tomorrow.
  if (days === undefined && due.getTime() <= nowMs) due.setTime(due.getTime() + DAY)
  if (days === 0 && due.getTime() < nowMs) return { at: nowMs + 3600000, assumed: 'no_time' }
  return { at: due.getTime(), assumed }
}
export const parseDue = (text: string, toks: string[], nowMs: number) => parseWhen(text, toks, nowMs).at

// ---------- place tags ----------
const PLACE_WORDS: [PlaceType, string[]][] = [
  ['water', ['پانی', 'ٹیوب', 'کنواں', 'کنویں', 'چشمہ', 'ندی', 'نالہ', 'تالاب', 'کاریز', 'pani', 'tubewell', 'tube well', 'kuan', 'chashma', 'nala', 'talab', 'karez', 'water']],
  ['grazing', ['چارہ', 'چرا', 'گھاس', 'سبزہ', 'جھاڑی', 'chara', 'charagah', 'ghaas', 'ghas', 'sabza', 'jhari', 'grass', 'grazing']],
  ['shade', ['سایہ', 'درخت', 'saya', 'saaya', 'darakht', 'shade', 'tree']],
  ['home', ['گھر', 'ghar']],
  ['landmark', ['پہاڑ', 'پتھر', 'نشان', 'قبر', 'زیارت', 'pahar', 'pathar', 'nishan', 'ziarat']],
]
/** Tag suggested by words in a spoken / typed place name, if any. */
export function placeTypeOf(name: string): PlaceType | undefined {
  const t = ' ' + normalize(name).join(' ') + ' '
  return PLACE_WORDS.find(([, ws]) => ws.some(w => t.includes(w)))?.[0]
}

// ---------- intents ----------
export type Intent =
  | { kind: 'save_place'; name: string; placeType: PlaceType }
  | { kind: 'start_trip' } | { kind: 'end_trip' }
  | ({ kind: 'plan_today' } & PlanNeeds)
  | { kind: 'home_distance' } | { kind: 'way_back' }
  | { kind: 'good_grazing' }
  | { kind: 'last_trip_dir'; dir: Dir }
  | { kind: 'trips_this_month' } | { kind: 'last_trip_duration' }
  | { kind: 'been_here' }
  | { kind: 'place_distance'; name: string }
  | { kind: 'reminder'; text: string; dueAt: number; assumed?: WhenAssumed }
  | { kind: 'herd_confirm'; counts: { species: Species; count: number }[] }
  | { kind: 'herd_event'; events: HerdEventParse[] }
  | { kind: 'herd_status' }
  | { kind: 'reminders_list' }
  | { kind: 'unknown' }

/** qtyAssumed: no number was said, so 1 was assumed. The read-back must say so. */
export interface HerdEventParse { species: Species; type: HerdEventType; qty: number; qtyAssumed: boolean }

/** What the herder said they need today. CHOTA answers from their own records only (no advice, no forecast). */
export interface PlanNeeds { water: boolean; shade: boolean; near: boolean }
/** "Where / which way should I go (with the herd)": a go-verb plus a where-word. Going home is way_back / home_distance instead. */
const GO_VERBS = ['جاؤں', 'جاوں', 'جائیں', 'جاؤ', 'جانا', 'لے جاؤں', 'لے کر جاؤں', 'چراؤں', 'jana', 'jaun', 'jaon', 'jaoon', 'jayen', 'le jaun', 'charaun', 'go', 'take']
const WHERE_WORDS = ['کہاں', 'کدھر', 'کس طرف', 'کس جگہ', 'کونسی طرف', 'کون سی طرف', 'kahan', 'kidhar', 'kis taraf', 'kis jagah', 'konsi taraf', 'where', 'which way']
/** Asking for a place: with a stated need (water, heat) this is "where should I go today". */
const PLACE_ASK = ['جگہ بتاؤ', 'جگہ بتائیں', 'کوئی جگہ', 'کونسی جگہ', 'کون سی جگہ', 'jagah batao', 'koi jagah', 'konsi jagah', 'somewhere', 'a place', 'any place', 'which place']
const PLAN_WORDS = ['کس طرف جاؤں', 'کس طرف جاوں', 'kis taraf jaun', 'کہاں جاؤں', 'کدھر جاؤں', 'کہاں جاوں', 'کہاں لے جاؤں', 'کہاں چراؤں', 'کدھر چراؤں', 'کہاں چرانا', 'پانی کہاں ملے', 'کہاں جائیں',
  'kahan jaun', 'kahan jaon', 'kahan jaoon', 'kidhar jaun', 'kahan le jaun', 'kahan charaun', 'kahan charana', 'pani kahan milega', 'kahan jayen',
  'where should i go', 'where to go', 'where should i graze', 'where can i find water']
export function planNeeds(text: string): PlanNeeds {
  const t = ' ' + normalize(text).join(' ') + ' '
  const neg = has(t, 'نہیں', 'nahi', 'nhi', 'nahin', 'not')
  return {
    water: has(t, 'پانی', 'پیاس', 'pani', 'paani', 'pyas', 'water', 'thirst'),
    shade: has(t, 'گرمی', 'دھوپ', 'سایہ', 'garmi', 'dhoop', 'dhup', 'saya', 'heat', 'hot', 'shade'),
    near: has(t, 'قریب', 'پاس ہی', 'پاس میں', 'آس پاس', 'نزدیک', 'qareeb', 'kareeb', 'nazdeek', 'paas hi', 'paas mein', 'pass mein', 'aas paas', 'near', 'close') || (neg && has(t, 'دور', 'dur', 'door', 'far')),
  }
}

const TRIP_WORDS = ['سفر', 'ٹرپ', 'چکر', 'trip', 'safar', 'chakkar', 'grazing']
const START_WORDS = ['شروع', 'چلو', 'چلیں', 'نکل', 'shuru', 'chalo', 'chalein', 'chalen', 'nikal', 'start', "let's go", 'lets go']
const END_WORDS = ['ختم', 'بند', 'روک', 'khatam', 'band', 'rok', 'end', 'stop', 'finish']
/** A time or "remind" word means this is about later (a reminder), not "do it now". */
const LATER_WORDS = ['یاد', 'yaad', 'yad', 'remind', 'کل', 'kal', 'پرسوں', 'parson', 'بعد', 'baad', 'صبح', 'subah', 'شام', 'shaam', 'tomorrow']

/** Explicit "remind me": always a reminder, even if phrased as a question. */
const REMIND = ['یاد دلا', 'یاد کرا', 'yaad dila', 'yad dila', 'remind']
/** A question is asking about records, not setting a reminder ("کتنی ہے" is not "کرنی ہے"). */
const QUESTION = ['کتنی', 'کتنا', 'کتنے', 'کیا', 'کہاں', 'کب', 'کیسے', 'کون', 'کس', 'کدھر', 'kitni', 'kitna', 'kitne', 'kya', 'kahan', 'kab', 'kaise', 'kaun', 'kis', 'kidhar', 'how', 'what', 'where', 'when', 'which']
/** "جانا ہے" / "karni hai": an infinitive + hai = something to do later. Matched per word, never on a question word. */
function isTodo(toks: string[]) {
  return toks.some((t, i) => ['ہے', 'ہیں', 'hai', 'hain'].includes(toks[i + 1]) && !QUESTION.includes(t) && /(نا|نی|نے|na|ni|ne|naa)$/.test(t) && t.length > 2)
}

function eventType(text: string): HerdEventType | undefined {
  if (has(text, 'چوری', 'بھیڑیا', 'گم ہو', 'کھو گ', 'chori', 'gum ho', 'bheriya')) return 'loss'
  if (has(text, 'ذبح', 'zibah', 'qurbani', 'قربانی')) return 'slaughter'
  if (has(text, 'مر گ', 'مرگ', 'مرے', 'mar ga', 'mar gay', 'mar gai', 'mar gae')) return 'death'
  if (has(text, 'پیدا', 'بچے دی', 'بچہ دی', 'bacha di', 'bache di', 'paida', 'سوئی')) return 'birth'
  if (has(text, 'بیچ', 'فروخت', 'bech')) return 'sale'
  if (has(text, 'خرید', 'khareed', 'kharid')) return 'purchase'
}
const DELTA_SIGN: Record<HerdEventType, number> = { birth: 1, purchase: 1, sale: -1, death: -1, loss: -1, slaughter: -1, other: 0 }
export const signOf = (t: HerdEventType) => DELTA_SIGN[t]

/** Species mentions with their quantity (number just before the noun, else 1, flagged as assumed). */
export function speciesQty(toks: string[]) {
  const nums = parseNumbers(toks)
  const res: { species: Species; qty: number; qtyAssumed: boolean; idx: number }[] = []
  toks.forEach((t, i) => {
    const s = SPEC[t]; if (!s) return
    const n = nums.find(n => n.end === i && !n.money)
    res.push({ species: s, qty: n ? Math.round(n.value) : 1, qtyAssumed: !n, idx: i })
  })
  return res
}

export function parse(raw: string, nowMs: number, placeNames: string[] = []): Intent {
  let toks = normalize(raw)
  // self-correction "تین نہیں چار"
  for (let i = 1; i < toks.length - 1; i++)
    if (['نہیں', 'nahi', 'nahin'].includes(toks[i]) && numval(toks[i - 1]) !== undefined && numval(toks[i + 1]) !== undefined) {
      toks = [...toks.slice(0, i - 1), ...toks.slice(i + 1)]; break
    }
  const text = ' ' + toks.join(' ') + ' '

  // 1. save place: "is jagah ko <NAME> yaad rakho" / "اس جگہ کو <NAME> یاد رکھو"
  const sp = raw.match(/(?:اس|یہاں|یہ)\s*(?:جگہ)?\s*(?:کو)?\s+(.+?)\s+(?:کے نام سے\s+)?(?:یاد رکھو|یاد رکھنا|محفوظ کرو|save)/) ||
             raw.match(/(?:is|yahan|yeh|this)\s*(?:jagah|jaga|place)?\s*(?:ko)?\s+(.+?)\s+(?:ke naam se\s+)?(?:yaad rakho|yad rakho|yaad rakhna|save|remember)/i)
  if (sp) {
    const name = sp[1].replace(/^(جگہ|jagah|jaga)\s+(کو|ko)\s+/i, '').replace(/^(کو|ko)\s+/i, '').trim()
    return { kind: 'save_place', name, placeType: placeTypeOf(name) ?? 'other' }
  }
  // 1b. where to go today: answered from the herder's own records
  // ...or "tell me a place / somewhere" together with a need (water, heat): "بہت گرمی ہے کوئی قریب کی جگہ بتاؤ جہاں پانی ہو"
  const needs = planNeeds(raw)
  if (has(text, ...PLAN_WORDS) || (has(text, ...GO_VERBS) && has(text, ...WHERE_WORDS) && !has(text, 'واپس', 'wapas', 'گھر', 'ghar', 'home'))
      || ((needs.water || needs.shade) && has(text, ...PLACE_ASK) && !has(text, 'یاد رکھ', 'yaad rakh', 'محفوظ', 'save', 'remember')))
    return { kind: 'plan_today', ...needs }
  // 2. trip control, now (not "later": that is a reminder)
  const later = LATER_WORDS.some(w => toks.includes(w) || (w.includes(' ') && text.includes(w)))
  if (!later) {
    if (has(text, ...TRIP_WORDS) && has(text, ...START_WORDS) || has(text, 'چرانے جا', 'charane ja', 'chara ne ja')) return { kind: 'start_trip' }
    if (has(text, ...TRIP_WORDS) && has(text, ...END_WORDS) || has(text, 'واپس آ گیا', 'گھر پہنچ گیا', 'wapas aa gaya', 'ghar pohanch gaya', 'ghar pahunch gaya')) return { kind: 'end_trip' }
  }
  // 3. reminders (future tense / "yaad dilana")
  const question = QUESTION.some(w => toks.includes(w)) || /[?؟]/.test(raw)
  if (has(text, ...REMIND) || (!question && (isTodo(toks) || has(text, 'check karna', 'dekhna', 'دیکھنا', 'چیک کرنا')))) {
    if (!has(text, 'دکھاؤ', 'dikhao')) { const w = parseWhen(text, toks, nowMs); return { kind: 'reminder', text: raw.trim(), dueAt: w.at, assumed: w.assumed } }
  }
  // 3. home
  if (has(text, 'واپس', 'wapas', 'way back') && has(text, 'راستہ', 'رستہ', 'rasta', 'path', 'route')) return { kind: 'way_back' }
  if (has(text, 'گھر', 'ghar', 'home') && has(text, 'دور', 'door', 'dur', 'طرف', 'taraf', 'kidhar', 'کدھر', 'far', 'where', 'direction'))
    return { kind: 'home_distance' }
  // 4. trip memory
  if (has(text, 'اچھا چارہ', 'اچھی چراگاہ', 'acha chara', 'achha chara', 'acchi charagah', 'good grazing')) return { kind: 'good_grazing' }
  if (has(text, 'مہینے', 'mahine', 'month') && has(text, 'کتنے', 'kitne', 'how many')) return { kind: 'trips_this_month' }
  if (has(text, 'دیر', 'der', 'dair', 'long') && has(text, 'پچھلی', 'pichli', 'last', 'ٹرپ', 'trip', 'سفر', 'safar')) return { kind: 'last_trip_duration' }
  const dir = findDir(text)
  if (dir && has(text, 'کب', 'kab', 'when')) return { kind: 'last_trip_dir', dir }
  if (has(text, 'یہاں', 'yahan', 'اس جگہ', 'is jagah', 'here') && has(text, 'پہلے', 'pehle', 'کب', 'kab', 'before', 'when')) return { kind: 'been_here' }
  // 5. saved place distance
  const pn = placeNames.find(n => text.includes(normalize(n).join(' ')))
  if (pn && has(text, 'دور', 'door', 'dur', 'طرف', 'taraf', 'کہاں', 'kahan', 'far', 'where')) return { kind: 'place_distance', name: pn }
  // 6. herd
  const sq = speciesQty(toks)
  const et = eventType(text)
  if (et && sq.length) return { kind: 'herd_event', events: sq.map(s => ({ species: s.species, type: et, qty: s.qty, qtyAssumed: s.qtyAssumed })) }
  if (sq.length && !et && has(text, 'ہیں', 'hain', 'ہے', 'hai', 'کل ملا', 'ٹوٹل', 'total', 'گنتی', 'ginti')
      && !has(text, 'کتنی', 'کتنے', 'kitni', 'kitne', 'how many')) {
    const nums = parseNumbers(toks)
    const counts = sq.filter(s => nums.some(n => n.end === s.idx)).map(s => ({ species: s.species, count: s.qty }))
    if (counts.length) return { kind: 'herd_confirm', counts }
  }
  // Herd question only if it is about the herd: "کتنے" alone is also "how many trips / hours / km" (Test 7).
  const herdWord = sq.length > 0 || has(text, 'گنتی', 'ریوڑ', 'ریور', 'جانور', 'ginti', 'rewar', 'janwar', 'herd', 'animals')
  // ...and only a how-many question: "where did the animals graze" mentions animals but is not asking for the count.
  const countQ = has(text, 'کتنی', 'کتنے', 'کتنا', 'گنتی', 'تعداد', 'kitni', 'kitne', 'kitna', 'ginti', 'tadad', 'how many', 'count')
  if (herdWord && countQ && (question || has(text, 'بتاؤ', 'batao', 'دکھاؤ', 'dikhao'))) return { kind: 'herd_status' }
  if (has(text, 'یاد دہانی', 'reminder', 'یاد')) return { kind: 'reminders_list' }
  return { kind: 'unknown' }
}

export { DIRS, DIR_UR }
