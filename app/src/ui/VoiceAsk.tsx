/** Voice + text input with live transcript, the answer card, AI-guess / "did you mean" choices, and the ✓/✗ read-back. */
import { useEffect, useRef, useState } from 'react'
import { type Answer, LABEL_UR, type MapFocus, type PendingWrite, type UiAction, answer, commitPending, rejectPending } from '../services/answer'
import { LISTEN_ERROR, canListen, hasUrduVoice, listen, speak, stopListening } from '../services/speech'
import { MapView } from './MapView'
import { I, Lab, T } from './common'
import { FEATURE_OF, ICON } from './constants'
import { NamePlace } from './modals'

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
export function ConfirmRow({ p, onResult }: { p: PendingWrite; onResult: (a: Answer) => void }) {
  const lbl = CONFIRM_LABEL[p.kind] ?? CONFIRM_LABEL.default
  // One write per read-back: a quick double tap on ✓ must not save the herd change or reminder twice.
  const [busy, setBusy] = useState(false)
  const once = (f: () => Promise<Answer> | Answer) => async () => { if (busy) return; setBusy(true); onResult(await f()) }
  return (
    <div className="rate confirm">
      <button className="good" disabled={busy} onClick={once(() => commitPending(p))}><I c="✓" /><T ur={lbl[0]} en={lbl[1]} /></button>
      <button className="poor" disabled={busy} onClick={once(() => rejectPending(p))}><I c="✗" /><T ur={lbl[2]} en={lbl[3]} /></button>
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
export function VoiceAsk({ big, onAction, onMap }: { big?: boolean; onAction: (a: UiAction) => void; onMap?: (m: MapFocus | undefined) => void }) {
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
  const toKeyboardMic = () => { stopListening(true); setKbHint(true); input.current?.focus() }
  const [naming, setNaming] = useState(false)
  // "Remember this place" with no name said opens the naming window right here (spot frozen at that moment).
  const show = (q: string, a: Answer) => { setCur({ q, a }); speak(a.ur); onMap?.(a.map); if (a.action) { if ('namePlace' in a.action) setNaming(true); else onAction(a.action) } }
  const ask = async (text: string, forced?: string) => { if (!text.trim()) return; const a = await answer(text, forced); setQ(''); show(text, a) }
  useEffect(() => { if (!heard) return; const t = setTimeout(() => { ask(heard); setHeard(undefined) }, 900); return () => clearTimeout(t) // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heard])
  useEffect(() => () => stopListening(true), [])
  const mic = () => {
    if (listening) { stopListening(); setListening(false); return }   // button off now; words heard so far are used
    setMicErr(undefined); setKbHint(false); setQ('')
    // Browser recognition is online-only: without it, go straight to the keyboard mic (focus must happen in the tap).
    if (!canListen() || !navigator.onLine) { toKeyboardMic(); return }
    if (listen(t => { setQ(t); setHeard(t) }, e => {
      setListening(false)
      if (e === 'network' || e === 'insecure' || e === 'language-not-supported') toKeyboardMic()
      else if (e) setMicErr(LISTEN_ERROR[e])
    }, t => setQ(t))) setListening(true)
  }
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
          {cur.a.ai && cur.a.ai.label !== 'out_of_scope' && !cur.a.choices && <p className="ai-tag"><Lab ic="🤖" ur="AI کا اندازہ" en="AI guess — check it" /></p>}
          {cur.a.choices && <div className="choices">{cur.a.choices.map(l => (
            <button key={l} className="choice" onClick={() => ask(cur.q, l)}><I c={LABEL_UR[l][0]} /><T ur={LABEL_UR[l][1]} en={LABEL_UR[l][2]} /></button>))}</div>}
          {cur.a.pending && <ConfirmRow p={cur.a.pending} onResult={a => show(cur.q, a)} />}
        </div>
      )}
      {big && cur?.a.map && <MapView focus={cur.a.map} className="map short" />}
      {naming && <NamePlace onClose={r => { setNaming(false); if (r) show(cur?.q ?? '', r) }} />}
      {big && <details className="examples-box"><summary><span className="ic">💬</span><T ur="کیا پوچھ سکتے ہیں؟ (مثالیں)" en="What can I say? (examples)" /></summary>
        <div className="chips examples">{EXAMPLES.map(([u, e]) => <button key={u} onClick={() => ask(u)}><T ur={u} en={e} /></button>)}</div></details>}
    </div>
  )
}
