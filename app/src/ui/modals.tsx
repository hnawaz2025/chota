/** Modal dialogs: forgotten trip, name a place, grazing rating, count on return, and a fired reminder. */
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { DIR_UR, distanceM, fmtKm, fmtKmUr } from '../core/geo'
import { placeTypeOf } from '../core/nlu'
import { fixState, spanEn, spanUr } from '../core/trail'
import { PLACE_TAGS, type PlaceType, type Rating, type Reminder, type Species, db, getHome } from '../data/db'
import { type Answer, agoUr, savePlace } from '../services/answer'
import { now } from '../services/clock'
import { type OpenTrip, endTrip, isSimulated, lastFix, resumeTrip, simSet, simState } from '../services/gps'
import { SPECIES_EN, SPECIES_UR, confirmCount, herdStatus, trackedSpecies } from '../services/herd'
import { LISTEN_ERROR, canListen, listen, speak, stopListening } from '../services/speech'
import { I, Lab, Modal, T } from './common'
import { ICON, SPECIES_IC, type Screen } from './constants'

/** On launch: a trip left open from earlier. Never silently extend it to "now". */
export function ForgottenTrip({ o, onDone }: { o: OpenTrip; onDone: (endedId?: number) => void }) {
  const last = o.lastPointT
  return (
    <Modal onClose={() => { /* must choose */ }}>
      <span className="emoji">{ICON.trip}❓</span>
      <T ur={`ایک سفر ${agoUr(o.startedAt)} (${spanUr(now() - o.startedAt)} پہلے) شروع ہوا تھا اور ابھی تک کھلا ہے۔`} en={`A trip started ${spanEn(now() - o.startedAt)} ago is still open.`} big emph />
      <p className="spot bad"><T ur={last ? `آخری ریکارڈ شدہ جگہ ${spanUr(now() - last)} پہلے کی ہے۔ اس کے بعد کچھ ریکارڈ نہیں ہوا۔` : 'اس سفر میں کوئی جگہ ریکارڈ نہیں ہوئی۔'}
        en={last ? `The last recorded point was ${spanEn(now() - last)} ago. Nothing was recorded after that.` : 'No point was recorded on this trip.'} emph /></p>
      <button className="big-btn end" onClick={async () => onDone(await endTrip(last ?? o.startedAt))}><I c="⏹" /><T ur="آخری ریکارڈ شدہ جگہ پر ختم کریں" en="End it at the last recorded point" /></button>
      <button className="big-btn secondary" onClick={() => { resumeTrip(); onDone() }}><I c="▶︎" /><T ur="میں ابھی اسی سفر پر ہوں" en="I am still on this trip" /></button>
      <p className="muted note"><T ur="جاری رکھنے پر درمیان کا وقفہ ریکارڈ میں وقفہ ہی رہے گا۔" en="If you continue, the silence stays in the record as a gap." /></p>
    </Modal>
  )
}

/**
 * Name the spot where the herder tapped. The position is frozen at the tap, so walking on while typing or speaking
 * does not move the saved place. The demo walk pauses while this is open (a real herder may keep walking).
 */
