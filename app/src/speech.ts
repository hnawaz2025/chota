/** Voice as progressive enhancement. Urdu TTS if the device has a voice; recognition only where the browser offers it. */
let urVoice: SpeechSynthesisVoice | undefined
function pickVoice() {
  try { urVoice = speechSynthesis.getVoices().find(v => v.lang.toLowerCase().startsWith('ur')) } catch { /* no TTS */ }
}
try { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice } catch { /* no TTS */ }

export const hasUrduVoice = () => !!urVoice
export function speak(ur: string) {
  try {
    if (!urVoice) return false
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(ur.replace(/[⚠️"()]/g, ' ')); u.voice = urVoice; u.lang = urVoice.lang; u.rate = 0.95
    speechSynthesis.speak(u); return true
  } catch { return false }
}

type Rec = { lang: string; interimResults: boolean; onresult: (e: any) => void; onerror: () => void; onend: () => void; start: () => void }
export const canListen = () => !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
export function listen(onText: (t: string) => void, onEnd: () => void) {
  const C = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!C) return false
  const r: Rec = new C(); r.lang = 'ur-PK'; r.interimResults = false
  r.onresult = e => onText(e.results[0][0].transcript); r.onerror = onEnd; r.onend = onEnd
  try { r.start(); return true } catch { return false }
}
