/** Executes a parsed intent against the local DB and returns a templated Urdu + English answer. */
import { db, getHome, PLACE_TAGS, type Place, type PlaceType, type Trip } from './db'
import { now, DAY } from './clock'
import { parse, signOf, normalize, speciesQty, parseWhen, findDir, planNeeds, type Intent, type HerdEventParse, type PlanNeeds } from './nlu'
import { classify, type IntentModel } from './intentModel'
import type { HerdEventType } from './db'
import type { Species } from './db'
import { distanceM, bearingDeg, compass, DIR_UR, fmtKm, fmtKmUr } from './geo'
import { lastFix, activeTrip, currentFixState, startTrip, endTrip, type Fix } from './gps'
import { splitTrail, spanUr, spanEn, fixState } from './trail'
import { herdStatus, trackedSpecies, confirmCount, countUr, SPECIES_UR, SPECIES_UR_OBL, SPECIES_EN } from './herd'

export interface MapFocus { tripIds?: number[]; placeIds?: number[]; homeLine?: boolean; wayBack?: boolean }
/** A herd change understood from free text / voice. Nothing is written until the herder confirms the read-back. */
export type PendingWrite =
  | { kind: 'herd_event'; events: HerdEventParse[]; sourceText: string }
  | { kind: 'herd_confirm'; counts: { species: Species; count: number }[]; sourceText: string }
  | { kind: 'end_trip'; sourceText: string }
  | { kind: 'reminder'; text: string; dueAt: number; placeId?: number; tag?: string; sourceText: string }
/** Something the screen should do after the answer: open the trip screen, or ask for the grazing rating. */
export type UiAction = { go: 'trip' } | { rate: number }
/**
 * ai: the on-device classifier chose this command (rules didn't understand); shown to the herder as a guess.
 * choices: the classifier wasn't sure; the UI offers these commands as buttons (answer(text, label)).
 */
export interface Answer { ur: string; en: string; map?: MapFocus; ok: boolean; intent: Intent['kind']; pending?: PendingWrite; action?: UiAction
  ai?: { label: string; p: number }; choices?: string[] }

const TYPE_UR = { birth: 'پیدائش', purchase: 'خرید', sale: 'فروخت', death: 'موت', loss: 'گم/چوری', slaughter: 'ذبح', other: '' }
const TYPE_EN = { birth: 'born', purchase: 'bought', sale: 'sold', death: 'died', loss: 'lost/stolen', slaughter: 'slaughtered', other: '' }

/** Read-back of what was understood, stated before anything is saved. Assumed quantities are called out. */
function readBack(p: Extract<PendingWrite, { kind: 'herd_event' | 'herd_confirm' }>) {
  const ur = p.kind === 'herd_event'
    ? p.events.map(e => `${countUr(e.qty, e.species)} — ${TYPE_UR[e.type]}${e.qtyAssumed ? ' (تعداد نہیں بتائی، ایک مانی)' : ''}`).join('؛ ')
    : p.counts.map(c => `${countUr(c.count, c.species)} — آج کی پوری گنتی`).join('؛ ')
  const en = p.kind === 'herd_event'
    ? p.events.map(e => `${e.qty} ${SPECIES_EN[e.species].toLowerCase()} ${TYPE_EN[e.type]}${e.qtyAssumed ? ' (no number said; assumed 1)' : ''}`).join('; ')
    : p.counts.map(c => `${c.count} ${SPECIES_EN[c.species].toLowerCase()} — today's full count`).join('; ')
  return { ur: `میں نے یہ سمجھا: ${ur}۔ کیا یہ درست ہے؟ تصدیق کے بغیر کچھ درج نہیں ہو گا۔`, en: `I understood: ${en}. Is that right? Nothing is saved until you confirm.` }
}

/** The herder confirmed the read-back: write it. */
/** The herder said ✗: nothing is written. */
export function rejectPending(p: PendingWrite): Answer {
  const [ur, en] = p.kind === 'end_trip' ? ['ٹھیک ہے، سفر جاری ہے۔', 'OK, the trip continues.']
    : p.kind === 'reminder' ? ['ٹھیک ہے، یاد دہانی نہیں لگائی۔ دوبارہ بولیں، دن اور وقت کے ساتھ۔', 'OK, no reminder was set. Say it again with the day and time.']
    : ['ٹھیک ہے، کچھ درج نہیں کیا۔ دوبارہ بولیں یا ریوڑ کے صفحے پر خود درج کریں۔', 'OK, nothing was saved. Say it again, or enter it on the Herd screen.']
  return { ur, en, ok: false, intent: p.kind }
}

