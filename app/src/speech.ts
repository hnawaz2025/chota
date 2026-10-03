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
    const u = new SpeechSynthesisUtterance(ur.replace(/[⚠️"()]/g, ' ')); if (urVoice) u.voice = urVoice; u.lang = urVoice?.lang ?? 'ur-PK'; u.rate = 0.95
    speechSynthesis.speak(u); return true
  } catch { return false }
}

type Rec = { lang: string; interimResults: boolean; onresult: (e: any) => void; onerror: (e: any) => void; onend: () => void; start: () => void; abort: () => void }
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

let current: Rec | undefined
export function stopListening() { try { current?.abort() } catch { /* ignore */ } }

/**
 * onPartial: words so far while speaking (shown live so the herder sees they are being heard).
 * onText: the final text. onEnd is called exactly once: with an error if it failed, else nothing.
 */
export function listen(onText: (t: string) => void, onEnd: (err?: ListenError) => void, onPartial?: (t: string) => void) {
  const C = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!C) return false
  if (!window.isSecureContext) { onEnd('insecure'); return false }
  const r: Rec = new C(); r.lang = 'ur-PK'; r.interimResults = true
  let got = false, err: ListenError | undefined, aborted = false
  let heard = false
  r.onresult = e => {
    const res = e.results[e.results.length - 1], text = Array.from(e.results as ArrayLike<any>).map(x => x[0].transcript).join(' ').trim()
    if (text) heard = true
    if (res.isFinal) { got = true; if (text) onText(text) } else onPartial?.(text)
  }
  r.onerror = e => { if (e?.error === 'aborted') aborted = true; else err = ERR_MAP[e?.error] ?? 'other'; console.warn('speech recognition error:', e?.error) }
  // Some browsers never fire an error or end when no audio arrives (e.g. no mic device): don't hang on "listening".
  const watchdog = setTimeout(() => { if (current === r && !got && !heard) { err = 'no-speech'; try { r.abort() } catch { /* ignore */ } } }, 12000)
  r.onend = () => { clearTimeout(watchdog); current = undefined; onEnd(err ?? (got || aborted ? undefined : 'no-speech')) }
  try { r.start(); current = r; return true } catch { clearTimeout(watchdog); onEnd('start-failed'); return false }
}
