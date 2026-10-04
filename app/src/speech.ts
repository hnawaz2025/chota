/** Voice as progressive enhancement. Urdu TTS if the device has a voice; recognition only where the browser offers it. */
let urVoice: SpeechSynthesisVoice | undefined
function pickVoice() {
  try { urVoice = speechSynthesis.getVoices().find(v => v.lang.toLowerCase().startsWith('ur')) } catch { /* no TTS */ }
}
try { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice } catch { /* no TTS */ }

/** Android Chrome often lists no voices even when Google TTS has Urdu: asking for lang ur-PK still reaches it.
 * Elsewhere (e.g. a Mac) that would read Urdu with an English voice, so only real Urdu voices are used. */
const androidUnlisted = () => { try { return /Android/i.test(navigator.userAgent) && speechSynthesis.getVoices().length === 0 } catch { return false } }
export const hasUrduVoice = () => !!urVoice || androidUnlisted()
export function speak(ur: string) {
  try {
    if (!hasUrduVoice()) return false
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(ur.replace(/\u26A0\uFE0F?|["()]/g, ' ')); if (urVoice) u.voice = urVoice; u.lang = urVoice?.lang ?? 'ur-PK'; u.rate = 0.95
    speechSynthesis.speak(u); return true
  } catch { return false }
}

type Rec = { lang: string; interimResults: boolean; onresult: (e: any) => void; onerror: (e: any) => void; onend: () => void; start: () => void; stop: () => void; abort: () => void }
export const canListen = () => !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)

/** Why listening failed, in words the herder (and we) can act on. Undefined = ended normally or cancelled. */
export type ListenError = 'insecure' | 'not-allowed' | 'network' | 'no-speech' | 'audio-capture' | 'language-not-supported' | 'start-failed' | 'other'
export const LISTEN_ERROR: Record<ListenError, [string, string]> = {
  insecure: ['مائیک صرف https یا localhost پر چلتا ہے۔ کی بورڈ کا 🎤 استعمال کریں۔', 'The mic needs https or localhost. Use the keyboard mic instead.'],
  'not-allowed': ['مائیک کی اجازت نہیں ملی۔ براؤزر کی سیٹنگ میں اس سائٹ کو مائیک کی اجازت دیں۔', 'Microphone permission was denied. Allow the mic for this site in browser settings.'],
  network: ['براؤزر کی آواز پہچان انٹرنیٹ مانگتی ہے۔ آف لائن کے لیے کی بورڈ کا 🎤 استعمال کریں۔', 'Browser speech recognition needs internet. Offline, use the keyboard mic.'],
  'no-speech': ['کوئی آواز نہیں سنی۔ دوبارہ 🎤 دبا کر بولیں۔', 'No speech heard. Tap 🎤 and speak again.'],
  'audio-capture': ['کوئی مائیک نہیں ملا۔', 'No microphone found.'],
  'language-not-supported': ['یہ براؤزر اردو آواز نہیں پہچانتا۔ کی بورڈ کا 🎤 (Gboard اردو) استعمال کریں۔', 'This browser does not recognise Urdu speech. Use the keyboard mic (Gboard Urdu).'],
  'start-failed': ['مائیک شروع نہیں ہو سکا۔ دوبارہ کوشش کریں۔', 'Could not start the mic. Try again.'],
  other: ['آواز پہچاننے میں مسئلہ ہوا۔ کی بورڈ کا 🎤 استعمال کریں۔', 'Speech recognition failed. Use the keyboard mic instead.'],
}
const ERR_MAP: Record<string, ListenError> = { 'not-allowed': 'not-allowed', 'service-not-allowed': 'not-allowed', network: 'network',
  'no-speech': 'no-speech', 'audio-capture': 'audio-capture', 'language-not-supported': 'language-not-supported' }

type Session = { r: Rec; finish: (err?: ListenError) => void; cancel: () => void }
let current: Session | undefined

/**
 * Tap-to-stop: end gracefully and keep what was said (cancel = discard, e.g. leaving the screen).
 * Some mobile browsers fire 'end' late or never after stop/abort, so finish ourselves if it doesn't come.
 */
export function stopListening(cancel = false) {
  const c = current; if (!c) return
  if (cancel) c.cancel()
  try { if (cancel) c.r.abort(); else c.r.stop() } catch { /* ignore */ }
  setTimeout(() => { if (current === c) { try { c.r.abort() } catch { /* ignore */ } c.finish() } }, 1500)
}

/**
 * onPartial: words so far while speaking (shown live so the herder sees they are being heard).
 * onText: the final text (on stop, the words heard so far count as final). onEnd is called exactly once:
 * with an error if it failed, else nothing.
 */
export function listen(onText: (t: string) => void, onEnd: (err?: ListenError) => void, onPartial?: (t: string) => void) {
  const C = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!C) return false
  if (!window.isSecureContext) { onEnd('insecure'); return false }
  const r: Rec = new C(); r.lang = 'ur-PK'; r.interimResults = true
  let got = false, err: ListenError | undefined, cancelled = false, ended = false, partial = ''
  const finish = (e?: ListenError) => {
    if (ended) return
    ended = true; clearTimeout(watchdog)
    if (current?.r === r) current = undefined
    if (!got && partial && !cancelled) { got = true; onText(partial) }   // stopped mid-sentence: use what was heard
    onEnd(cancelled ? undefined : e ?? (got ? undefined : 'no-speech'))
  }
  r.onresult = e => {
    if (ended) return
    const res = e.results[e.results.length - 1], text = Array.from(e.results as ArrayLike<any>).map(x => x[0].transcript).join(' ').trim()
    if (res.isFinal) { if (text) { got = true; onText(text) } } else { partial = text; onPartial?.(text) }
  }
  r.onerror = e => { if (e?.error !== 'aborted') err = ERR_MAP[e?.error] ?? 'other'; console.warn('speech recognition error:', e?.error) }
  // Some browsers never fire an error or end when no audio arrives (e.g. no mic device): don't hang on "listening".
  const watchdog = setTimeout(() => { if (!got && !partial) { err = 'no-speech'; try { r.abort() } catch { /* ignore */ } finish(err) } }, 12000)
  r.onend = () => finish(err)
  try { r.start(); current = { r, finish, cancel: () => { cancelled = true } }; return true } catch { clearTimeout(watchdog); onEnd('start-failed'); return false }
}