export async function commitPending(p: PendingWrite): Promise<Answer> {
  if (p.kind === 'reminder') {
    await db.reminders.add({ text: p.text, dueAt: p.dueAt, status: 'pending', source: 'user', createdAt: now(), placeId: p.placeId, kind: p.tag })
    return { ur: `یاد دہانی لگا دی: ${dueUr(p.dueAt)}۔`, en: `Reminder set for ${dueEn(p.dueAt)}.`, ok: true, intent: 'reminder' }
  }
  if (p.kind === 'end_trip') {
    const id = await endTrip()
    return id ? { ur: 'سفر ختم اور محفوظ ہو گیا۔', en: 'Trip ended and saved.', ok: true, intent: 'end_trip', action: { rate: id } }
      : { ur: 'کوئی سفر جاری نہیں تھا۔', en: 'No trip was running.', ok: false, intent: 'end_trip' }
  }
  const ur: string[] = [], en: string[] = []
  if (p.kind === 'herd_confirm') for (const c of p.counts) {
    const before = await herdStatus(c.species)
    await confirmCount(c.species, c.count, 'voice')
    const diff = before.estimate !== undefined ? c.count - before.estimate : undefined
    ur.push(`${countUr(c.count, c.species)} — آج کی تصدیق شدہ گنتی۔` + (diff ? ` پچھلا اندازہ ${before.estimate} تھا (فرق ${diff > 0 ? '+' : ''}${diff})۔ کیا کوئی پیدائش، خرید، فروخت یا نقصان درج ہونے سے رہ گیا؟` : ''))
    en.push(`${c.count} ${SPECIES_EN[c.species].toLowerCase()} — confirmed today.` + (diff ? ` Previous estimate was ${before.estimate} (difference ${diff > 0 ? '+' : ''}${diff}). Was a birth, purchase, sale or loss not recorded?` : ''))
  }
  else for (const e of p.events) {
    await db.herdEvents.add({ species: e.species, delta: signOf(e.type) * e.qty, type: e.type, at: now(), sourceText: p.sourceText, tripId: activeTrip() })
    const s = await herdStatus(e.species)
    ur.push(`درج کر لیا: ${countUr(e.qty, e.species)} — ${TYPE_UR[e.type]}۔` + (s.estimate !== undefined ? ` اندازاً اب ${s.estimate} (تصدیق شدہ نہیں)۔` : ` ${SPECIES_UR_OBL[e.species]} کی کوئی تصدیق شدہ گنتی نہیں، اس لیے کل تعداد معلوم نہیں۔`))
    en.push(`Recorded: ${e.qty} ${SPECIES_EN[e.species].toLowerCase()} — ${e.type}.` + (s.estimate !== undefined ? ` Estimated now ${s.estimate} (not confirmed).` : ` No confirmed ${SPECIES_EN[e.species].toLowerCase()} count, so the total is unknown.`))
  }
  return { ur: ur.join(' '), en: en.join(' '), ok: true, intent: p.kind }
}