export function NamePlace({ onClose }: { onClose: (a?: Answer) => void }) {
  const [spot] = useState(() => ({ fix: lastFix(), at: now() }))
  const home = useLiveQuery(getHome)
  const [name, setName] = useState('')
  const [type, setType] = useState<PlaceType>()   // undefined until tapped: suggested from the words in the name
  const [listening, setListening] = useState(false)
  const [micErr, setMicErr] = useState<[string, string]>()
  useEffect(() => {
    const wasWalking = isSimulated() && !simState().paused
    if (wasWalking) simSet({ paused: true })
    return () => { stopListening(true); if (wasWalking) simSet({ paused: false }) }
  }, [])
  const tag = type ?? placeTypeOf(name) ?? 'other'
  const tagInfo = PLACE_TAGS.find(t => t.type === tag)!
  const fs = fixState(spot.fix, spot.at)
  const mic = () => {
    if (listening) { stopListening(); setListening(false); return }   // button off now; words heard so far are used
    setMicErr(undefined)
    if (listen(t => setName(t), e => { setListening(false); if (e) setMicErr(LISTEN_ERROR[e]) }, t => setName(t))) setListening(true)
  }
  const save = async () => {
    const n = name.trim() || (type ? tagInfo.ur : '')
    if (n) onClose(await savePlace(n, tag, spot.fix, spot.at))
  }
  const where = spot.fix && home ? distanceM(spot.fix, home) : undefined
  const bad = fs.state === 'none' || fs.state === 'stale'
  return (
    <Modal onClose={() => onClose()}>
      <Lab ic={ICON.place} ur="اس جگہ کا نام؟" en="Name this place" big />
      <p className={`spot ${bad || fs.state === 'poor' ? 'bad' : 'ok'}`}><Lab ic={bad ? '⚠️' : '✓'}
        ur={fs.state === 'none' ? 'ابھی GPS نہیں ملا' : fs.state === 'stale' ? 'GPS پرانا ہے — جگہ محفوظ نہیں ہو گی' : `جگہ نوٹ کر لی${where !== undefined ? ` · گھر سے ${fmtKmUr(where)}` : ''}${fs.state === 'poor' ? ` · GPS کمزور ±${Math.round(spot.fix!.acc)} میٹر` : ''}`}
        en={fs.state === 'none' ? 'No GPS fix yet' : fs.state === 'stale' ? 'GPS is stale — the place will not be saved' : `Spot captured${where !== undefined ? ` · ${fmtKm(where)} from home` : ''}${isSimulated() ? ' · demo walk paused' : ''}`} emph /></p>
      <div className="askbar">
        <input autoFocus dir="auto" value={name} onChange={e => setName(e.target.value)} placeholder="پرانا چارہ" onKeyDown={e => e.key === 'Enter' && save()} aria-label="Place name" />
        {canListen() && <button className={listening ? 'mic on' : 'mic'} aria-label="Speak the name" onClick={mic}>{listening ? '■' : '🎤'}</button>}
      </div>
      {listening && <p className="hint listening"><Lab ic="🔴" ur="سن رہا ہوں… جگہ کا نام بولیں" en="Listening… say the name" /></p>}
      {micErr && <div className="warn-line"><Lab ic="🎤" ur={micErr[0]} en={micErr[1]} /></div>}
      <div className="chips tags">{PLACE_TAGS.map(t => (
        <button key={t.type} className={tag === t.type ? 'on' : ''} aria-pressed={tag === t.type} onClick={() => setType(t.type)}>
          <span className="tag-icon">{t.icon}</span><T ur={t.ur} en={t.en} /></button>))}</div>
      <button className="big-btn place" disabled={!name.trim() && !type} onClick={save}><I c="✓" /><T ur="محفوظ کریں" en="Save" /></button>
    </Modal>
  )
}

/** After a trip: how was the grazing (good / okay / poor / skip). */
export function RateTrip({ id, onDone }: { id: number; onDone: () => void }) {
  const t = useLiveQuery(() => db.trips.get(id), [id])
  useEffect(() => { speak('آج چارہ کیسا تھا؟') }, [])
  const rate = async (r: Rating | null) => { await db.trips.update(id, { rating: r }); onDone() }
  return (
    <Modal onClose={() => rate(null)}>
      <Lab ic="✓" ur="سفر محفوظ ہو گیا" en="Trip saved" />
      {t && <p className="muted note"><T ur={`${fmtKmUr(t.distanceM ?? 0)} ریکارڈ · گھر سے زیادہ سے زیادہ ${fmtKmUr(t.furthestFromHomeM ?? 0)}${t.direction ? ` · ${DIR_UR[t.direction as keyof typeof DIR_UR]}` : ''}`}
        en={`${fmtKm(t.distanceM ?? 0)} recorded · max ${fmtKm(t.furthestFromHomeM ?? 0)} from home${t.direction ? ` · ${t.direction}` : ''}`} emph /></p>}
      {t?.gapCount ? <p className="warn-line"><Lab ic="⚠️" ur={`${t.gapCount} حصے (${spanUr(t.gapMs ?? 0)}) ریکارڈ نہیں ہوئے`} en={`${t.gapCount} part(s) (${spanEn(t.gapMs ?? 0)}) were not recorded`} /></p> : null}
      <Lab ic="🌿" ur="آج چارہ کیسا تھا؟" en="How was the grazing today?" big />
      <div className="rate big3">
        <button className="good" onClick={() => rate('good')}><I c="🟢" /><T ur="اچھا" en="Good" big /></button>
        <button className="okay" onClick={() => rate('okay')}><I c="🟡" /><T ur="ٹھیک" en="Okay" big /></button>
        <button className="poor" onClick={() => rate('poor')}><I c="🔴" /><T ur="کمزور" en="Poor" big /></button>
      </div>
      <button className="link skip" onClick={() => rate(null)}><T ur="چھوڑیں" en="Skip" /></button>
    </Modal>
  )
}

