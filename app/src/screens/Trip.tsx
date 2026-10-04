/** Trip screen: live map, recording status, the voice bar, and the big trip actions (name a place, way back, end). */
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { DIR_UR, bearingDeg, compass, distanceM, fmtKm } from '../core/geo'
import { isAtHome, spanEn, spanUr } from '../core/trail'
import { db, getHome } from '../data/db'
import { type Answer, answer } from '../services/answer'
import { now } from '../services/clock'
import { activeTrip, canHoldScreen, currentFixState, endTrip, isSimulated, simSet, simState, tripStats } from '../services/gps'
import { speak } from '../services/speech'
import { MapView } from '../ui/MapView'
import { VoiceAsk } from '../ui/VoiceAsk'
import { I, Lab, T } from '../ui/common'
import { FEATURE_OF, ICON, type Screen } from '../ui/constants'
import { useFix, useTick } from '../ui/hooks'
import { NamePlace } from '../ui/modals'

/** Trip screen shown while a trip is recording. */
export function TripScreen({ go, onEnded }: { go: (s: Screen) => void; onEnded: (id: number) => void }) {
  useTick(1000)
  const fix = useFix()
  const tid = activeTrip()
  const trip = useLiveQuery(() => tid ? db.trips.get(tid) : undefined, [tid])
  const stats = useLiveQuery(() => tid ? tripStats(tid) : undefined, [tid, fix?.t && Math.floor(fix.t / 5000)])
  const home = useLiveQuery(getHome)
  const [naming, setNaming] = useState(false)
  const [focus, setFocus] = useState<Answer['map']>()
  const [msg, setMsg] = useState<Answer>()
  if (!tid) return <div className="pad"><T ur="کوئی سفر جاری نہیں۔" en="No active trip." big /><button className="big-btn" onClick={() => go('home')}>OK</button></div>
  const hd = home && fix ? distanceM(fix, home) : undefined
  const mins = trip ? Math.floor((now() - trip.startedAt) / 60000) : 0
  const sim = simState()
  const gaps = stats?.trail.gaps.length ?? 0
  const hold = canHoldScreen()
  return (
    <div className="trip-screen">
      <MapView focus={focus} className="map trip-map" />
      <GpsBanner />
      <p className={`screen-note ${hold ? '' : 'strong'}`}><Lab ic={hold ? '📱' : '⚠️'} ur={hold ? 'CHOTA کھلا رکھیں — اسکرین بند ہو تو راستہ ریکارڈ نہیں ہوتا' : 'یہ فون اسکرین جاگتی نہیں رکھ سکتا: اسکرین بند ہوتے ہی راستہ ریکارڈ ہونا رک جائے گا۔'}
        en={hold ? 'Keep CHOTA open — no trail is recorded with the screen off' : 'This phone cannot keep the screen on: recording stops when the screen turns off.'} /></p>
      <div className="stats">
        <div><I c="⏱" /><b dir="ltr">{Math.floor(mins / 60)}:{String(mins % 60).padStart(2, '0')}</b><T ur="وقت" en="time" /></div>
        <div className={gaps ? 'gappy' : ''}><I c={ICON.trip} /><b dir="ltr">{fmtKm(stats?.distanceM ?? 0)}</b><T ur={gaps ? `ریکارڈ · ${gaps} وقفے` : 'ریکارڈ شدہ'} en={gaps ? `recorded · ${gaps} gap${gaps > 1 ? 's' : ''}` : 'recorded'} /></div>
        <div><I c={ICON.home} />{hd !== undefined && isAtHome(hd, fix!.acc)
          ? <><b>✓</b><T ur="گھر پر" en="at home" /></>
          : <><b dir="ltr">{hd !== undefined ? fmtKm(hd) : '—'}</b><T ur={`گھر ${hd !== undefined ? DIR_UR[compass(bearingDeg(fix!, home!))] : ''}`} en="to home" /></>}</div>
      </div>
      {/* Stable layout: the big buttons never move. Anything that appears (answers) appears below them. */}
      <div className="trip-actions">
        <button className="big-btn place" onClick={() => setNaming(true)}><span className="ic">{ICON.place}</span><T ur="یہ جگہ یاد رکھو" en="Remember this place" /></button>
        <button className="big-btn back" onClick={async () => { const a = await answer('wapas ka rasta dikhao'); setMsg(a); setFocus({ ...a.map, wayBack: true }); speak(a.ur) }}>
          <span className="ic">{ICON.home}</span><T ur="واپسی کا راستہ" en="Way back" /></button>
        <button className="big-btn end" onClick={async () => { const id = await endTrip(); if (id) onEnded(id) }}><I c="⏹" /><T ur="سفر ختم کریں" en="End trip" /></button>
      </div>
      <div className="trip-voice"><VoiceAsk onAction={a => { if ('rate' in a) onEnded(a.rate) }} onMap={m => { if (m) setFocus(m) }} /></div>
      {msg && <div className={`answer small f-${FEATURE_OF[msg.intent] ?? 'none'}`}><T ur={msg.ur} en={msg.en} emph /></div>}
      {isSimulated() && (
        <div className="sim">
          <span>DEMO walk</span>
          <button onClick={() => simSet({ paused: !sim.paused })}>{sim.paused ? '▶︎' : '⏸'}</button>
          {[15, 60, 200].map(s => <button key={s} className={sim.speed === s ? 'on' : ''} onClick={() => simSet({ speed: s })}>{s} m/s</button>)}
          <span>{Math.round(sim.progress * 100)}%</span>
        </div>
      )}
      {naming && <NamePlace onClose={a => { setNaming(false); if (a) { setMsg(a); setFocus(a.map); speak(a.ur) } }} />}
    </div>
  )
}

/** While a trip is running: a green "recording" line when it is, and a loud amber line saying plainly when it is NOT, and why. */
export function GpsBanner() {
  const fix = useFix()
  const fs = currentFixState()
  if (fs.state === 'ok') return <div className="rec-line ok"><span className="recdot" /><T ur="راستہ ریکارڈ ہو رہا ہے" en="Recording the trail" /></div>
  const [ur, en] = fs.state === 'none' ? ['GPS ابھی نہیں ملا — راستہ ریکارڈ نہیں ہو رہا', 'No GPS yet — the trail is not being recorded']
    : fs.state === 'stale' ? [`آخری GPS ${spanUr(fs.ageMs)} پہلے — راستہ ریکارڈ نہیں ہو رہا`, `Last GPS ${spanEn(fs.ageMs)} ago — the trail is not being recorded`]
    : [`GPS کمزور (±${Math.round(fix?.acc ?? 0)} میٹر) — یہ حصہ ریکارڈ نہیں ہو رہا`, `Weak GPS (±${Math.round(fix?.acc ?? 0)} m) — this part is not being recorded`]
  return <div className="warn-line gps"><Lab ic="⚠️" ur={ur} en={en} /></div>
}