const RATING_UR = { good: 'اچھا', okay: 'ٹھیک', poor: 'کمزور' } as const
/** Said back when the herder did not give it, so a wrong guess is caught now rather than when it fires. */
const ASSUMED_WHEN = {
  no_time: ['وقت نہیں بتایا، اس لیے یہ وقت رکھا', 'no time said, so this time was chosen'],
  no_date_or_time: ['دن اور وقت نہیں بتایا، اس لیے ایک گھنٹے بعد', 'no day or time said, so in one hour'],
  am: ['صبح یا شام نہیں بتایا، صبح مانی', 'morning or evening not said; assumed morning'],
  pm: ['صبح یا شام نہیں بتایا، دوپہر/شام مانی', 'morning or evening not said; assumed afternoon'],
} as const
/** Every historical answer is about what CHOTA recorded, never a claim of complete history. */
const REC_UR = 'میرے ریکارڈ میں', REC_EN = 'In my records'
export const agoUr = (t: number) => { const d = Math.floor((now() - t) / DAY); return d <= 0 ? 'آج' : d === 1 ? 'کل' : `${d} دن پہلے` }
export const agoEn = (t: number) => { const d = Math.floor((now() - t) / DAY); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago` }
const durUr = (ms: number) => { const h = Math.floor(ms / 3600000), m = Math.round(ms % 3600000 / 60000); return h ? `${h} گھنٹے ${m} منٹ` : `${m} منٹ` }
const durEn = (ms: number) => { const h = Math.floor(ms / 3600000), m = Math.round(ms % 3600000 / 60000); return h ? `${h} h ${m} min` : `${m} min` }
export function dueUr(t: number) {
  const d = new Date(t), today = new Date(now()); today.setHours(0, 0, 0, 0)
  const days = Math.round((new Date(t).setHours(0, 0, 0, 0) - today.getTime()) / DAY)
  const day = days === 0 ? 'آج' : days === 1 ? 'کل' : days === 2 ? 'پرسوں' : `${days} دن بعد`
  // 00:00–03:59 is still night in Urdu ("رات 12 بجے"), not morning.
  const h = d.getHours(), part = h < 4 ? 'رات' : h < 12 ? 'صبح' : h < 16 ? 'دوپہر' : h < 19 ? 'شام' : 'رات'
  return `${day} ${part} ${h % 12 || 12} بجے`
}
export function dueEn(t: number) {
  const d = new Date(t), today = new Date(now()); today.setHours(0, 0, 0, 0)
  const days = Math.round((new Date(t).setHours(0, 0, 0, 0) - today.getTime()) / DAY)
  const day = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`
  return `${day} at ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

const lastEnded = async () => (await db.trips.orderBy('startedAt').reverse().toArray()).filter(t => t.endedAt)

async function placesOfTrip(t: Trip) { return db.places.filter(p => p.tripId === t.id).toArray() }

/** Caveat for a usable-but-uncertain fix. Stale fixes are handled by each caller as "last known", never "now". */
function accNote() {
  const f = lastFix(), { state } = currentFixState()
  return state === 'poor' && f ? { ur: ` (GPS کمزور ہے، ±${Math.round(f.acc)} میٹر)`, en: ` (weak GPS, ±${Math.round(f.acc)} m)` } : { ur: '', en: '' }
}
const staleUr = (ms: number) => `آخری GPS ${spanUr(ms)} پہلے ملا تھا`
const staleEn = (ms: number) => `Last GPS fix was ${spanEn(ms)} ago`

/** Straight-line distance + direction from the current (or last known, clearly labelled) position to a target. */
function lineTo(target: { lat: number; lon: number }, nameUr: string, nameEn: string) {
  const f = lastFix()!, { state, ageMs } = currentFixState(), d = distanceM(f, target), dir = compass(bearingDeg(f, target))
  if (state === 'stale') return {
    ur: `${staleUr(ageMs)}۔ اُس جگہ سے ${nameUr} سیدھی لائن میں ${fmtKmUr(d)} دور، ${DIR_UR[dir]} کی طرف تھا۔ آپ ابھی کہاں ہیں، یہ معلوم نہیں۔`,
    en: `${staleEn(ageMs)}. From there, ${nameEn} was ${fmtKm(d)} away to the ${dir}. Your current position is not known.`, d, stale: true }
  const n = accNote()
  return { ur: `${nameUr} سیدھی لائن میں ${fmtKmUr(d)} دور، ${DIR_UR[dir]} کی طرف ہے۔${n.ur}`, en: `${nameEn[0].toUpperCase()}${nameEn.slice(1)} is ${fmtKm(d)} away in a straight line, to the ${dir}.${n.en}`, d, stale: false }
}

async function homeLine() {
  const home = await getHome(), f = lastFix()
  if (!home) return { ur: 'گھر ابھی محفوظ نہیں ہے۔ سیٹنگز میں "یہ میرا گھر ہے" دبائیں۔', en: 'Home is not set yet. Set it in Settings.' }
  if (!f) return { ur: 'ابھی GPS نہیں ملا۔ کھلی جگہ میں تھوڑا انتظار کریں۔', en: 'No GPS fix yet. Wait a moment in the open.' }
  const l = lineTo(home, 'گھر', 'home')
  if (!l.stale && l.d < 150 && currentFixState().state === 'ok') return { ur: 'آپ گھر کے پاس ہیں۔', en: 'You are at home.' }
  return { ur: l.ur, en: l.en }
}

/** "Recorded" vs "not recorded" summary of a trip's breadcrumbs, for any answer that shows or measures a trail. */
async function trailNote(tripId: number) {
  const trip = await db.trips.get(tripId)
  const pts = await db.points.where('tripId').equals(tripId).sortBy('t')
  const tr = splitTrail(pts, trip?.startedAt, trip?.endedAt ?? now())
  const live = !trip?.endedAt, tail = live ? tr.gaps.find(g => g.kind === 'tail') : undefined
  const past = tr.gaps.filter(g => g !== tail), pastMs = past.reduce((s, g) => s + g.ms, 0)
  let ur = '', en = ''
  if (past.length) {
    ur += ` ${past.length} حصوں میں (کل ${spanUr(pastMs)}) راستہ ریکارڈ نہیں ہوا؛ نقشے پر ٹوٹی لکیر صرف دونوں سرے جوڑتی ہے — وہاں آپ اصل میں کہاں سے گزرے، معلوم نہیں۔`
    en += ` ${past.length} part(s) of the trail (${spanEn(pastMs)} in total) were not recorded; the dashed line only joins the ends — the actual path there is unknown.`
  }
  if (tail) { ur += ` پچھلے ${spanUr(tail.ms)} سے راستہ ریکارڈ نہیں ہو رہا۔`; en += ` Nothing has been recorded for the last ${spanEn(tail.ms)}.` }
  return { tr, ur, en }
}

/**
 * Save a named place at `fix`. `atT` is when the herder asked (tapped "remember this place"): the fix must have
 * been fresh *then*; typing or speaking the name afterwards does not move the place.
 */
export async function savePlace(name: string, type: PlaceType, fix: Fix | undefined, atT = now()): Promise<Answer> {
  const A = (ur: string, en: string, map?: MapFocus, ok = true): Answer => ({ ur, en, map, ok, intent: 'save_place' })
  name = name.trim()
  if (!fix) return A('ابھی GPS نہیں ملا، جگہ محفوظ نہیں ہو سکی۔', 'No GPS fix yet; the place was not saved.', undefined, false)
  const fs = fixState(fix, atT)
  if (fs.state === 'stale') return A(`${staleUr(fs.ageMs)}، اس لیے جگہ محفوظ نہیں کی — غلط جگہ یاد ہو جاتی۔ کھلی جگہ میں GPS کا انتظار کریں۔`,
    `${staleEn(fs.ageMs)}, so the place was not saved — it would be stored at the wrong spot. Wait for GPS in the open.`, undefined, false)
  const dup = await db.places.filter(p => p.name.trim() === name).count()
  const weak = fs.state === 'poor' ? { ur: ` (GPS کمزور تھا، ±${Math.round(fix.acc)} میٹر)`, en: ` (weak GPS, ±${Math.round(fix.acc)} m)` } : { ur: '', en: '' }
  const tag = PLACE_TAGS.find(t => t.type === type)
  const id = await db.places.add({ name, type, lat: fix.lat, lon: fix.lon, acc: fix.acc, createdAt: atT, tripId: activeTrip() })
  return A(`ٹھیک ہے، یہ جگہ "${name}" کے نام سے یاد رکھ لی${tag && type !== 'other' ? ` (${tag.icon} ${tag.ur})` : ''}۔${dup ? ' (اس نام کی ایک اور جگہ بھی ہے)' : ''}${weak.ur}`,
    `Saved this spot as "${name}"${tag && type !== 'other' ? ` (${tag.en.toLowerCase()})` : ''}.${dup ? ' (Another place has the same name.)' : ''}${weak.en}`, { placeIds: [id as number] })
}

// ---------- AI fallback (Test 7): rules first; the classifier only when they don't understand ----------
/** Below this the classifier is "not sure" and offers choices instead of acting. Chosen on held-out data (ml/evaluate.ts). */
export const AI_MIN_P = 0.5
/** Above this an "out of scope" verdict overrides a rules herd match. */
export const OOS_VETO_P = 0.7
export const LABEL_UR: Record<string, [string, string, string]> = {
  home_distance: ['🏠', 'گھر کی دوری', 'distance home'], way_back: ['🏠', 'واپسی کا راستہ', 'way back'],
  start_trip: ['👣', 'سفر شروع', 'start trip'], end_trip: ['👣', 'سفر ختم', 'end trip'],
  save_place: ['📍', 'جگہ یاد رکھنا', 'remember a place'], place_distance: ['📍', 'محفوظ جگہ کی دوری', 'distance to a saved place'],
  good_grazing: ['🌿', 'اچھا چارہ کہاں ملا', 'where grazing was good'], been_here: ['📍', 'کیا یہاں پہلے آیا', 'been here before'],
  last_trip_dir: ['🧭', 'کسی سمت آخری سفر', 'last trip in a direction'], trips_this_month: ['👣', 'اس مہینے کے سفر', 'trips this month'],
  last_trip_duration: ['⏱', 'پچھلے سفر کا وقت', 'last trip length'], reminder: ['🔔', 'یاد دہانی لگانا', 'set a reminder'],
  reminders_list: ['🔔', 'یاد دہانیاں دکھانا', 'show reminders'], herd_confirm: ['🐐', 'ریوڑ کی گنتی درج کرنا', 'record herd count'],
  herd_status: ['🐐', 'ریوڑ کتنا ہے', 'how many animals'], herd_event_sale: ['🐐', 'جانور بیچے', 'animals sold'],
  herd_event_purchase: ['🐐', 'جانور خریدے', 'animals bought'], herd_event_birth: ['🐐', 'بچے پیدا ہوئے', 'births'],
  herd_event_death: ['🐐', 'جانور مرے', 'deaths'], herd_event_loss: ['🐐', 'جانور گم / چوری', 'lost / stolen'],
  herd_event_slaughter: ['🐐', 'جانور ذبح', 'slaughtered'],
  plan_today: ['🧭', 'آج کہاں جاؤں (ریکارڈ سے)', 'where to go today (from records)'],
}
let modelP: Promise<IntentModel | undefined> | undefined
const loadModel = () => modelP ??= fetch(`${import.meta.env.BASE_URL}data/intent-model.json`).then(r => r.ok ? r.json() : undefined).catch(() => undefined)

/** Turn a classifier label into a command, using the rules' extractors for the details (species, numbers, time, direction). */
async function fromLabel(label: string, text: string, places: Place[]): Promise<Answer> {
  const toks = normalize(text)
  const need = (ur: string, en: string): Answer => ({ ur, en, ok: false, intent: 'unknown' })
  const go = (i: Intent) => run(i, text, places)
  if (label.startsWith('herd_event_')) {
    const sq = speciesQty(toks)
    if (!sq.length) return need('کون سا جانور اور کتنے؟ مثلاً: "دو بکریاں بیچیں"', 'Which animal, and how many? e.g. "sold two goats"')
    return go({ kind: 'herd_event', events: sq.map(x => ({ species: x.species, type: label.slice(11) as HerdEventType, qty: x.qty, qtyAssumed: x.qtyAssumed })) })
  }
  switch (label) {
    case 'herd_confirm': {
      const counts = speciesQty(toks).filter(x => !x.qtyAssumed).map(x => ({ species: x.species, count: x.qty }))
      return counts.length ? go({ kind: 'herd_confirm', counts }) : need('کتنے جانور؟ مثلاً: "میرے پاس 40 بکریاں ہیں"', 'How many animals? e.g. "I have 40 goats"')
    }
    case 'reminder': { const w = parseWhen(' ' + toks.join(' ') + ' ', toks, now()); return go({ kind: 'reminder', text: text.trim(), dueAt: w.at, assumed: w.assumed }) }
    case 'last_trip_dir': {
      const dir = findDir(' ' + toks.join(' ') + ' ')
      return dir ? go({ kind: 'last_trip_dir', dir }) : need('کس سمت؟ مثلاً: "پچھلی بار شمال کب گیا تھا"', 'Which direction? e.g. "when did I last go north"')
    }
    case 'place_distance': {
      const hit = places.filter(p => normalize(p.name).some(w => toks.includes(w))).at(-1)
      return hit ? go({ kind: 'place_distance', name: hit.name })
        : need(places.length ? `کون سی جگہ؟ محفوظ جگہیں: ${places.map(p => p.name).join('، ')}` : 'ابھی کوئی جگہ محفوظ نہیں۔', places.length ? 'Which place? Saved places are listed above.' : 'No places saved yet.')
    }
    case 'plan_today': return go({ kind: 'plan_today', ...planNeeds(text) })
    case 'save_place': return need('جگہ یاد رکھنے کے لیے کہیں: "اس جگہ کو پرانا چارہ یاد رکھو"، یا سفر میں 📍 دبائیں۔', 'To save a place say "remember this place as …", or tap 📍 on the trip screen.')
    default: return go({ kind: label } as Intent)
  }
}

export async function answer(text: string, forced?: string): Promise<Answer> {
  const places = await db.places.toArray()
  if (forced) return fromLabel(forced, text, places)          // herder picked one of the offered choices
  const intent = parse(text, now(), places.map(p => p.name))
  const oos = (p: number): Answer => ({ ur: 'یہ CHOTA کا کام نہیں: یہ صرف آپ کے سفر، جگہوں، یاد دہانیوں اور ریوڑ کی گنتی کا ریکارڈ رکھتا ہے۔ جانوروں کی بیماری، قیمتیں یا موسم نہیں بتاتا۔',
    en: 'That is outside CHOTA: it keeps your trips, places, reminders and herd count. It does not advise on animal health, prices or weather.', ok: false, intent: 'unknown', ai: { label: 'out_of_scope', p } })
  if (intent.kind !== 'unknown') {
    // The rules' herd matching fires on any animal word ("بکری کو بخار ہے"); a very confident "out of scope" overrides it.
    if (intent.kind === 'herd_status' || intent.kind === 'herd_confirm' || intent.kind === 'herd_event') {
      const m = await loadModel(), top = m && classify(m, text)[0]
      if (top && top.label === 'out_of_scope' && top.p >= OOS_VETO_P) return oos(top.p)
    }
    return run(intent, text, places)
  }
  const m = await loadModel()
  if (!m) return run(intent, text, places)
  const g = classify(m, text), top = g[0]
  if (top.p >= AI_MIN_P) {
    if (top.label === 'out_of_scope') return oos(top.p)
    const a = await fromLabel(top.label, text, places), [, ur, en] = LABEL_UR[top.label]
    // A guess is shown as a guess; anything that changes records is read back for ✓ anyway.
    return { ...a, ai: { label: top.label, p: top.p }, ...(a.pending ? {} : { ur: `میں نے سمجھا: ${ur}۔ ${a.ur}`, en: `I understood: ${en}. ${a.en}` }) }
  }
  const choices = g.filter(x => x.label !== 'out_of_scope').slice(0, 2).map(x => x.label)
  return { ur: 'پکا نہیں سمجھا۔ کیا آپ کا مطلب یہ ہے؟', en: 'Not sure I understood. Did you mean one of these?', ok: false, intent: 'unknown', choices, ai: { label: top.label, p: top.p } }
}

/**
 * "Where should I go today?" answered ONLY from the herder's own records (saved water/shade/grazing places and their
 * trip ratings), each with its age. Not advice and not a forecast: today's water and grass are unknown to CHOTA.
 */
/** Isolate an Urdu name inside an English sentence so it doesn't reorder the words around it. */
const iso = (s: string) => `\u2068${s}\u2069`

async function planToday(need: PlanNeeds, places: Place[]): Promise<Answer> {
  const A = (ur: string, en: string, map?: MapFocus, ok = true): Answer => ({ ur, en, map, ok, intent: 'plan_today' })
  const home = await getHome(), f = lastFix(), fs = currentFixState()
  const from = f && (fs.state === 'ok' || fs.state === 'poor') ? f : home
  if (!from) return A('پہلے گھر محفوظ کریں یا GPS کا انتظار کریں، تاکہ فاصلے بتا سکوں۔', 'Set home or wait for GPS so I can give distances.', undefined, false)
  const fromUr = from === home ? 'گھر سے' : 'یہاں سے', fromEn = from === home ? 'from home' : 'from here'
  const maxM = need.near ? 3000 : 8000, OLD = 21 * DAY
  type Spot = { ur: string; en: string; lat: number; lon: number; t: number; placeId?: number; tripId?: number; score: number; note?: string; ratingUr?: string }
  const d = (s: { lat: number; lon: number }) => distanceM(from, s)
  const asSpot = (p: Place, score = 0): Spot => ({ ur: p.name, en: iso(p.name), lat: p.lat, lon: p.lon, t: p.createdAt, placeId: p.id, score, note: p.note })
  const water = places.filter(p => p.type === 'water').map(p => asSpot(p)).sort((a, b) => d(a) - d(b))
  const shade = places.filter(p => p.type === 'shade').map(p => asSpot(p))
  // grazing: saved grazing places + where rated trips went furthest from home
  const graze: Spot[] = places.filter(p => p.type === 'grazing').map(p => asSpot(p, 1.5))
  for (const t of (await lastEnded()).filter(t => t.rating === 'good' || t.rating === 'okay')) {
    const pts = await db.points.where('tripId').equals(t.id!).toArray()
    if (!pts.length || !home) continue
    const far = pts.reduce((a, b) => distanceM(home, b) > distanceM(home, a) ? b : a)
    graze.push({ ur: `${agoUr(t.startedAt)} والا سفر`, en: `the trip ${agoEn(t.startedAt)}`, lat: far.lat, lon: far.lon, t: t.startedAt, tripId: t.id,
      score: t.rating === 'good' ? 2 : 1, ratingUr: RATING_UR[t.rating!] })
  }
  const days = (t: number) => (now() - t) / DAY
  // Grazing value from the herder's own ratings: better rating and more recent ranks higher.
  const gv = (s: Spot) => s.score - days(s.t) / 30
  const near = graze.filter(s => d(s) <= maxM)
  // Water and grazing are chosen together: water with well-rated recent grazing within 1.5 km beats merely the closest.
  const wv = (x: Spot) => Math.max(0, ...near.filter(s => distanceM(x, s) <= 1500).map(gv)) - d(x) / 2000 - (now() - x.t > OLD ? 0.5 : 0)
  const w = water.filter(s => d(s) <= maxM).sort((a, b) => wv(b) - wv(a))[0] ?? (need.water ? water[0] : undefined)
  const g = near.map(s => ({ s, v: gv(s) + (w && distanceM(w, s) <= 1500 ? 1.5 : 0) })).sort((a, b) => b.v - a.v)[0]?.s
  const anchor = w ?? g ?? from
  const sh = need.shade ? shade.filter(s => d(s) <= maxM).sort((a, b) => distanceM(anchor, a) - distanceM(anchor, b))[0] : undefined

  const where = (s: Spot) => { const dir = compass(bearingDeg(from, s)); return { ur: `${fmtKmUr(d(s))} ${DIR_UR[dir]}`, en: `${fmtKm(d(s))} ${dir}` } }
  const age = (s: Spot) => ({
    ur: (s.ratingUr ? `${agoUr(s.t)} چارہ "${s.ratingUr}" بتایا` : `${agoUr(s.t)} محفوظ کی`) + (now() - s.t > OLD ? '، ⚠️ پرانا ریکارڈ' : '') + (s.note ? `، نوٹ: ${s.note}` : ''),
    en: (s.ratingUr ? `rated ${agoEn(s.t)}` : `saved ${agoEn(s.t)}`) + (now() - s.t > OLD ? ', ⚠️ old record' : '') })
  const line = (icon: string, lu: string, le: string, s: Spot) => {
    const far = d(s) > maxM ? { ur: ' (آپ کی حد سے دور)', en: ' (beyond your limit)' } : { ur: '', en: '' }
    return { ur: `${icon} ${lu}: ${s.ur} — ${fmtKmUr(d(s))} ${DIR_UR[compass(bearingDeg(from, s))]}${far.ur} (${age(s).ur})۔`, en: `${icon} ${le}: ${s.en} — ${where(s).en}${far.en} (${age(s).en}).` }
  }
  const ur: string[] = [], en: string[] = []
  const conds = [need.near && ['قریب', 'not far'], need.water && ['پانی', 'water'], need.shade && ['گرمی / سایہ', 'heat / shade']].filter(Boolean) as string[][]
  ur.push(`میرے ریکارڈ میں${conds.length ? ` (آپ کی شرطیں: ${conds.map(c => c[0]).join('، ')})` : ''}، ${fromUr}:`)
  en.push(`In my records${conds.length ? ` (your needs: ${conds.map(c => c[1]).join(', ')})` : ''}, ${fromEn}:`)
  if (need.water || w) {
    if (w) {
      const nearest = water[0], skipped = nearest !== w && d(nearest) <= maxM
      const l = line('💧', skipped ? 'پانی' : 'قریب ترین پانی', skipped ? 'Water' : 'Nearest water', w); ur.push(l.ur); en.push(l.en)
      // Say why the closer water wasn't picked, so the choice is checkable rather than a black box.
      if (skipped) { ur[ur.length - 1] += ` (قریب ترین پانی "${nearest.ur}" ${fmtKmUr(d(nearest))} پر ہے، مگر اس کے پاس اچھا چارہ درج نہیں۔)`; en[en.length - 1] += ` (The closest water, "${nearest.en}" at ${fmtKm(d(nearest))}, has no well-rated grazing recorded near it.)` }
    }
    else { ur.push('💧 میرے ریکارڈ میں کوئی پانی کی جگہ نہیں۔ پانی ملے تو کہیں: "اس جگہ کو پانی یاد رکھو"۔'); en.push('💧 No water place in my records. When you find one, say "remember this place as water".') }
  }
  if (g) { const l = line('🌿', w && distanceM(w, g) <= 1500 ? 'اس پانی کے پاس چارہ' : 'چارہ', w && distanceM(w, g) <= 1500 ? 'Grazing near that water' : 'Grazing', g); ur.push(l.ur); en.push(l.en) }
  else { ur.push(`🌿 ${fmtKmUr(maxM)} کے اندر کوئی اچھا ریکارڈ شدہ چارہ نہیں۔`); en.push(`🌿 No well-rated grazing recorded within ${fmtKm(maxM)}.`) }
  if (need.shade) {
    if (sh) { const l = line('🌳', 'سایہ', 'Shade', sh); ur.push(l.ur); en.push(l.en) }
    else { ur.push('🌳 قریب کوئی سایہ دار جگہ محفوظ نہیں۔'); en.push('🌳 No shade saved nearby.') }
  }
  ur.push('⚠️ یہ آپ کے پرانے ریکارڈ ہیں؛ آج وہاں پانی یا چارہ ہے یا نہیں، CHOTA کو معلوم نہیں۔')
  en.push("⚠️ These are your past records; CHOTA doesn't know today's water or grass there.")
  const picked = [w, g, sh].filter(Boolean) as Spot[]
  // One item per line (💧 / 🌿 / 🌳 / ⚠️): easier to scan outdoors than one paragraph.
  return A(ur.join('\n'), en.join('\n'), { placeIds: picked.flatMap(s => s.placeId ? [s.placeId] : []), tripIds: picked.flatMap(s => s.tripId ? [s.tripId] : []) }, !!(w || g))
}

async function run(intent: Intent, text: string, places: Place[]): Promise<Answer> {
  const A = (ur: string, en: string, map?: MapFocus, ok = true): Answer => ({ ur, en, map, ok, intent: intent.kind })
  const f = lastFix()

  switch (intent.kind) {
    case 'save_place': return savePlace(intent.name, intent.placeType, f)
    case 'plan_today': return planToday(intent, places)
    case 'start_trip': {
      if (activeTrip()) return { ...A('سفر پہلے سے جاری ہے۔', 'A trip is already running.'), action: { go: 'trip' } }
      await startTrip()
      return { ...A('سفر شروع ہو گیا۔ راستہ ریکارڈ ہو رہا ہے — CHOTA کھلا رکھیں۔', 'Trip started. The trail is being recorded — keep CHOTA open.'), action: { go: 'trip' } }
    }
    case 'end_trip': {
      if (!activeTrip()) return A('کوئی سفر جاری نہیں۔', 'No trip is running.', undefined, false)
      // Misheard words must not end a trip: confirm first, like herd changes.
      return { ...A('میں نے سمجھا: سفر ختم کرنا ہے۔ کیا ختم کر دوں؟', 'I understood: end the trip. Shall I end it?'), pending: { kind: 'end_trip', sourceText: text } }
    }
    case 'home_distance': { const h = await homeLine(); return A(h.ur, h.en, { homeLine: true }) }
    case 'way_back': {
      const tid = activeTrip() ?? (await lastEnded())[0]?.id
      if (!tid) return A('ابھی کوئی سفر ریکارڈ نہیں ہوا۔', 'No trip recorded yet.', undefined, false)
      const t = await trailNote(tid)
      const h = await homeLine()
      return A(`نقشے پر نارنجی لکیر آپ کا اپنا ریکارڈ شدہ راستہ ہے (${fmtKmUr(t.tr.recordedM)})۔ یہ نیا راستہ نہیں، صرف وہی جس پر آپ چلے۔${t.ur} ${h.ur}`,
        `The orange line is the path you walked, as recorded (${fmtKm(t.tr.recordedM)}). It is your own track, not a new route.${t.en} ${h.en}`,
        { tripIds: [tid], wayBack: true, homeLine: true })
    }
    case 'good_grazing': {
      const ended = await lastEnded(), good = ended.filter(t => t.rating === 'good'), unrated = ended.filter(t => !t.rating).length
      const gp = places.filter(p => p.type === 'grazing')
      const unr = unrated ? { ur: ` ${unrated} سفر بغیر رائے کے ہیں۔`, en: ` ${unrated} recorded trip(s) have no rating.` } : { ur: '', en: '' }
      if (!good.length && !gp.length) return A(`${REC_UR} ابھی تک کسی سفر کا چارہ "اچھا" درج نہیں۔${unr.ur}`, `${REC_EN}, no trip's grazing has been rated good yet.${unr.en}`, undefined, false)
      if (!good.length) return A(`${REC_UR} کسی سفر کا چارہ "اچھا" درج نہیں؛ محفوظ چراگاہیں: ${gp.map(p => p.name).join('، ')}۔${unr.ur}`,
        `${REC_EN}, no trip is rated good; saved grazing places: ${gp.map(p => p.name).join(', ')}.${unr.en}`, { placeIds: gp.map(p => p.id!) })
      const t = good[0], tp = await placesOfTrip(t)
      const where = t.direction ? `${DIR_UR[t.direction as keyof typeof DIR_UR]}، گھر سے تقریباً ${fmtKmUr(t.furthestFromHomeM ?? 0)}` : ''
      const whereEn = t.direction ? ` — ${t.direction}, about ${fmtKm(t.furthestFromHomeM ?? 0)} from home` : ''
      return A(`${REC_UR} آخری بار اچھا چارہ ${agoUr(t.startedAt)} درج ہوا — ${where}۔${tp.length ? ` اس سفر میں آپ نے "${tp.map(p => p.name).join('"، "')}" محفوظ کیا تھا۔` : ''} (یہ اُس دن کی آپ کی اپنی رائے ہے۔)` +
        (good.length > 1 ? ` کل ${good.length} سفر اچھے درج ہیں۔` : '') + unr.ur,
        `${REC_EN}, good grazing was last noted ${agoEn(t.startedAt)}${whereEn}.${tp.length ? ` You saved "${tp.map(p => p.name).join('", "')}" on that trip.` : ''} (Your own rating from that day.)${unr.en}`,
        { tripIds: good.slice(0, 3).map(x => x.id!), placeIds: [...tp, ...gp].map(p => p.id!) })
    }
    case 'last_trip_dir': {
      const t = (await lastEnded()).find(t => t.direction === intent.dir)
      if (!t) return A(`${REC_UR} ${DIR_UR[intent.dir]} کی طرف کوئی سفر نہیں۔ ہو سکتا ہے آپ گئے ہوں لیکن وہ سفر CHOTA پر ریکارڈ نہ ہوا ہو۔`,
        `${REC_EN}, there is no trip to the ${intent.dir}. You may have gone without CHOTA recording it.`, undefined, false)
      return A(`${REC_UR} آپ آخری بار ${agoUr(t.startedAt)} ${DIR_UR[intent.dir]} کی طرف گئے تھے، گھر سے ${fmtKmUr(t.furthestFromHomeM ?? 0)} تک۔${t.rating ? ` چارہ: ${RATING_UR[t.rating]}۔` : ''}`,
        `${REC_EN}, your last trip to the ${intent.dir} was ${agoEn(t.startedAt)}, up to ${fmtKm(t.furthestFromHomeM ?? 0)} from home.${t.rating ? ` Grazing: ${t.rating}.` : ''}`, { tripIds: [t.id!] })
    }
    case 'trips_this_month': {
      const m0 = new Date(now()); m0.setDate(1); m0.setHours(0, 0, 0, 0)
      const ts = (await lastEnded()).filter(t => t.startedAt >= m0.getTime())
      const c = (r: string) => ts.filter(t => t.rating === r).length, unrated = ts.filter(t => !t.rating).length
      return A(`${REC_UR} اس مہینے ${ts.length} سفر ${ts.length === 1 ? 'ہے' : 'ہیں'} — اچھا ${c('good')}، ٹھیک ${c('okay')}، کمزور ${c('poor')}${unrated ? `، بغیر رائے ${unrated}` : ''}۔ (صرف وہ سفر جو CHOTA پر شروع کیے گئے۔)`,
        `${REC_EN}, ${ts.length} trip${ts.length === 1 ? '' : 's'} this month — good ${c('good')}, okay ${c('okay')}, poor ${c('poor')}${unrated ? `, unrated ${unrated}` : ''}. (Only trips started in CHOTA.)`, { tripIds: ts.map(t => t.id!) })
    }
    case 'last_trip_duration': {
      const t = (await lastEnded())[0]
      if (!t) return A(`${REC_UR} ابھی کوئی مکمل سفر نہیں۔`, `${REC_EN}, there is no completed trip yet.`, undefined, false)
      const ms = t.endedAt! - t.startedAt, n = await trailNote(t.id!)
      return A(`${REC_UR} پچھلا سفر (${agoUr(t.startedAt)}) ${durUr(ms)} کا تھا، ${fmtKmUr(n.tr.recordedM)} ریکارڈ ہوئے۔${n.ur}`,
        `${REC_EN}, your last trip (${agoEn(t.startedAt)}) lasted ${durEn(ms)}; ${fmtKm(n.tr.recordedM)} were recorded.${n.en}`, { tripIds: [t.id!] })
    }
    case 'been_here': {
      if (!f) return A('ابھی GPS نہیں ملا۔', 'No GPS fix yet.', undefined, false)
      const fs = currentFixState()
      if (fs.state === 'stale') return A(`${staleUr(fs.ageMs)}، اس لیے معلوم نہیں کہ آپ ابھی کہاں ہیں۔`, `${staleEn(fs.ageMs)}, so I do not know where "here" is right now.`, undefined, false)
      const near = (await db.points.toArray()).filter(p => p.tripId !== activeTrip() && distanceM(p, f) < 300)
      const byTrip = new Map<number, number>(); near.forEach(p => byTrip.set(p.tripId, Math.max(byTrip.get(p.tripId) ?? 0, p.t)))
      const np = places.filter(p => distanceM(p, f) < 300)
      if (!byTrip.size && !np.length) return A(`${REC_UR} آپ یہاں پہلے نہیں آئے۔ (صرف وہ سفر جو CHOTA نے ریکارڈ کیے؛ ہو سکتا ہے آپ پہلے آئے ہوں۔)`, `${REC_EN}, you have not been here before (only trips CHOTA recorded; you may have been here without it).`, undefined)
      const lastT = Math.max(...byTrip.values(), ...np.map(p => p.createdAt))
      const placeUr = np.length ? ` قریب محفوظ جگہ: "${np[0].name}"۔` : '', placeEn = np.length ? ` Nearby saved place: "${np[0].name}".` : ''
      if (!byTrip.size) return A(`${REC_UR} یہاں کوئی سفر نہیں گزرا، لیکن${placeUr}`, `${REC_EN}, no recorded trip passed here, but there is a saved place.${placeEn}`, { placeIds: np.map(p => p.id!) })
      return A(`جی ہاں، ${REC_UR} آپ یہاں ${byTrip.size} بار آئے، آخری بار ${agoUr(lastT)}۔${placeUr}`,
        `Yes — ${REC_EN.toLowerCase()}, ${byTrip.size} visit(s), last ${agoEn(lastT)}.${placeEn}`,
        { tripIds: [...byTrip.keys()], placeIds: np.map(p => p.id!) })
    }
    case 'place_distance': {
      const p = places.filter(x => x.name === intent.name).at(-1) as Place
      if (!f) return A('ابھی GPS نہیں ملا۔', 'No GPS fix yet.', undefined, false)
      const l = lineTo(p, `"${p.name}"`, `"${p.name}"`)
      return A(`${l.ur} آپ نے اسے ${agoUr(p.createdAt)} محفوظ کیا تھا۔`, `${l.en} Saved ${agoEn(p.createdAt)}.`, { placeIds: [p.id!] })
    }
    case 'reminder': {
      // Read back day + time first: a misheard sentence must not quietly become a reminder.
      const place = places.find(p => intent.text.includes(p.name))
      const pending: PendingWrite = { kind: 'reminder', text: intent.text, dueAt: intent.dueAt, placeId: place?.id, sourceText: text,
        tag: /گنتی|count|گن/.test(intent.text) ? 'herd_count' : undefined }
      const as = intent.assumed ? ASSUMED_WHEN[intent.assumed] : undefined
      return { ...A(`میں نے سمجھا: یاد دہانی ${dueUr(intent.dueAt)}${as ? ` (${as[0]})` : ''} — "${intent.text}"۔ کیا یہ درست ہے؟`,
        `I understood: a reminder ${dueEn(intent.dueAt)}${as ? ` (${as[1]})` : ''}: "${intent.text}". Is that right?`), pending }
    }
    case 'herd_confirm':
    case 'herd_event': {
      const pending: Extract<PendingWrite, { kind: 'herd_event' | 'herd_confirm' }> = intent.kind === 'herd_event'
        ? { kind: 'herd_event', events: intent.events, sourceText: text }
        : { kind: 'herd_confirm', counts: intent.counts, sourceText: text }
      const rb = readBack(pending)
      return { ...A(rb.ur, rb.en), pending }
    }
    case 'herd_status': {
      const sp = await trackedSpecies()
      if (!sp.length) return A('ابھی کوئی گنتی محفوظ نہیں۔ مثلاً کہیں: "میرے پاس 47 بکریاں ہیں"۔', 'No herd count yet. Say e.g. "I have 47 goats".', undefined, false)
      const ur: string[] = [], en: string[] = []
      for (const s of await Promise.all(sp.map(herdStatus))) {
        if (!s.confirmed) {
          ur.push(`${SPECIES_UR[s.species]}: کوئی تصدیق شدہ گنتی نہیں، اس لیے کل تعداد معلوم نہیں۔ درج شدہ تبدیلیاں +${s.additions} −${s.removals}۔`)
          en.push(`${SPECIES_EN[s.species]}: no confirmed count, so the total is unknown. Recorded changes +${s.additions} −${s.removals}.`)
          continue
        }
        ur.push(`${SPECIES_UR[s.species]}: آخری تصدیق ${s.confirmed!.count} (${agoUr(s.confirmed!.confirmedAt)})۔` +
          (s.eventsSince.length ? ` اس کے بعد درج شدہ تبدیلیاں +${s.additions} −${s.removals}، اندازہ ${s.estimate} (صرف درج شدہ تبدیلیوں پر مبنی)۔` : '') +
          (s.status === 'stale' ? ` ⚠️ ${s.daysSinceConfirmed} دن سے دوبارہ گنتی نہیں ہوئی۔` : ''))
        en.push(`${SPECIES_EN[s.species]}: last confirmed ${s.confirmed!.count} (${agoEn(s.confirmed!.confirmedAt)}).` +
          (s.eventsSince.length ? ` Recorded since: +${s.additions} −${s.removals}, estimate ${s.estimate} (only from recorded changes).` : '') +
          (s.status === 'stale' ? ` ⚠️ Not recounted for ${s.daysSinceConfirmed} days.` : ''))
      }
      return A(ur.join(' '), en.join(' '))
    }
    case 'reminders_list': {
      const rs = await db.reminders.where('status').equals('pending').sortBy('dueAt')
      if (!rs.length) return A('کوئی یاد دہانی باقی نہیں۔', 'No pending reminders.')
      return A(rs.map(r => `${dueUr(r.dueAt)}: ${r.text}`).join('۔ '), rs.map(r => `${dueEn(r.dueAt)}: ${r.text}`).join('. '))
    }
    default:
      return A('معاف کیجیے، یہ بات سمجھ نہیں آئی۔ نیچے دی گئی مثالوں میں سے کوئی آزمائیں۔', 'Sorry, I did not understand. Try one of the examples below.', undefined, false)
  }
}