/**
 * Back from a trip: count what came home. Boxes start empty (never prefilled with the estimate, which would invite
 * "yes, 49" without counting). A difference from the estimate is shown and asked about, never explained away.
 */
export function ReturnCount({ tripId, go, onDone }: { tripId: number; go: (s: Screen) => void; onDone: () => void }) {
  const herd = useLiveQuery(async () => Promise.all((await trackedSpecies()).map(herdStatus)), [])
  const [vals, setVals] = useState<Partial<Record<Species, string>>>({})
  const [res, setRes] = useState<{ sp: Species; n: number; exp?: number }[]>()
  useEffect(() => { if (herd && herd.length === 0) onDone() }, [herd, onDone])   // nothing tracked yet: nothing to reconcile
  if (!herd || herd.length === 0) return null
  const save = async () => {
    const out: { sp: Species; n: number; exp?: number }[] = []
    for (const h of herd) {
      const v = parseInt(vals[h.species] ?? ''); if (!(v >= 0)) continue
      await confirmCount(h.species, v, 'reconcile', { tripId, expected: h.estimate })
      out.push({ sp: h.species, n: v, exp: h.estimate })
    }
    if (out.length) setRes(out)
  }
  if (res) {
    const off = res.filter(r => r.exp !== undefined && r.exp !== r.n)
    return (
      <Modal onClose={onDone}>
        <Lab ic={off.length ? '⚠️' : '✓'} ur={off.length ? 'گنتی اندازے سے مختلف ہے' : 'سب جانور واپس — گنتی اندازے کے مطابق'} en={off.length ? 'The count differs from the estimate' : 'All back — count matches the estimate'} big />
        {res.map(r => (
          <p key={r.sp} className={`spot ${r.exp !== undefined && r.exp !== r.n ? 'bad' : 'ok'}`}><Lab ic={SPECIES_IC[r.sp]}
            ur={r.exp === undefined ? `${SPECIES_UR[r.sp]}: ${r.n} — پہلی تصدیق شدہ گنتی` : r.exp === r.n ? `${SPECIES_UR[r.sp]}: ${r.n} ✓` : `${SPECIES_UR[r.sp]}: گنتی ${r.n}، اندازہ ${r.exp} — ${Math.abs(r.n - r.exp)} ${r.n < r.exp ? 'کم' : 'زیادہ'}`}
            en={r.exp === undefined ? `${SPECIES_EN[r.sp]}: ${r.n} — first confirmed count` : r.exp === r.n ? `${SPECIES_EN[r.sp]}: ${r.n} ✓` : `${SPECIES_EN[r.sp]}: counted ${r.n}, estimate ${r.exp} — ${Math.abs(r.n - r.exp)} ${r.n < r.exp ? 'fewer' : 'more'}`} emph /></p>))}
        {off.length > 0 && <p className="muted note"><T ur="CHOTA اندازہ نہیں لگاتا کہ کیا ہوا۔ کوئی جانور پیچھے رہ گیا، بیچا یا گم ہوا؟ معلوم ہو تو ریوڑ کے صفحے پر درج کریں۔ نئی گنتی اب درست مانی جائے گی۔"
          en="CHOTA does not guess what happened. Was an animal left behind, sold or lost? If you know, record it on the Herd screen. The new count is now the confirmed one." /></p>}
        {off.length > 0 && <button className="big-btn" onClick={() => { onDone(); go('herd') }}><I c={ICON.herd} /><T ur="ریوڑ کا صفحہ کھولیں" en="Open Herd" /></button>}
        <button className={off.length ? 'big-btn secondary' : 'big-btn'} onClick={onDone}><I c="✓" /><T ur="ٹھیک ہے" en="OK" /></button>
      </Modal>)
  }
  return (
    <Modal onClose={onDone}>
      <Lab ic="🏠" ur="واپس آ گئے — ریوڑ گن لیں؟" en="Back home — count the herd?" big />
      <p className="muted note"><T ur="جتنے جانور واپس آئے، گن کر لکھیں" en="Count what came home and enter it" /></p>
      {herd.map(h => (
        <label key={h.species} className="count-row" dir="rtl">
          <span className="ic">{SPECIES_IC[h.species]}</span><T ur={SPECIES_UR[h.species]} en={SPECIES_EN[h.species]} />
          <input className="num" inputMode="numeric" value={vals[h.species] ?? ''} placeholder={h.estimate !== undefined ? `≈${h.estimate}` : '?'}
            aria-label={`${SPECIES_EN[h.species]} count`} onChange={e => setVals(v => ({ ...v, [h.species]: e.target.value.replace(/\D/g, '') }))} />
        </label>))}
      <button className="big-btn ok" disabled={!Object.values(vals).some(v => v)} onClick={save}><I c="✓" /><T ur="گنتی محفوظ کریں" en="Save count" /></button>
      <button className="link skip" onClick={onDone}><T ur="بعد میں" en="Later" /></button>
    </Modal>
  )
}

