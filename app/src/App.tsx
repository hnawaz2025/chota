import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getHome, setHome, PLACE_TAGS, placeIcon, type Species, type HerdEventType, type Rating, type Reminder, type PlaceType } from './db'
import { now, shiftDays, clockOffsetDays } from './clock'
import { lastFix, onFix, startPositioning, startTrip, endTrip, activeTrip, isSimulated, setSimulated, simSet, simState, tripStats, currentFixState, checkOpenTrip, resumeTrip, canHoldScreen, type Fix, type OpenTrip } from './gps'
import { spanUr, spanEn, fixState } from './trail'
import { distanceM, bearingDeg, compass, DIR_UR, fmtKm, fmtKmUr } from './geo'
import { answer, commitPending, rejectPending, savePlace, agoUr, agoEn, dueUr, dueEn, type Answer, type MapFocus, type UiAction, type PendingWrite } from './answer'
import { herdStatus, trackedSpecies, confirmCount, SPECIES_UR, SPECIES_UR_OBL, SPECIES_EN, type HerdStatus } from './herd'
import { signOf, placeTypeOf } from './nlu'
import { checkReminders, requestNotifications } from './reminders'
import { speak, canListen, listen, stopListening, hasUrduVoice, LISTEN_ERROR } from './speech'
import { loadDemo, clearAll } from './demo'
import { MapView } from './MapView'

type Screen = 'home' | 'trip' | 'reminders' | 'herd' | 'map' | 'history' | 'settings'
const lsGet = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } }

/**
 * One icon + one colour per feature, used on tiles, buttons, answers and cards alike, so a herder who does not read
 * can still tell "this is about my herd" from "this is about the way home". Colours live in index.css (--trip, --herd…).
 */
type Feature = 'trip' | 'place' | 'home' | 'herd' | 'rem'
const ICON: Record<Feature, string> = { trip: '👣', place: '📍', home: '🏠', herd: '🐐', rem: '🔔' }
const SPECIES_IC: Record<Species, string> = { goat: '🐐', sheep: '🐑', camel: '🐪', cattle: '🐄' }
/** Which feature an answer belongs to (drives its icon and border colour). */
const FEATURE_OF: Record<string, Feature> = {
  start_trip: 'trip', end_trip: 'trip', good_grazing: 'trip', last_trip_dir: 'trip', trips_this_month: 'trip', last_trip_duration: 'trip', been_here: 'trip',
  save_place: 'place', place_distance: 'place', home_distance: 'home', way_back: 'home',
  reminder: 'rem', reminders_list: 'rem', herd_confirm: 'herd', herd_event: 'herd', herd_status: 'herd',
}

/** Numbers carry the meaning for herders who read digits better than words: make them bigger and bolder. */
function Emph({ s }: { s: string }) {
  const parts = s.split(/(\d+(?:\.\d+)?)/)
  return <>{parts.map((p, i) => i % 2 ? <b key={i} className="n">{p}</b> : p)}</>
}

/** Urdu line with optional English subtitle. */
function T({ ur, en, big, emph }: { ur: string; en?: string; big?: boolean; emph?: boolean }) {
  const showEn = lsGet('chota.en') !== '0'
  return <span className={big ? 'tx big' : 'tx'}><span className="ur" dir="rtl">{emph ? <Emph s={ur} /> : ur}</span>{showEn && en && <span className="en">{en}</span>}</span>
}

/** An icon in its own box (never inline-touching text). */
function I({ c }: { c: string }) { return <span className="ic" aria-hidden="true">{c}</span> }
/** Icon + label row, RTL: the icon sits at the start with a fixed gap. */
function Lab({ ic, ...t }: { ic: string; ur: string; en?: string; big?: boolean; emph?: boolean }) {
  return <span className="lab" dir="rtl"><I c={ic} /><T {...t} /></span>
}

function useFix() { const [f, setF] = useState<Fix>(); useEffect(() => onFix(setF), []); return f }
function useTick(ms = 1000) { const [, s] = useState(0); useEffect(() => { const i = setInterval(() => s(x => x + 1), ms); return () => clearInterval(i) }, [ms]) }

export default function App() {
  const [screen, setScreen] = useState<Screen>(activeTrip() ? 'trip' : 'home')
  const [fired, setFired] = useState<Reminder[]>([])
  const [rateTrip, setRateTrip] = useState<number>()
  const [openTrip, setOpenTrip] = useState<OpenTrip>()
  // Check for a forgotten trip before any new fix can be appended to it.
  useEffect(() => { checkOpenTrip().then(o => { setOpenTrip(o); startPositioning() }) }, [])
  useEffect(() => {
    const run = async () => { const due = await checkReminders(); if (due.length) { setFired(f => [...f, ...due]); speak(due[0].text) } }
    run(); const i = setInterval(run, 15000); return () => clearInterval(i)
  }, [])
  const go = (s: Screen) => { setScreen(s); window.scrollTo(0, 0) }

  return (
    <div className="app">
      <Header onHome={() => go('home')} screen={screen} />
      <main>
        {screen === 'home' && <Home go={go} onRate={setRateTrip} />}
        {screen === 'trip' && <TripScreen go={go} onEnded={id => { setRateTrip(id); go('home') }} />}
        {screen === 'reminders' && <Reminders />}
        {screen === 'herd' && <Herd />}
        {screen === 'map' && <MapScreen />}
        {screen === 'history' && <History />}
        {screen === 'settings' && <Settings />}
      </main>
      {openTrip && <ForgottenTrip o={openTrip} onDone={ended => { setOpenTrip(undefined); if (ended) { setRateTrip(ended); go('home') } else go('trip') }} />}
      {rateTrip && <RateTrip id={rateTrip} onDone={() => setRateTrip(undefined)} />}
      {/* One modal at a time: resolving the open trip / rating comes first, reminders wait their turn. */}
      {!openTrip && !rateTrip && fired.length > 0 && <FiredReminder r={fired[0]} onClose={() => setFired(f => f.slice(1))} go={go} />}
    </div>
  )
}

