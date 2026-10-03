import { useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getHome, setHome, type Species, type HerdEventType, type Rating, type Reminder } from './db'
import { now, shiftDays, clockOffsetDays } from './clock'
import { onFix, startPositioning, startTrip, endTrip, activeTrip, isSimulated, setSimulated, simSet, simState, tripStats, type Fix } from './gps'
import { distanceM, bearingDeg, compass, DIR_UR, fmtKm, fmtKmUr } from './geo'
import { answer, agoUr, agoEn, dueUr, dueEn, type Answer } from './answer'
import { herdStatus, trackedSpecies, confirmCount, SPECIES_UR, SPECIES_EN, type HerdStatus } from './herd'
import { signOf } from './nlu'
import { checkReminders, requestNotifications } from './reminders'
import { speak, canListen, listen, hasUrduVoice } from './speech'
import { loadDemo, clearAll } from './demo'
import { MapView } from './MapView'

type Screen = 'home' | 'trip' | 'ask' | 'reminders' | 'herd' | 'map' | 'history' | 'settings'
const lsGet = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } }

/** Urdu line with optional English subtitle. */
function T({ ur, en, big }: { ur: string; en?: string; big?: boolean }) {
  const showEn = lsGet('chota.en') !== '0'
  return <span className={big ? 'tx big' : 'tx'}><span className="ur" dir="rtl">{ur}</span>{showEn && en && <span className="en">{en}</span>}</span>
}

function useFix() { const [f, setF] = useState<Fix>(); useEffect(() => onFix(setF), []); return f }
function useTick(ms = 1000) { const [, s] = useState(0); useEffect(() => { const i = setInterval(() => s(x => x + 1), ms); return () => clearInterval(i) }, [ms]) }

export default function App() {
  const [screen, setScreen] = useState<Screen>(activeTrip() ? 'trip' : 'home')
  const [fired, setFired] = useState<Reminder[]>([])
  const [rateTrip, setRateTrip] = useState<number>()
  useEffect(() => { startPositioning() }, [])
  useEffect(() => {
    const run = async () => { const due = await checkReminders(); if (due.length) { setFired(f => [...f, ...due]); speak(due[0].text) } }
    run(); const i = setInterval(run, 15000); return () => clearInterval(i)
  }, [])
  const go = (s: Screen) => setScreen(s)

  return (
    <div className="app">
      <Header onHome={() => go('home')} screen={screen} />
      <main>
        {screen === 'home' && <Home go={go} />}
        {screen === 'trip' && <TripScreen go={go} onEnded={id => { setRateTrip(id); go('home') }} />}
        {screen === 'ask' && <Ask />}
        {screen === 'reminders' && <Reminders />}
        {screen === 'herd' && <Herd />}
        {screen === 'map' && <MapScreen />}
        {screen === 'history' && <History />}
        {screen === 'settings' && <Settings />}
      </main>
      {rateTrip && <RateTrip id={rateTrip} onDone={() => setRateTrip(undefined)} />}
      {fired.length > 0 && <FiredReminder r={fired[0]} onClose={() => setFired(f => f.slice(1))} go={go} />}
    </div>
  )
}

function Header({ onHome, screen }: { onHome: () => void; screen: Screen }) {
  const off = clockOffsetDays()
  return (
    <header>
      {screen !== 'home' ? <button className="back" onClick={onHome} aria-label="Home">‹</button> : <span className="back" />}
      <div className="brand" onClick={onHome}><b>چھوٹا</b><small>CHOTA · Small AI. Big memory.</small></div>
      <div className="badges">
        {isSimulated() && <span className="badge demo">DEMO GPS</span>}
        {off > 0 && <span className="badge demo">+{off}d</span>}
        <span className="badge off">{navigator.onLine ? 'online' : 'offline ✓'}</span>
      </div>
    </header>
  )
}

