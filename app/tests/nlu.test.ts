import { parse } from '../src/nlu.ts'
const NOW = new Date('2026-10-03T10:00:00').getTime()
const places = ['Purana Chara', 'پرانا چارہ', 'ٹیوب ویل']
const cases: [string, string, (i: any) => boolean][] = [
  ['Is jagah ko Purana Chara yaad rakho', 'save_place', i => i.name === 'Purana Chara'],
  ['اس جگہ کو پرانا چارہ یاد رکھو', 'save_place', i => i.name === 'پرانا چارہ' && i.placeType === 'grazing'],
  ['Ghar kitni door hai?', 'home_distance', () => true],
  ['گھر کس طرف ہے؟', 'home_distance', () => true],
  ['Mera wapas ka rasta dikhao', 'way_back', () => true],
  ['میرا واپسی کا راستہ دکھاؤ', 'way_back', () => true],
  ['Pichli baar acha chara kahan mila tha?', 'good_grazing', () => true],
  ['پچھلی بار اچھا چارہ کہاں ملا تھا؟', 'good_grazing', () => true],
  ['Jahan acha chara mila tha woh dikhao', 'good_grazing', () => true],
  ['Pichli dafa northwest kab gaya tha?', 'last_trip_dir', i => i.dir === 'northwest'],
  ['پچھلی دفعہ شمال مغرب کب گیا تھا؟', 'last_trip_dir', i => i.dir === 'northwest'],
  ['Is mahine kitne grazing trips kiye?', 'trips_this_month', () => true],
  ['Pichli trip kitni dair ki thi?', 'last_trip_duration', () => true],
  ['Main is jagah pehle aya hoon?', 'been_here', () => true],
  ['Pichli baar yahan kab aya tha?', 'been_here', () => true],
  ['Purana Chara kitni door hai?', 'place_distance', i => i.name === 'Purana Chara'],
  ['Kal subah tubewell jana hai', 'reminder', i => new Date(i.dueAt).getDate() === 4 && new Date(i.dueAt).getHours() === 8],
  ['Kal herd count karna yaad dilana', 'reminder', i => new Date(i.dueAt).getDate() === 4],
  ['Teen din baad Purana Chara dobara check karna', 'reminder', i => new Date(i.dueAt).getDate() === 6],
  ['کل صبح ریوڑ کی گنتی کرنا یاد دلانا', 'reminder', i => new Date(i.dueAt).getHours() === 8],
  ['Mere paas ab 46 bakriyan hain', 'herd_confirm', i => i.counts[0].count === 46 && i.counts[0].species === 'goat'],
  ['میرے پاس سینتالیس بکریاں ہیں', 'herd_confirm', i => i.counts[0].count === 47],
  ['کل ملا کے 42 بکریاں اور 17 بھیڑیں ہیں', 'herd_confirm', i => i.counts.length === 2 && i.counts[1].count === 17],
  ['دو بکریاں بیچیں', 'herd_event', i => i.events[0].type === 'sale' && i.events[0].qty === 2],
  ['ek bakri ne bacha diya', 'herd_event', i => i.events[0].type === 'birth'],
  ['ایک بکری اور دو بھیڑیں مر گئیں', 'herd_event', i => i.events.length === 2 && i.events[1].qty === 2],
  ['تین نہیں چار بکریاں بیچیں', 'herd_event', i => i.events[0].qty === 4],
  ['ایک بکری اور دو بھیڑیں مر گئیں', 'herd_event', i => i.events.every((e: any) => !e.qtyAssumed)],
  ['bakri mar gayi', 'herd_event', i => i.events[0].qty === 1 && i.events[0].qtyAssumed],
  ['dawai li aur bakri ko di', 'unknown', () => true],   // Test 5: an LLM turned this into a death
  ['kitni bakriyan hain?', 'herd_status', () => true],
  ['السلام علیکم', 'unknown', () => true],
]
let pass = 0
for (const [t, kind, check] of cases) {
  const i = parse(t, NOW, places) as any
  const ok = i.kind === kind && check(i)
  pass += +ok
  if (!ok) console.log('✗', t, '->', JSON.stringify(i))
}
console.log(`${pass}/${cases.length} intent cases pass`)
// place tags suggested from the spoken / typed name
import { placeTypeOf } from '../src/nlu.ts'
const tags: [string, string | undefined][] = [['پانی کا تالاب', 'water'], ['Chashma', 'water'], ['اچھی گھاس', 'grazing'], ['purana chara', 'grazing'],
  ['بڑا درخت', 'shade'], ['سفید پتھر', 'landmark'], ['قادر بخش', undefined]]
for (const [n, t] of tags) { const ok = placeTypeOf(n) === t; pass += +ok; if (!ok) console.log('✗ tag', n, '->', placeTypeOf(n)) }
console.log(`${tags.length} place-tag cases checked`)
process.exitCode = pass === cases.length + tags.length ? 0 : 1
