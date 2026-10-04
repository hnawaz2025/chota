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
  ['میرے ریوڑ کی گنتی کتنی ہے', 'herd_status', () => true],       // was a reminder ("نی ہے")
  ['میرے ریوڑ کی کل گنتی کتنی ہے', 'herd_status', () => true],    // was a reminder for tomorrow ("کل" = total)
  ['ریوڑ کتنا ہے', 'herd_status', () => true],
  ['mere rewar ki ginti kitni hai', 'herd_status', () => true],
  ['meri kul bakriyan kitni hain', 'herd_status', () => true],
  ['میرے ریوڑ کی گنتی کیا ہے', 'herd_status', () => true],
  ['کل گنتی کرنی ہے', 'reminder', (i: any) => new Date(i.dueAt).getDate() === 4],
  ['کیا کل گنتی کرنا یاد دلا سکتے ہو؟', 'reminder', () => true],
  ['السلام علیکم', 'unknown', () => true],
  ['aaj kahan jaun garmi bohot hai zyada dur nhi ja sakhta aur herd ko pani ki bohot zaroorat hai', 'plan_today', i => i.water && i.shade && i.near],
  ['آج ریوڑ کہاں لے جاؤں؟ پانی چاہیے', 'plan_today', i => i.water && !i.near],
  ['پانی کہاں ملے گا', 'plan_today', i => i.water],
  // reported by the user (speech typing: اج for آج, ریور for ریوڑ); was a reminder for 1 am
  ['اج بہت گرمی ہے اور میں نے اپنے ریور کو پانی پلانے جانا ہے تو کس طرف جاؤں', 'plan_today', i => i.water && i.shade],
  ['آج گرمی ہے ریوڑ کو کس طرف لے جاؤں', 'plan_today', i => i.shade],
  ['aaj kis taraf jaun pani chahiye', 'plan_today', i => i.water],
  ['جانور پیاسے ہیں کدھر لے کر جاؤں', 'plan_today', i => i.water],
  ['گھر کس طرف ہے', 'home_distance', () => true],
  ['واپس کیسے جاؤں راستہ دکھاؤ', 'way_back', () => true],
  ['کل صبح ٹیوب ویل جانا ہے', 'reminder', () => true],
  ['اج شام پانی بھرنا یاد دلانا', 'reminder', (i: any) => new Date(i.dueAt).getDate() === 3 && new Date(i.dueAt).getHours() === 17],
  ['where should i go today, not far', 'plan_today', i => i.near && !i.water],
  ['سفر شروع کرو', 'start_trip', () => true],
  ['chalo trip shuru karein', 'start_trip', () => true],
  ["let's start the trip", 'start_trip', () => true],
  ['سفر شروع کرنا ہے', 'start_trip', () => true],
  ['بکریاں چرانے جا رہا ہوں', 'start_trip', () => true],
  ['کل صبح سفر شروع کرنا یاد دلانا', 'reminder', () => true],
  ['سفر ختم کرو', 'end_trip', () => true],
  ['trip khatam', 'end_trip', () => true],
  ['ghar pohanch gaya', 'end_trip', () => true],
  ['کل صبح ٹیوب ویل جانا ہے', 'reminder', () => true],
  ['کل صبح 6:00 بجے ریوڑ کو سفر پہ لے کے جانا ہے یاد دلانا مجھے', 'reminder', (i: any) => { const t = new Date(i.dueAt); return t.getDate() === 4 && t.getHours() === 6 && t.getMinutes() === 0 }],
  ['remind me tomorrow at 6', 'reminder', (i: any) => { const t = new Date(i.dueAt); return t.getDate() === 4 && t.getHours() === 6 && t.getMinutes() === 0 && i.assumed === 'am' }],
  ['kal shaam 6 baje pani check karna yaad dilana', 'reminder', (i: any) => { const t = new Date(i.dueAt); return t.getDate() === 4 && t.getHours() === 18 && t.getMinutes() === 0 }],
  ['کل چھ بجے یاد دلانا', 'reminder', (i: any) => { const t = new Date(i.dueAt); return t.getDate() === 4 && t.getHours() === 6 && t.getMinutes() === 0 && i.assumed === 'am' }],
  ['کل ساڑھے چھ بجے یاد دلانا', 'reminder', (i: any) => { const t = new Date(i.dueAt); return t.getDate() === 4 && t.getHours() === 6 && t.getMinutes() === 30 }],
  ['کل دو بجے دوائی لانی ہے', 'reminder', (i: any) => { const t = new Date(i.dueAt); return t.getDate() === 4 && t.getHours() === 14 && t.getMinutes() === 0 && i.assumed === 'pm' }],
  ['آج رات 9 بجے یاد دلانا', 'reminder', (i: any) => { const t = new Date(i.dueAt); return t.getDate() === 3 && t.getHours() === 21 && t.getMinutes() === 0 }],
  ['4 بجے یاد دلانا', 'reminder', (i: any) => { const t = new Date(i.dueAt); return t.getDate() === 3 && t.getHours() === 16 && t.getMinutes() === 0 }],
  ['کل یاد دلانا', 'reminder', (i: any) => { const t = new Date(i.dueAt); return t.getDate() === 4 && t.getHours() === 9 && t.getMinutes() === 0 && i.assumed === 'no_time' }],
  ['پانی بھرنا یاد دلانا', 'reminder', (i: any) => i.assumed === 'no_date_or_time'],
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