// ---------------- Home ----------------
function Home({ go }: { go: (s: Screen) => void }) {
  useTick(5000)
  const fix = useFix()
  const home = useLiveQuery(getHome)
  const pending = useLiveQuery(() => db.reminders.where('status').anyOf('pending', 'fired').count()) ?? 0
  const herd = useLiveQuery(async () => Promise.all((await trackedSpecies()).map(herdStatus)), [])
  const stale = herd?.filter(h => h.status === 'stale') ?? []
  const tid = activeTrip()
  const hd = home && fix ? distanceM(fix, home) : undefined
  return (
    <div className="home">
      <div className="strip">
        {home ? (hd !== undefined && <T ur={`🏠 گھر ${fmtKmUr(hd)} · ${DIR_UR[compass(bearingDeg(fix!, home))]}`} en={`Home ${fmtKm(hd)} ${compass(bearingDeg(fix!, home))}`} />)
          : <button className="link" onClick={() => go('settings')}><T ur="🏠 پہلے اپنا گھر محفوظ کریں" en="Set your home first" /></button>}
      </div>
      {stale.map(s => (
        <button key={s.species} className="warn" onClick={() => go('herd')}>
          <T ur={`⚠️ ${SPECIES_UR[s.species]} کی گنتی ${s.daysSinceConfirmed} دن سے تصدیق نہیں ہوئی`} en={`${SPECIES_EN[s.species]} not recounted for ${s.daysSinceConfirmed} days`} />
        </button>
      ))}
      <div className="grid4">
        <button className={`tile trip ${tid ? 'active' : ''}`} onClick={async () => { if (!tid) await startTrip(); go('trip') }}>
          <span className="emoji">🐐</span>{tid ? <T ur="سفر جاری ہے" en="Trip in progress" big /> : <T ur="سفر شروع کریں" en="Start Trip" big />}
        </button>
        <button className="tile ask" onClick={() => go('ask')}><span className="emoji">🎙️</span><T ur="چھوٹا سے پوچھیں" en="Ask Chota" big /></button>
        <button className="tile rem" onClick={() => go('reminders')}><span className="emoji">🔔</span><T ur="یاد دہانیاں" en="Reminders" big />{pending > 0 && <i className="count">{pending}</i>}</button>
        <button className="tile herd" onClick={() => go('herd')}><span className="emoji">🐑</span><T ur="ریوڑ کی گنتی" en="Herd Count" big />{stale.length > 0 && <i className="count">!</i>}</button>
      </div>
      <div className="row3">
        <button onClick={() => go('map')}>🗺️<T ur="نقشہ و جگہیں" en="Map & Places" /></button>
        <button onClick={() => go('history')}>🕓<T ur="پرانے سفر" en="Trip History" /></button>
        <button onClick={() => go('settings')}>⚙️<T ur="سیٹنگز" en="Settings" /></button>
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
  if (!tid) return <div className="pad"><T ur="کوئی سفر جاری نہیں۔" en="No active trip." /><button className="big-btn" onClick={() => go('home')}>OK</button></div>
  const hd = home && fix ? distanceM(fix, home) : undefined
  const mins = trip ? Math.floor((now() - trip.startedAt) / 60000) : 0
  const sim = simState()
  return (
    <div className="trip-screen">
      <MapView focus={focus} />
      <div className="stats">
        <div><b>{Math.floor(mins / 60)}:{String(mins % 60).padStart(2, '0')}</b><T ur="وقت" en="time" /></div>
        <div><b>{fmtKm(stats?.distanceM ?? 0)}</b><T ur="چلے" en="walked" /></div>
        <div><b>{hd !== undefined ? fmtKm(hd) : '—'}</b><T ur={`گھر ${hd !== undefined ? DIR_UR[compass(bearingDeg(fix!, home!))] : ''}`} en="to home" /></div>
      </div>
      {msg && <div className="answer small"><T ur={msg.ur} en={msg.en} /></div>}
      <div className="trip-actions">
        <button className="big-btn place" onClick={() => setNaming(true)}>📍 <T ur="یہ جگہ یاد رکھو" en="Remember this place" /></button>
        <button className="big-btn back" onClick={async () => { const a = await answer('wapas ka rasta dikhao'); setMsg(a); setFocus({ ...a.map, wayBack: true }); speak(a.ur) }}>
          🏠 <T ur="واپسی کا راستہ" en="Way back" /></button>
        <button className="big-btn end" onClick={async () => { const id = await endTrip(); if (id) onEnded(id) }}>⏹ <T ur="سفر ختم کریں" en="End trip" /></button>
      </div>
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

function NamePlace({ onClose }: { onClose: (a?: Answer) => void }) {
  const [name, setName] = useState('')
  const save = async (n: string) => { if (!n.trim()) return; onClose(await answer(`اس جگہ کو ${n.trim()} یاد رکھو`)) }
  return (
    <Modal onClose={() => onClose()}>
      <T ur="اس جگہ کا نام؟" en="Name this place" big />
      <input autoFocus dir="auto" value={name} onChange={e => setName(e.target.value)} placeholder="پرانا چارہ" onKeyDown={e => e.key === 'Enter' && save(name)} />
      <div className="chips">{['پرانا چارہ', 'اچھی چراگاہ', 'پانی', 'سایہ'].map(c => <button key={c} onClick={() => save(c)}>{c}</button>)}</div>
      <button className="big-btn" onClick={() => save(name)}>✓ <T ur="محفوظ کریں" en="Save" /></button>
    </Modal>
  )
}

function RateTrip({ id, onDone }: { id: number; onDone: () => void }) {
  const t = useLiveQuery(() => db.trips.get(id), [id])
  useEffect(() => { speak('آج چارہ کیسا تھا؟') }, [])
  const rate = async (r: Rating | null) => { await db.trips.update(id, { rating: r }); onDone() }
  return (
    <Modal onClose={() => rate(null)}>
      <T ur="سفر محفوظ ہو گیا" en="Trip saved" />
      {t && <p className="muted"><T ur={`${fmtKmUr(t.distanceM ?? 0)} · گھر سے زیادہ سے زیادہ ${fmtKmUr(t.furthestFromHomeM ?? 0)}${t.direction ? ` · ${DIR_UR[t.direction as keyof typeof DIR_UR]}` : ''}`}
        en={`${fmtKm(t.distanceM ?? 0)} · max ${fmtKm(t.furthestFromHomeM ?? 0)} from home${t.direction ? ` · ${t.direction}` : ''}`} /></p>}
      <T ur="آج چارہ کیسا تھا؟" en="How was the grazing today?" big />
      <div className="rate">
        <button className="good" onClick={() => rate('good')}>🟢<T ur="اچھا" en="Good" big /></button>
        <button className="okay" onClick={() => rate('okay')}>🟡<T ur="ٹھیک" en="Okay" big /></button>
        <button className="poor" onClick={() => rate('poor')}>🔴<T ur="کمزور" en="Poor" big /></button>
      </div>
      <button className="link" onClick={() => rate(null)}><T ur="چھوڑیں" en="Skip" /></button>
    </Modal>
  )
}

// ---------------- Ask ----------------
const EXAMPLES: [string, string][] = [
  ['پچھلی بار اچھا چارہ کہاں ملا تھا؟', 'Where was good grazing last time?'],
  ['گھر کتنی دور ہے؟', 'How far is home?'],
  ['میرا واپسی کا راستہ دکھاؤ', 'Show my way back'],
  ['کل صبح ریوڑ کی گنتی کرنا یاد دلانا', 'Remind me to count the herd tomorrow morning'],
  ['کتنی بکریاں ہیں؟', 'How many goats?'],
  ['میں یہاں پہلے آیا ہوں؟', 'Have I been here before?'],
  ['پچھلی دفعہ شمال مغرب کب گیا تھا؟', 'When did I last go north-west?'],
  ['اس مہینے کتنے سفر کیے؟', 'How many trips this month?'],
  ['دو بکریاں بیچیں', 'Sold two goats'],
]
function Ask() {
  const [q, setQ] = useState('')
  const [log, setLog] = useState<{ q: string; a: Answer }[]>([])
  const [listening, setListening] = useState(false)
  const ask = async (text: string) => {
    if (!text.trim()) return
    const a = await answer(text); setLog(l => [{ q: text, a }, ...l].slice(0, 6)); setQ(''); speak(a.ur)
  }
  const cur = log[0]
  return (
    <div className="ask">
      <div className="askbar">
        <input dir="auto" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask(q)}
          placeholder="یہاں بولیں یا لکھیں…" aria-label="Ask Chota" />
        {canListen() && <button className={listening ? 'mic on' : 'mic'} onClick={() => { if (listen(t => { setQ(t); ask(t) }, () => setListening(false))) setListening(true) }}>🎤</button>}
        <button className="go" onClick={() => ask(q)}>➤</button>
      </div>
      <p className="hint"><T ur="کی بورڈ کا 🎤 مائیک بھی استعمال کر سکتے ہیں" en="Tip: the keyboard's mic (Gboard Urdu voice typing) works too" /></p>
      {cur && (
        <div className={`answer ${cur.a.ok ? '' : 'muted'}`}>
          <div className="q" dir="auto">“{cur.q}”</div>
          <T ur={cur.a.ur} en={cur.a.en} big />
          {hasUrduVoice() && <button className="speak" onClick={() => speak(cur.a.ur)}>🔊</button>}
        </div>
      )}
      {cur?.a.map && <MapView focus={cur.a.map} className="map short" />}
      <div className="chips examples">{EXAMPLES.map(([u, e]) => <button key={u} onClick={() => ask(u)}><T ur={u} en={e} /></button>)}</div>
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
  const add = async () => { if (!q.trim()) return; const a = await answer(q.includes('یاد') || /yaad|yad/.test(q) ? q : `${q} یاد دلانا`); setMsg(a); setQ('') }
  return (
    <div className="pad">
      <div className="askbar">
        <input dir="auto" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="کل صبح ٹیوب ویل جانا ہے" />
        <button className="go" onClick={add}>＋</button>
      </div>
      {msg && <div className="answer small"><T ur={msg.ur} en={msg.en} /></div>}
      {rs.length === 0 && <p className="muted"><T ur="کوئی یاد دہانی نہیں" en="No reminders" /></p>}
      {rs.map(r => (
        <div key={r.id} className={`card rem ${r.status} ${r.source}`}>
          <div className="when"><T ur={r.status === 'fired' ? '🔔 ابھی' : dueUr(r.dueAt)} en={r.status === 'fired' ? 'now' : dueEn(r.dueAt)} />{r.source === 'system' && <span className="badge">CHOTA</span>}</div>
          <div className="ur" dir="auto">{r.text}</div>
          <div className="actions">
            <button onClick={() => db.reminders.update(r.id!, { status: 'done' })}>✓ <T ur="ہو گیا" en="Done" /></button>
            <button onClick={() => db.reminders.update(r.id!, { status: 'pending', dueAt: now() + 3600000 })}>⏰ <T ur="ایک گھنٹہ بعد" en="+1 hour" /></button>
          </div>
        </div>
      ))}
      {done.length > 0 && <details><summary><T ur={`مکمل (${done.length})`} en="Done" /></summary>{done.map(r => <div key={r.id} className="card done" dir="auto">{r.text}</div>)}</details>}
    </div>
  )
}

function FiredReminder({ r, onClose, go }: { r: Reminder; onClose: () => void; go: (s: Screen) => void }) {
  const isHerd = r.kind?.startsWith('herd')
  return (
    <Modal onClose={onClose}>
      <span className="emoji">🔔</span>
      <div className="ur big" dir="auto">{r.text}</div>
      <div className="rate">
        {isHerd && <button className="good" onClick={() => { db.reminders.update(r.id!, { status: 'done' }); onClose(); go('herd') }}><T ur="ابھی گنتی کریں" en="Count now" /></button>}
        <button onClick={() => { db.reminders.update(r.id!, { status: 'done' }); onClose() }}>✓ <T ur="ٹھیک ہے" en="OK" /></button>
        <button onClick={() => { db.reminders.update(r.id!, { status: 'pending', dueAt: now() + 3600000 }); onClose() }}>⏰ <T ur="بعد میں" en="Later" /></button>
      </div>
    </Modal>
  )
}

// ---------------- Herd ----------------
const ADD_TYPES: [HerdEventType, string, string][] = [['birth', 'پیدائش', 'Birth'], ['purchase', 'خرید', 'Bought']]
const REM_TYPES: [HerdEventType, string, string][] = [['sale', 'فروخت', 'Sold'], ['death', 'موت', 'Died'], ['loss', 'گم/چوری', 'Lost'], ['slaughter', 'ذبح', 'Slaughtered']]
function Herd() {
  const all = useLiveQuery(async () => Promise.all((await trackedSpecies()).map(herdStatus)), []) ?? []
  const [counting, setCounting] = useState<Species | 'new'>()
  const [eventFor, setEventFor] = useState<Species>()
  return (
    <div className="pad">
      {all.length === 0 && <div className="card"><T ur="ابھی کوئی گنتی نہیں۔ اپنے جانور گن کر یہاں درج کریں۔" en="No count yet. Count your animals and enter it here." /></div>}
      {all.map(h => <HerdCard key={h.species} h={h} onCount={() => setCounting(h.species)} onEvent={() => setEventFor(h.species)} />)}
      <button className="link" onClick={() => setCounting('new')}>＋ <T ur="نئی قسم شامل کریں / گنتی" en="Add species / count" /></button>
      {counting && <CountPad species={counting === 'new' ? undefined : counting} onClose={() => setCounting(undefined)} />}
      {eventFor && <EventPad species={eventFor} onClose={() => setEventFor(undefined)} />}
    </div>
  )
}
function HerdCard({ h, onCount, onEvent }: { h: HerdStatus; onCount: () => void; onEvent: () => void }) {
  const c = h.confirmed!
  return (
    <div className={`card herd ${h.status}`}>
      <div className="herd-head"><T ur={SPECIES_UR[h.species]} en={SPECIES_EN[h.species]} big /></div>
      <div className="herd-nums">
        <div className="confirmed"><b>{c.count}</b><T ur="آخری تصدیق شدہ گنتی" en="Last confirmed count" /><small><T ur={agoUr(c.confirmedAt)} en={`${new Date(c.confirmedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · ${agoEn(c.confirmedAt)}`} /></small></div>
        <div className="estimate"><b>{h.estimate}</b><T ur="اندازاً اب" en="Estimated now" />
          <small><T ur={`درج شدہ: +${h.additions} / −${h.removals}`} en={`Recorded since: +${h.additions} / −${h.removals}`} /></small></div>
      </div>
      {h.eventsSince.length > 0 && <ul className="events">{h.eventsSince.slice(-4).map(e => <li key={e.id}><span dir="ltr">{e.delta > 0 ? '+' : ''}{e.delta}</span> {e.type} · {agoEn(e.at)}{e.sourceText && <q dir="auto">{e.sourceText}</q>}</li>)}</ul>}
      {h.status === 'stale' && <div className="warn-line"><T ur={`⚠️ ${h.daysSinceConfirmed} دن سے دوبارہ گنتی نہیں ہوئی۔ اندازہ پرانا ہو سکتا ہے۔`} en={`Not physically reconfirmed for ${h.daysSinceConfirmed} days. The estimate may be stale.`} /></div>}
      {h.status === 'estimated' && <div className="note-line"><T ur="اندازہ صرف درج شدہ واقعات پر مبنی ہے" en="Estimate is based only on recorded events" /></div>}
      <div className="actions">
        <button className="primary" onClick={onCount}>🔢 <T ur="ابھی گنتی کریں" en="Count now" /></button>
        <button onClick={onEvent}>± <T ur="تبدیلی درج کریں" en="Record change" /></button>
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
      <T ur={`گنتی محفوظ: ${n}۔ پچھلے اندازے سے فرق ${res}۔`} en={`Saved ${n}. Differs from the previous estimate by ${res}.`} big />
      <T ur="کیا کوئی پیدائش، خرید، فروخت یا نقصان درج ہونے سے رہ گیا تھا؟ نئی گنتی اب درست مانی جائے گی۔" en="Was a birth, purchase, sale or loss not recorded? The new count is now authoritative." />
      <button className="big-btn" onClick={onClose}>OK</button>
    </Modal>)
  return (
    <Modal onClose={onClose}>
      <T ur="جانور گن کر تعداد لکھیں" en="Count and enter the number" big />
      {!species && <div className="chips">{(['goat', 'sheep', 'camel', 'cattle'] as Species[]).map(s => <button key={s} className={sp === s ? 'on' : ''} onClick={() => setSp(s)}>{SPECIES_UR[s]}</button>)}</div>}
      <input className="num" inputMode="numeric" autoFocus value={n} onChange={e => setN(e.target.value.replace(/\D/g, ''))} placeholder="47" />
      <button className="big-btn" onClick={save}>✓ <T ur={`${SPECIES_UR[sp]} کی تصدیق`} en="Confirm count" /></button>
    </Modal>
  )
}
function EventPad({ species, onClose }: { species: Species; onClose: () => void }) {
  const [qty, setQty] = useState(1)
  const rec = async (type: HerdEventType) => { await db.herdEvents.add({ species, type, delta: signOf(type) * qty, at: now() }); onClose() }
  return (
    <Modal onClose={onClose}>
      <T ur={`${SPECIES_UR[species]} — کیا ہوا؟`} en="What happened?" big />
      <div className="stepper"><button onClick={() => setQty(q => Math.max(1, q - 1))}>−</button><b>{qty}</b><button onClick={() => setQty(q => q + 1)}>+</button></div>
      <div className="rate">{ADD_TYPES.map(([t, u, e]) => <button key={t} className="good" onClick={() => rec(t)}>＋<T ur={u} en={e} /></button>)}</div>
      <div className="rate">{REM_TYPES.map(([t, u, e]) => <button key={t} className="poor" onClick={() => rec(t)}>−<T ur={u} en={e} /></button>)}</div>
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
      <div className="legend"><span className="g">━ اچھا</span><span className="o">━ ٹھیک</span><span className="p">━ کمزور</span><span className="a">━ آج</span></div>
      <div className="pad">
        {places.map(p => (
          <button key={p.id} className="card row" onClick={() => setFocus({ placeIds: [p.id!] })}>
            <span>{p.type === 'water' ? '💧' : p.type === 'home' ? '🏠' : '📍'} <b dir="auto">{p.name}</b></span>
            <span className="muted">{fix ? `${fmtKm(distanceM(fix, p))} ${compass(bearingDeg(fix, p))}` : ''} · {agoEn(p.createdAt)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function History() {
  const trips = useLiveQuery(() => db.trips.orderBy('startedAt').reverse().toArray()) ?? []
  const [sel, setSel] = useState<number>()
  return (
    <div>
      {sel && <MapView focus={{ tripIds: [sel] }} className="map short" />}
      <div className="pad">
        {trips.filter(t => t.endedAt).map(t => (
          <button key={t.id} className={`card row trip ${t.rating ?? ''} ${sel === t.id ? 'sel' : ''}`} onClick={() => setSel(t.id)}>
            <span><T ur={agoUr(t.startedAt)} en={new Date(t.startedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} /></span>
            <span>{fmtKm(t.distanceM ?? 0)} · {Math.round((t.endedAt! - t.startedAt) / 3600000 * 10) / 10} h · {t.direction ?? ''}</span>
            <span className={`chip ${t.rating ?? ''}`}>{t.rating ? { good: 'اچھا', okay: 'ٹھیک', poor: 'کمزور' }[t.rating] : '—'}</span>
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
        <T ur="گھر" en="Home" big />
        <p className="muted">{home ? `${home.lat.toFixed(5)}, ${home.lon.toFixed(5)} · ${agoEn(home.setAt)}` : '—'}</p>
        <button className="big-btn" disabled={!fix} onClick={() => fix && setHome(fix.lat, fix.lon, now())}>🏠 <T ur="یہ جگہ میرا گھر ہے" en="Set current location as Home" /></button>
      </Row>
      <Row>
        <label><input type="checkbox" checked={en} onChange={e => { lsSet('chota.en', e.target.checked ? '1' : '0'); setEn(e.target.checked) }} /> English subtitles</label>
        <label><input type="checkbox" checked={isSimulated()} onChange={e => { setSimulated(e.target.checked); force(x => x + 1) }} /> Demo GPS (simulated walk) — off = real phone GPS</label>
        <button onClick={() => requestNotifications().then(() => force(x => x + 1))}>🔔 Enable notifications ({typeof Notification !== 'undefined' ? Notification.permission : 'n/a'})</button>
        <p className="muted">Urdu voice output: {hasUrduVoice() ? 'available' : 'no Urdu TTS voice on this device'} · Speech input: {canListen() ? 'browser (needs network) + keyboard mic' : 'keyboard mic only'}</p>
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