/** A reminder that just fired; says if it is late. */
export function FiredReminder({ r, onClose, go }: { r: Reminder; onClose: () => void; go: (s: Screen) => void }) {
  const isHerd = r.kind?.startsWith('herd')
  const lateMs = (r.firedAt ?? now()) - r.dueAt
  return (
    <Modal onClose={onClose}>
      <span className="emoji">{r.trigger ? `${ICON.trip}${ICON.rem}` : isHerd ? `${ICON.rem}${ICON.herd}` : ICON.rem}</span>
      {r.trigger && <Lab ic="🏁" ur="سفر ختم — واپسی کی یاد دہانی" en="Trip ended — your on-the-way-back reminder" />}
      <div className="ur big" dir="auto">{r.text}</div>
      {r.source === 'user' && lateMs > LATE_MS && <p className="warn-line"><Lab ic="⏰" ur={`یہ ${spanUr(lateMs)} دیر سے دکھائی جا رہی ہے — وقت پر ایپ بند تھی۔`} en={`Shown ${spanEn(lateMs)} late — the app was closed when it was due.`} /></p>}
      {isHerd && <button className="big-btn herdc" onClick={() => { db.reminders.update(r.id!, { status: 'done' }); onClose(); go('herd') }}><I c="🔢" /><T ur="ابھی گنتی کریں" en="Count now" /></button>}
      <div className="rate">
        <button className="good" onClick={() => { db.reminders.update(r.id!, { status: 'done' }); onClose() }}><I c="✓" /><T ur="ٹھیک ہے" en="OK" /></button>
        <button onClick={() => { db.reminders.update(r.id!, { status: 'pending', dueAt: now() + 3600000, trigger: undefined }); onClose() }}><I c="⏰" /><T ur="بعد میں" en="Later" /></button>
      </div>
    </Modal>
  )
}

/** Reminders only fire while CHOTA is open; past this, say it is late instead of pretending it is on time. */
const LATE_MS = 10 * 60000
