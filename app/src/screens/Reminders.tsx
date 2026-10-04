/** Reminders screen: add by voice or text (read back first), list, snooze and mark done. */
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../data/db'
import { type Answer, answer, dueEn, dueUr, tripEndEn, tripEndUr } from '../services/answer'
import { now } from '../services/clock'
import { LISTEN_ERROR, canListen, listen, stopListening } from '../services/speech'
import { ConfirmRow } from '../ui/VoiceAsk'
import { Lab, T } from '../ui/common'
import { useTick } from '../ui/hooks'

/** Reminders screen: add (with read-back), snooze, mark done. */
export function Reminders() {
  useTick(15000)
  const rs = useLiveQuery(() => db.reminders.where('status').anyOf('pending', 'fired').sortBy('dueAt')) ?? []
  const done = useLiveQuery(() => db.reminders.where('status').equals('done').reverse().sortBy('dueAt')) ?? []
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState<Answer>()
  const [listening, setListening] = useState(false)
  const [micErr, setMicErr] = useState<[string, string]>()
  useEffect(() => () => stopListening(true), [])
  const add = async (text = q) => { if (!text.trim()) return; const a = await answer(text.includes('یاد') || /yaad|yad/.test(text) ? text : `${text} یاد دلانا`); setMsg(a); setQ('') }
  /** Same mic as naming a place: words appear in the box; the herder checks them, then taps ＋. */
  const mic = () => {
    if (listening) { stopListening(); setListening(false); return }   // button off now; words heard so far are used
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
          <div className="when"><span className="ic">{r.status === 'fired' ? '🔔' : r.trigger ? '🏁' : '⏰'}</span>{/* "now" only while it is fresh; an old fired reminder shows when it was due */}
            <T ur={r.status === 'fired' && now() - (r.firedAt ?? 0) < 3600000 ? 'ابھی' : r.trigger ? tripEndUr() : dueUr(r.dueAt)} en={r.status === 'fired' && now() - (r.firedAt ?? 0) < 3600000 ? 'now' : r.trigger ? tripEndEn() : dueEn(r.dueAt)} emph />{r.source === 'system' && <span className="badge">CHOTA</span>}</div>
          <div className="ur what" dir="auto">{r.text}</div>
          <div className="actions">
            <button className="done" onClick={() => db.reminders.update(r.id!, { status: 'done' })}><span className="ic">✓</span><T ur="ہو گیا" en="Done" /></button>
            <button onClick={() => db.reminders.update(r.id!, { status: 'pending', dueAt: now() + 3600000, trigger: undefined })}><span className="ic">⏰</span><T ur="ایک گھنٹہ بعد" en="+1 hour" /></button>
          </div>
        </div>
      ))}
      {done.length > 0 && <details><summary><Lab ic="✓" ur={`مکمل (${done.length})`} en="Done" /></summary>{done.map(r => <div key={r.id} className="card done" dir="auto">✓ {r.text}</div>)}</details>}
    </div>
  )
}
