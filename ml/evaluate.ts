/**
 * Test 7 evaluation: rules alone vs rules + classifier fallback, on held-out sets the model never trained on.
 * Run: node ml/evaluate.ts [extra.jsonl ...]   (each row {"text", "label"})
 * Key number: WRONG ACTIONS — a command (not "not understood") that is the wrong one. Those are what the ✓ read-back
 * has to catch; fewer is better. "Not understood" is safe but unhelpful.
 */
import { readFileSync } from 'node:fs'
import { parse } from '../app/src/nlu.ts'
import { classify, type IntentModel } from '../app/src/intentModel.ts'

const ROOT = new URL('..', import.meta.url).pathname
const model: IntentModel = JSON.parse(readFileSync(ROOT + 'app/public/data/intent-model.json', 'utf8'))
const NOW = new Date('2026-10-03T10:00:00').getTime()
const PLACES = ['پرانا چارہ', 'ٹیوب ویل', 'بڑا درخت', 'کالا پہاڑ', 'چشمہ', 'نالہ', 'قادر کا کنواں', 'سفید پتھر', 'زیارت', 'purana chara', 'tubewell', 'kala pahar']
const OOS = 'out_of_scope'

function rulesLabel(text: string): string {
  const i: any = parse(text, NOW, PLACES)
  if (i.kind === 'unknown') return OOS
  if (i.kind === 'herd_event') return 'herd_event_' + i.events[0].type
  return i.kind
}

// parity: the TS classifier must reproduce the Python export
const par = JSON.parse(readFileSync(ROOT + 'ml/parity.json', 'utf8')) as { text: string; label: string; p: number }[]
const bad = par.filter(r => { const g = classify(model, r.text)[0]; return g.label !== r.label || Math.abs(g.p - r.p) > 1e-3 })
console.log(`parity TS vs Python: ${par.length - bad.length}/${par.length}` + (bad.length ? `  e.g. ${JSON.stringify(bad[0])}` : ''))

const sets = ['ml/heldout_mine.jsonl', 'ml/heldout_test5.jsonl', ...process.argv.slice(2)]
for (const path of sets) {
  const rows = readFileSync(path.startsWith('/') ? path : ROOT + path, 'utf8').trim().split('\n').map(l => JSON.parse(l)) as { text: string; label: string }[]
  const score = (pred: (t: string) => string) => {
    let ok = 0, wrong = 0, none = 0
    for (const r of rows) {
      const p = pred(r.text)
      if (p === r.label) ok++
      else if (p === OOS) none++          // said "not understood": safe miss
      else wrong++                         // acted on the wrong command
    }
    return `correct ${String(ok).padStart(3)} (${Math.round(100 * ok / rows.length)}%)  not-understood ${String(none).padStart(3)}  WRONG ${String(wrong).padStart(3)}`
  }
  console.log(`\n${path}  (${rows.length} rows)`)
  console.log(`  rules alone              ${score(rulesLabel)}`)
  console.log(`  classifier alone         ${score(t => classify(model, t)[0].label)}`)
  const app = (t: string) => {   // exactly what the app does (answer.ts): rules, OOS veto on herd matches, classifier fallback
    const r = rulesLabel(t), g = classify(model, t)[0]
    if (r !== OOS) return r.startsWith('herd_') && g.label === OOS && g.p >= 0.7 ? OOS : r
    return g.p >= 0.5 ? g.label : OOS
  }
  console.log(`  ► APP (rules+veto+clf)    ${score(app)}`)
  for (const tau of [0.4, 0.5, 0.6, 0.7, 0.8]) {
    console.log(`  rules + clf (p ≥ ${tau.toFixed(1)})   ${score(t => { const r = rulesLabel(t); if (r !== OOS) return r; const g = classify(model, t)[0]; return g.p >= tau ? g.label : OOS })}`)
  }
}
