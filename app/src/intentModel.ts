/**
 * CHOTA's on-device intent classifier (Test 7). A tiny trained model (char n-gram TF-IDF + logistic regression,
 * trained in ml/train.py) that only picks one of CHOTA's fixed commands, with a confidence. It never generates text.
 * Used only when the rules don't understand; every herd/reminder/trip change it leads to is still read back for ✓.
 */
import { normalize } from './nlu.ts'

export interface IntentModel { labels: string[]; intercept: number[]; features: Record<string, [number, Record<string, number>]> }
export interface Guess { label: string; p: number }

/** Must match ml/train.py features(). */
export function features(text: string): string[] {
  const toks = normalize(text)
  const out = toks.map(w => 'w:' + w)
  for (const w of toks) {
    const s = [...(' ' + w + ' ')]
    for (const n of [2, 3, 4]) for (let i = 0; i + n <= s.length; i++) out.push(s.slice(i, i + n).join(''))
  }
  return out
}

/** Labels ranked by probability. */
export function classify(m: IntentModel, text: string): Guess[] {
  const cnt = new Map<string, number>()
  for (const f of features(text)) if (m.features[f]) cnt.set(f, (cnt.get(f) ?? 0) + 1)
  const x: [string, number][] = [...cnt].map(([f, c]) => [f, (1 + Math.log(c)) * m.features[f][0]])
  const norm = Math.sqrt(x.reduce((s, [, v]) => s + v * v, 0)) || 1
  const s = [...m.intercept]
  for (const [f, v] of x) for (const [k, w] of Object.entries(m.features[f][1])) s[+k] += w * v / norm
  const mx = Math.max(...s), e = s.map(v => Math.exp(v - mx)), z = e.reduce((a, b) => a + b, 0)
  return e.map((v, i) => ({ label: m.labels[i], p: v / z })).sort((a, b) => b.p - a.p)
}