/** RTL header: back sits top-right where Urdu readers look first; demo badges (simulated data) always visible. */
function Header({ onHome, screen }: { onHome: () => void; screen: Screen }) {
  const off = clockOffsetDays()
  return (
    <header dir="rtl">
      {screen !== 'home' ? <button className="back" onClick={onHome} aria-label="Home">→</button> : null}
      <div className="brand" onClick={onHome}><b>چھوٹا</b><small dir="ltr">CHOTA</small></div>
      <div className="badges" dir="ltr">
        {isSimulated() && <span className="badge demo">DEMO GPS</span>}
        {off > 0 && <span className="badge demo">+{off}d</span>}
        <span className="badge off">{navigator.onLine ? 'online' : 'offline ✓'}</span>
      </div>
    </header>
  )
}

// ---------------- Home ----------------
function Home({ go, onRate }: { go: (s: Screen) => void; onRate: (tripId: number) => void }) {
  useTick(5000)
  const fix = useFix()
  const home = useLiveQuery(getHome)
  const pending = useLiveQuery(() => db.reminders.where('status').anyOf('pending', 'fired').count()) ?? 0
  const herd = useLiveQuery(async () => Promise.all((await trackedSpecies()).map(herdStatus)), [])
  const stale = herd?.filter(h => h.status === 'stale' || h.status === 'none') ?? []
  const tid = activeTrip()
  const hd = home && fix ? distanceM(fix, home) : undefined
  const fs = currentFixState()
  const isStale = fs.state === 'stale'
  return (
    <div className="home">
      {home ? (hd !== undefined && (
        // Solid = current position; dashed + "last GPS …" = last known, not current.
        <div className={`homechip strip ${isStale ? 'stale' : ''}`} dir="rtl">
          <span className="ic">🏠</span>
          <span className="num" dir="ltr">{fmtKm(hd)}</span>
          <T ur={DIR_UR[compass(bearingDeg(fix!, home))]} en={`Home · ${compass(bearingDeg(fix!, home))}`} />
          {isStale && <span className="last"><T ur={`آخری GPS ${spanUr(fs.ageMs)} پہلے`} en={`last GPS ${spanEn(fs.ageMs)} ago`} /></span>}
        </div>))
        : <button className="sethome strip" onClick={() => go('settings')}><span className="ic">🏠</span><T ur="پہلے اپنا گھر محفوظ کریں" en="Set your home first" /></button>}
      {stale.map(s => (
        <button key={s.species} className="warn" dir="rtl" onClick={() => go('herd')}>
          <span className="ic">⚠️</span><span className="ic">{SPECIES_IC[s.species]}</span>
          {s.status === 'none'
            ? <T ur={`${SPECIES_UR[s.species]}: تبدیلیاں درج ہیں، گنتی کبھی تصدیق نہیں ہوئی`} en={`${SPECIES_EN[s.species]}: changes recorded but never counted`} />
            : <T ur={`${SPECIES_UR_OBL[s.species]} کی گنتی ${s.daysSinceConfirmed} دن سے تصدیق نہیں ہوئی`} en={`${SPECIES_EN[s.species]} not recounted for ${s.daysSinceConfirmed} days`} emph />}
          <span className="go-arrow">‹</span>
        </button>
      ))}
      <VoiceAsk big onAction={a => 'go' in a ? go(a.go) : onRate(a.rate)} />
      <div className="grid3">
        <button className={`tile trip ${tid ? 'active' : ''}`} onClick={async () => { if (!tid) await startTrip(); go('trip') }}>
          {tid ? <><span className="emoji">{ICON.trip}</span><T ur="سفر جاری ہے" en="Trip in progress" /><i className="count" aria-label="recording"><span className="recdot" /></i></>
            : <><span className="emoji">{ICON.trip}</span><T ur="سفر شروع کریں" en="Start Trip" /></>}
        </button>
        <button className="tile herd" onClick={() => go('herd')}><span className="emoji">{ICON.herd}</span><T ur="ریوڑ کی گنتی" en="Herd Count" />{stale.length > 0 && <i className="count">!</i>}</button>
        <button className="tile rem" onClick={() => go('reminders')}><span className="emoji">{ICON.rem}</span><T ur="یاد دہانیاں" en="Reminders" />{pending > 0 && <i className="count">{pending}</i>}</button>
      </div>
      <div className="row3">
        <button onClick={() => go('map')}><span className="ic">🗺️</span><T ur="نقشہ و جگہیں" en="Map & Places" /></button>
        <button onClick={() => go('history')}><span className="ic">🕓</span><T ur="پرانے سفر" en="Trip History" /></button>
        <button onClick={() => go('settings')}><span className="ic">⚙️</span><T ur="سیٹنگز" en="Settings" /></button>
      </div>
    </div>
  )
}

