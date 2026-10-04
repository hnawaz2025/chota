/** Herd screen: confirmed count vs estimate per species, recount and record a change by tapping. */
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { signOf } from '../core/nlu'
import { type HerdEventType, type Species, db } from '../data/db'
import { agoEn, agoUr } from '../services/answer'
import { now } from '../services/clock'
import { type HerdStatus, SPECIES_EN, SPECIES_UR, SPECIES_UR_OBL, confirmCount, herdStatus, trackedSpecies } from '../services/herd'
import { I, Lab, Modal, T } from '../ui/common'
import { ICON, SPECIES_IC } from '../ui/constants'

const ADD_TYPES: [HerdEventType, string, string][] = [['birth', 'پیدائش', 'Birth'], ['purchase', 'خرید', 'Bought']]

const REM_TYPES: [HerdEventType, string, string][] = [['sale', 'فروخت', 'Sold'], ['death', 'موت', 'Died'], ['loss', 'گم/چوری', 'Lost'], ['slaughter', 'ذبح', 'Slaughtered']]

const EVENT_UR: Record<string, string> = Object.fromEntries([...ADD_TYPES, ...REM_TYPES].map(([t, u]) => [t, u]))

/** Herd screen: one card per tracked species, plus "add species / count". */
export function Herd() {
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
      <button className="big-btn" onClick={onClose}>OK</button>
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
      <div className="rate">{ADD_TYPES.map(([t, u, e]) => <button key={t} className="add" onClick={() => rec(t)}><I c="＋" /><T ur={u} en={e} /></button>)}</div>
      <div className="rate grid2">{REM_TYPES.map(([t, u, e]) => <button key={t} className="sub" onClick={() => rec(t)}><I c="−" /><T ur={u} en={e} /></button>)}</div>
    </Modal>
  )
}
