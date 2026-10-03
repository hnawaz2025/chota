/** Executes a parsed intent against the local DB and returns a templated Urdu + English answer. */
import { db, getHome, PLACE_TAGS, type Place, type PlaceType, type Trip } from './db'
import { now, DAY } from './clock'
import { parse, signOf, type Intent, type HerdEventParse } from './nlu'
import type { Species } from './db'
import { distanceM, bearingDeg, compass, DIR_UR, fmtKm, fmtKmUr } from './geo'
import { lastFix, activeTrip, currentFixState, type Fix } from './gps'
import { splitTrail, spanUr, spanEn, fixState } from './trail'
import { herdStatus, trackedSpecies, confirmCount, countUr, SPECIES_UR, SPECIES_UR_OBL, SPECIES_EN } from './herd'

export interface MapFocus { tripIds?: number[]; placeIds?: number[]; homeLine?: boolean; wayBack?: boolean }
/** A herd change understood from free text / voice. Nothing is written until the herder confirms the read-back. */
export type PendingWrite =
  | { kind: 'herd_event'; events: HerdEventParse[]; sourceText: string }
  | { kind: 'herd_confirm'; counts: { species: Species; count: number }[]; sourceText: string }
export interface Answer { ur: string; en: string; map?: MapFocus; ok: boolean; intent: Intent['kind']; pending?: PendingWrite }

const TYPE_UR = { birth: 'پیدائش', purchase: 'خرید', sale: 'فروخت', death: 'موت', loss: 'گم/چوری', slaughter: 'ذبح', other: '' }
const TYPE_EN = { birth: 'born', purchase: 'bought', sale: 'sold', death: 'died', loss: 'lost/stolen', slaughter: 'slaughtered', other: '' }

/** Read-back of what was understood, stated before anything is saved. Assumed quantities are called out. */
function readBack(p: PendingWrite) {
  const ur = p.kind === 'herd_event'
    ? p.events.map(e => `${countUr(e.qty, e.species)} — ${TYPE_UR[e.type]}${e.qtyAssumed ? ' (تعداد نہیں بتائی، ایک مانی)' : ''}`).join('؛ ')
    : p.counts.map(c => `${countUr(c.count, c.species)} — آج کی پوری گنتی`).join('؛ ')
  const en = p.kind === 'herd_event'
    ? p.events.map(e => `${e.qty} ${SPECIES_EN[e.species].toLowerCase()} ${TYPE_EN[e.type]}${e.qtyAssumed ? ' (no number said; assumed 1)' : ''}`).join('; ')
    : p.counts.map(c => `${c.count} ${SPECIES_EN[c.species].toLowerCase()} — today's full count`).join('; ')
  return { ur: `میں نے یہ سمجھا: ${ur}۔ کیا یہ درست ہے؟ تصدیق کے بغیر کچھ درج نہیں ہو گا۔`, en: `I understood: ${en}. Is that right? Nothing is saved until you confirm.` }
}

/** The herder confirmed the read-back: write it. */
export async function commitPending(p: PendingWrite): Promise<Answer> {
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
  const h = d.getHours(), part = h < 12 ? 'صبح' : h < 16 ? 'دوپہر' : h < 19 ? 'شام' : 'رات'
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

export async function answer(text: string): Promise<Answer> {
  const places = await db.places.toArray()
  const intent = parse(text, now(), places.map(p => p.name))
  const A = (ur: string, en: string, map?: MapFocus, ok = true): Answer => ({ ur, en, map, ok, intent: intent.kind })
  const f = lastFix()

  switch (intent.kind) {
    case 'save_place': return savePlace(intent.name, intent.placeType, f)
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
      const place = places.find(p => intent.text.includes(p.name))
      await db.reminders.add({ text: intent.text, dueAt: intent.dueAt, status: 'pending', source: 'user', createdAt: now(), placeId: place?.id,
        kind: /گنتی|count|گن/.test(intent.text) ? 'herd_count' : undefined })
      return A(`یاد دہانی لگا دی: ${dueUr(intent.dueAt)} — "${intent.text}"`, `Reminder set for ${dueEn(intent.dueAt)}: "${intent.text}"`)
    }
    case 'herd_confirm':
    case 'herd_event': {
      const pending: PendingWrite = intent.kind === 'herd_event'
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