// ---------------- Trip ----------------
function TripScreen({ go, onEnded }: { go: (s: Screen) => void; onEnded: (id: number) => void }) {
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
        <div><I c={ICON.home} /><b dir="ltr">{hd !== undefined ? fmtKm(hd) : '—'}</b><T ur={`گھر ${hd !== undefined ? DIR_UR[compass(bearingDeg(fix!, home!))] : ''}`} en="to home" /></div>
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
function GpsBanner() {
  const fix = useFix()
  const fs = currentFixState()
  if (fs.state === 'ok') return <div className="rec-line ok"><span className="recdot" /><T ur="راستہ ریکارڈ ہو رہا ہے" en="Recording the trail" /></div>
  const [ur, en] = fs.state === 'none' ? ['GPS ابھی نہیں ملا — راستہ ریکارڈ نہیں ہو رہا', 'No GPS yet — the trail is not being recorded']
    : fs.state === 'stale' ? [`آخری GPS ${spanUr(fs.ageMs)} پہلے — راستہ ریکارڈ نہیں ہو رہا`, `Last GPS ${spanEn(fs.ageMs)} ago — the trail is not being recorded`]
    : [`GPS کمزور (±${Math.round(fix?.acc ?? 0)} میٹر) — یہ حصہ ریکارڈ نہیں ہو رہا`, `Weak GPS (±${Math.round(fix?.acc ?? 0)} m) — this part is not being recorded`]
  return <div className="warn-line gps"><Lab ic="⚠️" ur={ur} en={en} /></div>
}

/** On launch: a trip left open from earlier. Never silently extend it to "now". */
function ForgottenTrip({ o, onDone }: { o: OpenTrip; onDone: (endedId?: number) => void }) {
  const last = o.lastPointT
  return (
    <Modal onClose={() => { /* must choose */ }}>
      <span className="emoji">{ICON.trip}❓</span>
      <T ur={`ایک سفر ${agoUr(o.startedAt)} (${spanUr(now() - o.startedAt)} پہلے) شروع ہوا تھا اور ابھی تک کھلا ہے۔`} en={`A trip started ${spanEn(now() - o.startedAt)} ago is still open.`} big emph />
      <p className="spot bad"><T ur={last ? `آخری ریکارڈ شدہ جگہ ${spanUr(now() - last)} پہلے کی ہے۔ اس کے بعد کچھ ریکارڈ نہیں ہوا۔` : 'اس سفر میں کوئی جگہ ریکارڈ نہیں ہوئی۔'}
        en={last ? `The last recorded point was ${spanEn(now() - last)} ago. Nothing was recorded after that.` : 'No point was recorded on this trip.'} emph /></p>
      <button className="big-btn end" onClick={async () => onDone(await endTrip(last ?? o.startedAt))}><I c="⏹" /><T ur="آخری ریکارڈ شدہ جگہ پر ختم کریں" en="End it at the last recorded point" /></button>
      <button className="big-btn ok" onClick={() => { resumeTrip(); onDone() }}><I c="▶︎" /><T ur="میں ابھی اسی سفر پر ہوں" en="I am still on this trip" /></button>
      <p className="muted note"><T ur="جاری رکھنے پر درمیان کا وقفہ ریکارڈ میں وقفہ ہی رہے گا۔" en="If you continue, the silence stays in the record as a gap." /></p>
    </Modal>
  )
}

/**
 * Name the spot where the herder tapped. The position is frozen at the tap, so walking on while typing or speaking
 * does not move the saved place. The demo walk pauses while this is open (a real herder may keep walking).
 */
function NamePlace({ onClose }: { onClose: (a?: Answer) => void }) {
  const [spot] = useState(() => ({ fix: lastFix(), at: now() }))
  const home = useLiveQuery(getHome)
  const [name, setName] = useState('')
  const [type, setType] = useState<PlaceType>()   // undefined until tapped: suggested from the words in the name
  const [listening, setListening] = useState(false)
  const [micErr, setMicErr] = useState<[string, string]>()
  useEffect(() => {
    const wasWalking = isSimulated() && !simState().paused
    if (wasWalking) simSet({ paused: true })
    return () => { stopListening(); if (wasWalking) simSet({ paused: false }) }
  }, [])
  const tag = type ?? placeTypeOf(name) ?? 'other'
  const tagInfo = PLACE_TAGS.find(t => t.type === tag)!
  const fs = fixState(spot.fix, spot.at)
  const mic = () => {
    if (listening) { stopListening(); return }
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

function RateTrip({ id, onDone }: { id: number; onDone: () => void }) {
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

// ---------------- Voice (home hub + trip screen) ----------------
const EXAMPLES: [string, string][] = [
  ['سفر شروع کرو', "Let's start the trip"],
  ['پچھلی بار اچھا چارہ کہاں ملا تھا؟', 'Where was good grazing last time?'],
  ['گھر کتنی دور ہے؟', 'How far is home?'],
  ['کل صبح ریوڑ کی گنتی کرنا یاد دلانا', 'Remind me to count the herd tomorrow morning'],
  ['میرے پاس 47 بکریاں ہیں', 'I have 47 goats'],
  ['دو بکریاں بیچیں', 'Sold two goats'],
  ['کتنی بکریاں ہیں؟', 'How many goats?'],
  ['میں یہاں پہلے آیا ہوں؟', 'Have I been here before?'],
]
/** ✓ writes the read-back record, ✗ writes nothing. Shared by every place that can create a pending write. */
function ConfirmRow({ p, onResult }: { p: PendingWrite; onResult: (a: Answer) => void }) {
  const lbl = CONFIRM_LABEL[p.kind] ?? CONFIRM_LABEL.default
  return (
    <div className="rate confirm">
      <button className="good" onClick={async () => onResult(await commitPending(p))}><I c="✓" /><T ur={lbl[0]} en={lbl[1]} /></button>
      <button className="poor" onClick={() => onResult(rejectPending(p))}><I c="✗" /><T ur={lbl[2]} en={lbl[3]} /></button>
    </div>)
}
const CONFIRM_LABEL: Record<string, [string, string, string, string]> = {
  end_trip: ['ہاں، ختم کریں', 'Yes, end it', 'نہیں، جاری رکھیں', 'No, keep going'],
  default: ['ہاں، درج کریں', 'Yes, save', 'نہیں، غلط ہے', 'No, wrong'],
}

/**
 * Speak (or type) anything: questions, "start the trip", reminders, herd counts. Words appear live while speaking;
 * anything that changes records the herder can't easily undo is read back and needs ✓ first.
 * big: the home-screen hub with a large mic. Otherwise a compact bar (trip screen).
 */
function VoiceAsk({ big, onAction, onMap }: { big?: boolean; onAction: (a: UiAction) => void; onMap?: (m: MapFocus | undefined) => void }) {
  const [q, setQ] = useState('')
  const [cur, setCur] = useState<{ q: string; a: Answer }>()
  const [listening, setListening] = useState(false)
  const [micErr, setMicErr] = useState<[string, string]>()
  /** Final text from the mic: shown for a moment so the herder sees what was heard, then sent. */
  const [heard, setHeard] = useState<string>()
  const [kbHint, setKbHint] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const ansRef = useRef<HTMLDivElement>(null)
  // A new answer (and its ✓/✗ when it needs confirming) is scrolled into view, so the herder never has to hunt for it.
  useEffect(() => { if (cur) ansRef.current?.scrollIntoView({ block: cur.a.pending ? 'end' : 'nearest' }) }, [cur])
  /** Offline / unsupported: the phone keyboard's own mic (Gboard Urdu voice typing) fills the same box. */
  const toKeyboardMic = () => { stopListening(); setKbHint(true); input.current?.focus() }
  useEffect(() => { if (!heard) return; const t = setTimeout(() => { ask(heard); setHeard(undefined) }, 900); return () => clearTimeout(t) }, [heard])
  useEffect(() => () => stopListening(), [])
  const show = (q: string, a: Answer) => { setCur({ q, a }); speak(a.ur); onMap?.(a.map); if (a.action) onAction(a.action) }
  const mic = () => {
    if (listening) { stopListening(); return }
    setMicErr(undefined); setKbHint(false); setQ('')
    // Browser recognition is online-only: without it, go straight to the keyboard mic (focus must happen in the tap).
    if (!canListen() || !navigator.onLine) { toKeyboardMic(); return }
    if (listen(t => { setQ(t); setHeard(t) }, e => {
      setListening(false)
      if (e === 'network' || e === 'insecure' || e === 'language-not-supported') toKeyboardMic()
      else if (e) setMicErr(LISTEN_ERROR[e])
    }, t => setQ(t))) setListening(true)
  }
  const ask = async (text: string) => { if (!text.trim()) return; const a = await answer(text); setQ(''); show(text, a) }
  const feat = cur ? FEATURE_OF[cur.a.intent] : undefined
  return (
    <div className={big ? 'voice big' : 'voice'}>
      {big && (
        // Listening is shown by colour (red), shape (■ stop + pulsing ring) and words, not by words alone.
        <button className={listening ? 'bigmic on' : 'bigmic'} aria-label="Speak to CHOTA" aria-pressed={listening} onClick={mic}>
          <span>{listening ? '■' : '🎤'}</span><T ur={listening ? 'سن رہا ہوں…' : 'بولیں'} en={listening ? 'Listening… tap to stop' : 'Tap and speak'} />
        </button>)}
      <div className="askbar">
        <input ref={input} dir="auto" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask(q)}
          placeholder={big ? 'یا یہاں لکھیں…' : 'بولیں یا لکھیں…'} aria-label="Ask Chota" />
        {!big && <button className={listening ? 'mic on' : 'mic'} aria-label="Speak" aria-pressed={listening} onClick={mic}>{listening ? '■' : '🎤'}</button>}
        <button className="go" onClick={() => ask(q)} aria-label="Send">➤</button>
      </div>
      {listening && q && <p className="hint listening"><Lab ic="🔴" ur="جو سنا وہ اوپر لکھا جا رہا ہے" en="What I hear is written above" /></p>}
      {heard && <p className="hint"><Lab ic="✓" ur="یہ سنا — جواب آ رہا ہے…" en="Got it — answering…" /></p>}
      {micErr && <div className="warn-line"><Lab ic="🎤" ur={micErr[0]} en={micErr[1]} /></div>}
      {kbHint && !q && <div className="note-line kb-hint"><Lab ic="⌨️" ur="کی بورڈ کے اوپر والے 🎤 کو دبا کر بولیں، پھر ➤ دبائیں" en="Tap the 🎤 on your keyboard and speak, then press ➤ (works offline if Urdu voice typing is downloaded)" /></div>}
      {cur && (
        <div ref={ansRef} className={`answer ${big ? '' : 'small'} ${cur.a.ok ? '' : 'muted'} ${feat ? `f-${feat}` : ''} ${cur.a.pending ? 'pending' : ''}`}>
          <div className="ahead">{feat && <span className="fic">{ICON[feat]}</span>}<I c="🎤" /><div className="q" dir="auto">“{cur.q}”</div></div>
          <T ur={cur.a.ur} en={cur.a.en} big={big} emph />
          {hasUrduVoice() && <button className="speak" onClick={() => speak(cur.a.ur)} aria-label="Speak again">🔊</button>}
          {!hasUrduVoice() && big && <p className="muted no-voice"><Lab ic="🔇" ur="اس فون پر اردو آواز نہیں، اس لیے جواب بولا نہیں گیا" en="No Urdu voice on this phone, so the answer isn't spoken aloud (see Settings)" /></p>}
          {cur.a.pending && <ConfirmRow p={cur.a.pending} onResult={a => show(cur.q, a)} />}
        </div>
      )}
      {big && cur?.a.map && <MapView focus={cur.a.map} className="map short" />}
      {big && <details className="examples-box"><summary><span className="ic">💬</span><T ur="کیا پوچھ سکتے ہیں؟ (مثالیں)" en="What can I say? (examples)" /></summary>
        <div className="chips examples">{EXAMPLES.map(([u, e]) => <button key={u} onClick={() => ask(u)}><T ur={u} en={e} /></button>)}</div></details>}
    </div>
  )
}

// ---------------- Reminders ----------------
function Reminders() {
  useTick(15000)
  const rs = useLiveQuery(() => db.reminders.where('status').anyOf('pending', 'fired').sortBy('dueAt')) ?? []
  const done = useLiveQuery(() => db.reminders.where('status').equals('done').reverse().sortBy('dueAt')) ?? []
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState<Answer>()
  const [listening, setListening] = useState(false)
  const [micErr, setMicErr] = useState<[string, string]>()
  useEffect(() => () => stopListening(), [])
  const add = async (text = q) => { if (!text.trim()) return; const a = await answer(text.includes('یاد') || /yaad|yad/.test(text) ? text : `${text} یاد دلانا`); setMsg(a); setQ('') }
  /** Same mic as naming a place: words appear in the box; the herder checks them, then taps ＋. */
  const mic = () => {
    if (listening) { stopListening(); return }
    setMicErr(undefined)
    if (listen(t => setQ(t), e => { setListening(false); if (e) setMicErr(LISTEN_ERROR[e]) }, t => setQ(t))) setListening(true)
  }
  return (
    <div className="pad">
      <div className="askbar">
        <input dir="auto" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="کل صبح ٹیوب ویل جانا ہے" aria-label="New reminder" />
        {canListen() && <button className={listening ? 'mic on' : 'mic'} aria-label="Speak the reminder" aria-pressed={listening} onClick={mic}>{listening ? '■' : '🎤'}</button>}
        <button className="go" onClick={() => add()} aria-label="Add reminder">＋</button>
      </div>
      {listening && <p className="hint listening"><Lab ic="🔴" ur="سن رہا ہوں… کب اور کیا یاد دلانا ہے؟" en="Listening… what, and when?" /></p>}
      {micErr && <div className="warn-line"><Lab ic="🎤" ur={micErr[0]} en={micErr[1]} /></div>}
      {msg && <div className="answer small f-rem"><T ur={msg.ur} en={msg.en} emph />{msg.pending && <ConfirmRow p={msg.pending} onResult={setMsg} />}</div>}
      {rs.length === 0 && <p className="muted note"><Lab ic="🔔" ur="کوئی یاد دہانی نہیں" en="No reminders" /></p>}
      {rs.map(r => (
        <div key={r.id} className={`card rem ${r.status} ${r.source}`}>
          <div className="when"><span className="ic">{r.status === 'fired' ? '🔔' : '⏰'}</span><T ur={r.status === 'fired' ? 'ابھی' : dueUr(r.dueAt)} en={r.status === 'fired' ? 'now' : dueEn(r.dueAt)} emph />{r.source === 'system' && <span className="badge">CHOTA</span>}</div>
          <div className="ur what" dir="auto">{r.text}</div>
          <div className="actions">
            <button className="done" onClick={() => db.reminders.update(r.id!, { status: 'done' })}><span className="ic">✓</span><T ur="ہو گیا" en="Done" /></button>
            <button onClick={() => db.reminders.update(r.id!, { status: 'pending', dueAt: now() + 3600000 })}><span className="ic">⏰</span><T ur="ایک گھنٹہ بعد" en="+1 hour" /></button>
          </div>
        </div>
      ))}
      {done.length > 0 && <details><summary><Lab ic="✓" ur={`مکمل (${done.length})`} en="Done" /></summary>{done.map(r => <div key={r.id} className="card done" dir="auto">✓ {r.text}</div>)}</details>}
    </div>
  )
}

function FiredReminder({ r, onClose, go }: { r: Reminder; onClose: () => void; go: (s: Screen) => void }) {
  const isHerd = r.kind?.startsWith('herd')
  const lateMs = (r.firedAt ?? now()) - r.dueAt
  return (
    <Modal onClose={onClose}>
      <span className="emoji">{isHerd ? `${ICON.rem}${ICON.herd}` : ICON.rem}</span>
      <div className="ur big" dir="auto">{r.text}</div>
      {r.source === 'user' && lateMs > LATE_MS && <p className="warn-line"><Lab ic="⏰" ur={`یہ ${spanUr(lateMs)} دیر سے دکھائی جا رہی ہے — وقت پر ایپ بند تھی۔`} en={`Shown ${spanEn(lateMs)} late — the app was closed when it was due.`} /></p>}
      {isHerd && <button className="big-btn herdc" onClick={() => { db.reminders.update(r.id!, { status: 'done' }); onClose(); go('herd') }}><I c="🔢" /><T ur="ابھی گنتی کریں" en="Count now" /></button>}
      <div className="rate">
        <button className="good" onClick={() => { db.reminders.update(r.id!, { status: 'done' }); onClose() }}><I c="✓" /><T ur="ٹھیک ہے" en="OK" /></button>
        <button onClick={() => { db.reminders.update(r.id!, { status: 'pending', dueAt: now() + 3600000 }); onClose() }}><I c="⏰" /><T ur="بعد میں" en="Later" /></button>
      </div>
    </Modal>
  )
}

/** Reminders only fire while CHOTA is open; past this, say it is late instead of pretending it is on time. */
const LATE_MS = 10 * 60000

// ---------------- Herd ----------------
const ADD_TYPES: [HerdEventType, string, string][] = [['birth', 'پیدائش', 'Birth'], ['purchase', 'خرید', 'Bought']]
const REM_TYPES: [HerdEventType, string, string][] = [['sale', 'فروخت', 'Sold'], ['death', 'موت', 'Died'], ['loss', 'گم/چوری', 'Lost'], ['slaughter', 'ذبح', 'Slaughtered']]
const EVENT_UR: Record<string, string> = Object.fromEntries([...ADD_TYPES, ...REM_TYPES].map(([t, u]) => [t, u]))
function Herd() {
  const all = useLiveQuery(async () => Promise.all((await trackedSpecies()).map(herdStatus)), []) ?? []
  const [counting, setCounting] = useState<Species | 'new'>()
  const [eventFor, setEventFor] = useState<Species>()
  return (
    <div className="pad">
      {all.length === 0 && <div className="card"><Lab ic={ICON.herd} ur={`ابھی کوئی گنتی نہیں۔ اپنے جانور گن کر یہاں درج کریں۔`} en="No count yet. Count your animals and enter it here." /></div>}
      {all.map(h => <HerdCard key={h.species} h={h} onCount={() => setCounting(h.species)} onEvent={() => setEventFor(h.species)} />)}
      <button className="addbtn" onClick={() => setCounting('new')}><span className="ic">＋</span><T ur="نئی قسم شامل کریں / گنتی" en="Add species / count" /></button>
      {counting && <CountPad species={counting === 'new' ? undefined : counting} onClose={() => setCounting(undefined)} />}
      {eventFor && <EventPad species={eventFor} onClose={() => setEventFor(undefined)} />}
    </div>
  )
}
/** Confirmed = solid green box with ✓. Estimate = dashed, hatched box with ≈. Never counted = dashed amber "?". */
function HerdCard({ h, onCount, onEvent }: { h: HerdStatus; onCount: () => void; onEvent: () => void }) {
  const c = h.confirmed
  return (
    <div className={`card herd ${h.status}`}>
      <div className="herd-head"><span className="ic">{SPECIES_IC[h.species]}</span><T ur={SPECIES_UR[h.species]} en={SPECIES_EN[h.species]} big /></div>
      <div className="herd-nums">
        {c
          ? <div className="confirmed"><b dir="ltr">✓ {c.count}</b><T ur="تصدیق شدہ گنتی" en="Confirmed count" /><small><T ur={agoUr(c.confirmedAt)} en={`${new Date(c.confirmedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · ${agoEn(c.confirmedAt)}`} emph /></small></div>
          : <div className="confirmed none"><b>?</b><T ur="کوئی تصدیق شدہ گنتی نہیں" en="Never counted" /></div>}
        {c && h.eventsSince.length > 0
          ? <div className="estimate"><b dir="ltr">≈ {h.estimate}</b><T ur="اندازہ (تصدیق نہیں)" en="Estimate" />
              <small dir="ltr">+{h.additions} / −{h.removals}</small></div>
          : c ? <div className="estimate quiet"><T ur="بعد میں کوئی تبدیلی درج نہیں" en="No change since" /></div>
          : <div className="estimate"><b dir="ltr">+{h.additions} / −{h.removals}</b><T ur="درج تبدیلیاں" en="Changes" /><small><T ur="کل معلوم نہیں" en="Total unknown" /></small></div>}
      </div>
      {h.eventsSince.length > 0 && <ul className="events">{h.eventsSince.slice(-4).map(e => (
        <li key={e.id}><span className={`d ${e.delta > 0 ? 'plus' : 'minus'}`} dir="ltr">{e.delta > 0 ? '+' : ''}{e.delta}</span>
          <T ur={`${EVENT_UR[e.type] ?? e.type} · ${agoUr(e.at)}`} en={`${e.type} · ${agoEn(e.at)}`} />{e.sourceText && <q dir="auto">{e.sourceText}</q>}</li>))}</ul>}
      {h.status === 'none' && <div className="warn-line"><Lab ic="⚠️" ur="گنتی کر کے درج کریں، تب ہی کل تعداد بتائی جا سکتی ہے۔" en="Count the animals to set a baseline; until then the total is unknown." /></div>}
      {h.status === 'stale' && <div className="warn-line"><Lab ic="⚠️" ur={`${h.daysSinceConfirmed} دن سے دوبارہ گنتی نہیں ہوئی۔ اندازہ پرانا ہو سکتا ہے۔`} en={`Not physically reconfirmed for ${h.daysSinceConfirmed} days. The estimate may be stale.`} emph /></div>}
      {h.status === 'estimated' && <div className="note-line"><T ur="اندازہ صرف درج شدہ واقعات پر مبنی ہے" en="Estimate is based only on recorded events" /></div>}
      <div className="actions">
        <button className="primary" onClick={onCount}><span className="ic">🔢</span><T ur="ابھی گنتی کریں" en="Count now" /></button>
        <button onClick={onEvent}><span className="ic">±</span><T ur="تبدیلی درج کریں" en="Record change" /></button>
      </div>
    </div>
  )
}
function CountPad({ species, onClose }: { species?: Species; onClose: () => void }) {
  const [sp, setSp] = useState<Species>(species ?? 'goat')
  const [n, setN] = useState('')
  const [res, setRes] = useState<string>()
  const save = async () => {
    const v = parseInt(n); if (!(v >= 0)) return
    const before = await herdStatus(sp); await confirmCount(sp, v, 'manual')
    const d = before.estimate !== undefined ? v - before.estimate : 0
    if (d) { setRes(d > 0 ? `+${d}` : `${d}`) } else onClose()
  }
  if (res) return (
    <Modal onClose={onClose}>
      <span className="emoji">✓ {SPECIES_IC[sp]}</span>
      <T ur={`گنتی محفوظ: ${n}۔ پچھلے اندازے سے فرق ${res}۔`} en={`Saved ${n}. Differs from the previous estimate by ${res}.`} big emph />
      <T ur="کیا کوئی پیدائش، خرید، فروخت یا نقصان درج ہونے سے رہ گیا تھا؟ نئی گنتی اب درست مانی جائے گی۔" en="Was a birth, purchase, sale or loss not recorded? The new count is now authoritative." />
      <button className="big-btn ok" onClick={onClose}>OK</button>
    </Modal>)
  return (
    <Modal onClose={onClose}>
      <Lab ic={SPECIES_IC[sp]} ur="جانور گن کر تعداد لکھیں" en="Count and enter the number" big />
      {!species && <div className="chips species">{(['goat', 'sheep', 'camel', 'cattle'] as Species[]).map(s => <button key={s} className={sp === s ? 'on' : ''} aria-pressed={sp === s} onClick={() => setSp(s)}><span className="ic">{SPECIES_IC[s]}</span>{SPECIES_UR[s]}</button>)}</div>}
      <input className="num" inputMode="numeric" autoFocus value={n} onChange={e => setN(e.target.value.replace(/\D/g, ''))} placeholder="47" aria-label="Count" />
      <button className="big-btn ok" onClick={save}><I c="✓" /><T ur={`${SPECIES_UR_OBL[sp]} کی تصدیق`} en="Confirm count" /></button>
    </Modal>
  )
}
function EventPad({ species, onClose }: { species: Species; onClose: () => void }) {
  const [qty, setQty] = useState(1)
  const rec = async (type: HerdEventType) => { await db.herdEvents.add({ species, type, delta: signOf(type) * qty, at: now() }); onClose() }
  return (
    <Modal onClose={onClose}>
      <Lab ic={SPECIES_IC[species]} ur={`${SPECIES_UR[species]} — کیا ہوا؟`} en="What happened?" big />
      <div className="stepper"><button onClick={() => setQty(q => Math.max(1, q - 1))} aria-label="less">−</button><b>{qty}</b><button onClick={() => setQty(q => q + 1)} aria-label="more">+</button></div>
      <div className="rate">{ADD_TYPES.map(([t, u, e]) => <button key={t} className="good" onClick={() => rec(t)}><I c="＋" /><T ur={u} en={e} /></button>)}</div>
      <div className="rate grid2">{REM_TYPES.map(([t, u, e]) => <button key={t} className="poor" onClick={() => rec(t)}><I c="−" /><T ur={u} en={e} /></button>)}</div>
    </Modal>
  )
}

// ---------------- Map / History / Settings ----------------
function MapScreen() {
  const fix = useFix()
  const places = useLiveQuery(() => db.places.toArray()) ?? []
  const [focus, setFocus] = useState<Answer['map']>()
  return (
    <div>
      <MapView allTrips={!focus} focus={focus} className="map tall" />
      <div className="legend" dir="rtl"><span className="g"><i />اچھا</span><span className="o"><i />ٹھیک</span><span className="p"><i />کمزور</span><span className="a"><i />آج</span><span className="x"><i />ریکارڈ نہیں</span></div>
      <div className="pad">
        {places.length === 0 && <p className="muted note"><Lab ic={ICON.place} ur="ابھی کوئی جگہ محفوظ نہیں" en="No places saved yet" /></p>}
        {places.map(p => (
          <button key={p.id} className="card row" dir="rtl" onClick={() => setFocus({ placeIds: [p.id!] })}>
            <span className="row-main"><span className="ic">{placeIcon(p.type)}</span><b dir="auto">{p.name}</b></span>
            <span className="row-side">{fix && <span className="num" dir="ltr">{fmtKm(distanceM(fix, p))}</span>}
              <T ur={`${fix ? DIR_UR[compass(bearingDeg(fix, p))] + ' · ' : ''}${agoUr(p.createdAt)}`} en={`${fix ? compass(bearingDeg(fix, p)) + ' · ' : ''}${agoEn(p.createdAt)}`} /></span>
          </button>
        ))}
      </div>
    </div>
  )
}

const RATING_UR = { good: 'اچھا', okay: 'ٹھیک', poor: 'کمزور' } as const
const RATING_DOT = { good: '🟢', okay: '🟡', poor: '🔴' } as const
function History() {
  const trips = useLiveQuery(() => db.trips.orderBy('startedAt').reverse().toArray()) ?? []
  const [sel, setSel] = useState<number>()
  return (
    <div>
      {sel && <MapView focus={{ tripIds: [sel] }} className="map short" />}
      <div className="pad">
        <p className="muted note"><T ur="صرف وہ سفر جو CHOTA پر ریکارڈ ہوئے — مکمل تاریخ نہیں" en="Only trips recorded in CHOTA — not a complete history" /></p>
        {trips.filter(t => t.endedAt).map(t => (
          <button key={t.id} className={`card row trip ${t.rating ?? ''} ${sel === t.id ? 'sel' : ''}`} dir="rtl" onClick={() => setSel(t.id)}>
            <span><T ur={agoUr(t.startedAt)} en={new Date(t.startedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} /></span>
            <span className="trip-mid"><span className="num" dir="ltr">{fmtKm(t.distanceM ?? 0)}</span>
              <T ur={`${Math.round((t.endedAt! - t.startedAt) / 3600000 * 10) / 10} گھنٹے${t.direction ? ` · ${DIR_UR[t.direction as keyof typeof DIR_UR]}` : ''}`} en={`${Math.round((t.endedAt! - t.startedAt) / 3600000 * 10) / 10} h${t.direction ? ` · ${t.direction}` : ''}`} />
              {t.gapCount ? <span className="gap-flag"><Lab ic="⚠️" ur={`${t.gapCount} وقفہ`} en={`${t.gapCount} gap${t.gapCount > 1 ? 's' : ''}`} /></span> : null}</span>
            <span className={`chip ${t.rating ?? ''}`}>{t.rating ? <><I c={RATING_DOT[t.rating]} /><span className="ur">{RATING_UR[t.rating]}</span></> : '—'}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Settings() {
  const fix = useFix()
  const home = useLiveQuery(getHome)
  const [, force] = useState(0)
  const [en, setEn] = useState(lsGet('chota.en') !== '0')
  const Row = ({ children }: { children: ReactNode }) => <div className="card set">{children}</div>
  return (
    <div className="pad">
      <Row>
        <Lab ic="🏠" ur="گھر" en="Home" big />
        <p className="muted">{home ? `${home.lat.toFixed(5)}, ${home.lon.toFixed(5)} · ${agoEn(home.setAt)}` : '—'}</p>
        <button className="big-btn back" disabled={!fix} onClick={() => fix && setHome(fix.lat, fix.lon, now())}><I c="🏠" /><T ur="یہ جگہ میرا گھر ہے" en="Set current location as Home" /></button>
      </Row>
      <Row>
        <label><input type="checkbox" checked={en} onChange={e => { lsSet('chota.en', e.target.checked ? '1' : '0'); setEn(e.target.checked) }} /> English subtitles</label>
        <label><input type="checkbox" checked={isSimulated()} onChange={e => { setSimulated(e.target.checked); force(x => x + 1) }} /> Demo GPS (simulated walk) — off = real phone GPS</label>
        <button onClick={() => requestNotifications().then(() => force(x => x + 1))}>🔔 Enable notifications ({typeof Notification !== 'undefined' ? Notification.permission : 'n/a'})</button>
        <p className="muted">Urdu voice output: {hasUrduVoice() ? 'available' : 'no Urdu TTS voice on this device. On Android: Settings → Text-to-speech → Google → install Urdu'} · Speech input: {canListen() ? 'browser (needs network) + keyboard mic' : 'keyboard mic only'}</p>
      </Row>
      <Row>
        <b>Demo controls</b>
        <div className="chips">
          <button onClick={async () => { await loadDemo(); force(x => x + 1) }}>Load demo history</button>
          {[1, 3, 7, 14].map(d => <button key={d} onClick={() => { shiftDays(d); force(x => x + 1) }}>+{d} days</button>)}
          <button onClick={() => { shiftDays(0); force(x => x + 1) }}>Reset clock</button>
          <button className="danger" onClick={async () => { if (confirm('Delete all CHOTA data on this device?')) { await clearAll(); force(x => x + 1) } }}>Clear all data</button>
        </div>
        <p className="muted">Clock: {new Date(now()).toLocaleString('en-GB')} {clockOffsetDays() ? `(+${clockOffsetDays()} days demo)` : ''}</p>
      </Row>
      <Row>
        <b>About the data</b>
        <p className="muted">All records stay on this phone. Map: Copernicus Sentinel-2 true colour (30 Sep 2026), GeoNames villages, geoBoundaries border. CHOTA does not judge pasture, water or access; places and grazing ratings are the herder's own.</p>
      </Row>
    </div>
  )
}

function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return <div className="modal-bg" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}>{children}</div></div>
}
