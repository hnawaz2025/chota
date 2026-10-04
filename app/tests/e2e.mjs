// Vertical-slice e2e: the 12 milestone steps + Honest Trail checks, against the production build in a phone viewport.
// Usage: npm run build && npx vite preview --port 4173 & node tests/e2e.mjs <screenshot dir>
// Exits non-zero if any expectation fails or the page logs an error.
import { chromium } from 'playwright'
const OUT = process.argv[2] ?? '.', URL = 'http://localhost:4173/'
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ur-PK',
  permissions: ['geolocation'], geolocation: { latitude: 29.5600, longitude: 65.9400, accuracy: 12 } })
const p = await ctx.newPage()
const errors = [], fails = []
p.on('pageerror', e => errors.push(e.message)); p.on('console', m => m.type() === 'error' && errors.push(m.text()))
const shot = async n => p.screenshot({ path: `${OUT}/${n}.png` })
const step = (n, s) => console.log(`[${n}] ${s.replace(/\s+/g, ' ').slice(0, 300)}`)
const expect = (n, ok, what) => { if (!ok) { fails.push(`${n}: ${what}`); console.log(`  ✗ ${what}`) } }
const click = async t => p.getByText(t, { exact: false }).filter({ visible: true }).first().click()
/** Ask on the home-screen voice hub (typed; the mic path feeds the same box). */
const ask = async q => { await home(); await p.fill('.voice.big .askbar input', q); await p.press('.voice.big .askbar input', 'Enter'); await p.waitForSelector('.voice.big .answer'); await p.waitForTimeout(800); return (await p.textContent('.voice.big .answer')).trim() }
const home = async () => { if (await p.locator('header button.back').count()) await p.locator('header button.back').click().catch(() => {}); await p.waitForTimeout(300) }
/** Queued reminders pop up once trip prompts are resolved; snooze them so they don't block navigation. */
const dismissReminders = async () => { for (let i = 0; i < 5 && await p.locator('.modal').count(); i++) { await p.getByText('بعد میں').first().click().catch(() => {}); await p.waitForTimeout(300) } }
const settings = async () => { await dismissReminders(); await home(); await click('سیٹنگز') }
const dump = () => p.evaluate(() => new Promise(r => { const q = indexedDB.open('chota'); q.onsuccess = () => { const tx = q.result.transaction(['trips', 'points', 'herdEvents', 'confirmations']); const out = {}; for (const s of ['trips', 'points', 'herdEvents', 'confirmations']) tx.objectStore(s).getAll().onsuccess = e => out[s] = e.target.result; tx.oncomplete = () => r(out) } }))

await p.goto(URL); await p.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('chota') }); await p.reload(); await p.waitForTimeout(2500)
await shot('00-home-empty')
// 1. Home
await click('سیٹنگز'); await click('یہ جگہ میرا گھر ہے'); await p.waitForTimeout(500)
const h1 = await p.textContent('.card.set .muted'); step(1, 'home: ' + h1); expect(1, /29\.5/.test(h1), 'home saved')
await home()
// 2. Herd count 47 goats
await click('ریوڑ کی گنتی'); await click('نئی قسم شامل کریں'); await p.fill('input.num', '47'); await click('کی تصدیق'); await p.waitForTimeout(500)
const h2 = await p.textContent('.card.herd'); step(2, 'herd: ' + h2); expect(2, h2.includes('47'), '47 confirmed'); await shot('02-herd-confirmed'); await home()
// 3-4. Start trip, simulated walk
await click('سفر شروع کریں'); await p.waitForTimeout(800); await p.getByText('200 m/s').click()
for (let i = 0; i < 60; i++) { await p.waitForTimeout(1000); const t = await p.textContent('.sim'); if (+t.match(/(\d+)%/)[1] >= 50) break }
await p.getByText('⏸').click().catch(() => {})
const h3 = await p.textContent('.stats'); step('3-4', 'trip stats: ' + h3); expect('3-4', /[1-9]\.\d km/.test(h3), 'distance recorded'); await shot('03-trip-walking')
expect('3-4', !(await p.locator('.warn-line.gps').count()), 'no GPS warning while simulated GPS is live')
// 5. Save place
await click('یہ جگہ یاد رکھو'); await p.fill('.modal input', 'پرانا چارہ'); await p.locator('.modal .big-btn').click(); await p.waitForTimeout(800)
const h5 = await p.textContent('.answer.small'); step(5, 'place: ' + h5); expect(5, h5.includes('یاد رکھ لی'), 'place saved'); await shot('05-place-saved')
// 8-9 during trip: way back
await click('واپسی کا راستہ'); await p.waitForTimeout(1500)
const h9 = await p.textContent('.answer.small'); step('8-9', 'way back: ' + h9); expect('8-9', h9.includes('ریکارڈ شدہ راستہ') && !h9.includes('ریکارڈ نہیں ہوا'), 'way back, no gap caveat'); await shot('09-way-back')
// 6. End trip + rating
await click('سفر ختم کریں'); await p.waitForSelector('.modal'); await shot('06-rate'); await p.locator('.rate .good').click(); await p.waitForTimeout(500)
const d6 = await dump(); step(6, `db: trips=${JSON.stringify(d6.trips)} points=${d6.points.length}`)
expect(6, d6.trips[0]?.endedAt && d6.trips[0].rating === 'good' && d6.trips[0].gapCount === 0, 'trip ended, rated, no gaps')
// 7. Days later: ask about good grazing
await settings(); await click('+3 days'); await home()
const h7 = await ask('پچھلی بار اچھا چارہ کہاں ملا تھا؟'); step(7, 'good grazing: ' + h7); expect(7, h7.includes('3 دن پہلے') && h7.includes('میرے ریکارڈ میں'), 'grazing 3 days ago, framed as my records'); await shot('07-good-grazing')
// 8. Distance home (position is still at end of trip walk)
await home(); const h8 = await ask('Ghar kitni door hai?'); step(8, 'home: ' + h8); expect(8, h8.includes('کلومیٹر') && !h8.includes('آخری GPS'), 'fresh home distance'); await shot('08-home-distance')
await home(); const h8b = await ask('Main is jagah pehle aya hoon?'); step('8b', 'been here: ' + h8b); expect('8b', h8b.includes('1 بار') && h8b.includes('میرے ریکارڈ میں'), 'one recorded visit, framed as my records')
await home(); const h8d = await ask('Is mahine kitne trips kiye?'); step('8d', 'month: ' + h8d); expect('8d', h8d.includes('میرے ریکارڈ میں') && h8d.includes('CHOTA پر شروع'), 'month count scoped to recorded trips')
await home(); const h8e = await ask('Pichli dafa junoob kab gaya tha?'); step('8e', 'south: ' + h8e); expect('8e', h8e.includes('ریکارڈ نہ ہوا ہو'), 'no record != never went')
await home(); const h8c = await ask('پرانا چارہ کتنی دور ہے؟'); step('8c', 'place: ' + h8c); expect('8c', h8c.includes('میٹر'), 'place distance')
// 10. Reminder
const nRem = () => p.evaluate(() => new Promise(r => { const q = indexedDB.open('chota'); q.onsuccess = () => { q.result.transaction('reminders').objectStore('reminders').count().onsuccess = e => r(e.target.result) } }))
// R1. A rejected reminder read-back writes nothing.
const r0 = await nRem(); const hr = await ask('پرسوں شام پانی بھرنا ہے'); step('R1', 'read-back: ' + hr)
await click('نہیں، غلط ہے'); await p.waitForTimeout(400); expect('R1', hr.includes('میں نے سمجھا') && await nRem() === r0, 'rejected reminder not saved')
// 10. Reminder: read back, saved on ✓
const h10 = await ask('کل صبح ریوڑ کی گنتی کرنا یاد دلانا'); step(10, 'reminder read-back: ' + h10)
expect(10, h10.includes('کل صبح 8 بجے') && await nRem() === r0, 'reminder tomorrow 8am read back, not yet saved')
await click('ہاں، درج کریں'); await p.waitForTimeout(500); expect(10, await nRem() === r0 + 1, 'reminder saved after yes')
// 11. Trigger: jump +1 day and reload (scheduler runs on start and every 15 s)
await settings(); await click('+1 days'); await p.reload(); await p.waitForSelector('.modal', { timeout: 20000 })
const h11 = await p.textContent('.modal'); step(11, 'fired: ' + h11); expect(11, h11.includes('ریوڑ کی گنتی'), 'reminder fired'); await shot('11-reminder-fired'); await p.getByText('ٹھیک ہے').first().click()
// 12. Stale herd: +14 days
await settings(); await click('+14 days'); await p.reload(); await p.waitForTimeout(2500)
if (await p.locator('.modal').count()) { step('12a', 'proactive: ' + await p.textContent('.modal')); await shot('12a-proactive'); await p.getByText('بعد میں').first().click() }
await shot('12b-home-stale'); await click('ریوڑ کی گنتی'); await p.waitForTimeout(500)
const h12 = await p.textContent('.card.herd'); step(12, 'herd: ' + h12); expect(12, h12.includes('18 دن'), 'stale warning'); await shot('12-herd-stale')
// reconcile by voice-style text: read back first, written only after "yes"
const nConf = (await dump()).confirmations.length
await home(); const h12c = await ask('Mere paas ab 46 bakriyan hain'); step('12c', 'read-back: ' + h12c)
expect('12c', h12c.includes('میں نے یہ سمجھا') && h12c.includes('46'), 'read-back before saving')
expect('12c', (await dump()).confirmations.length === nConf, 'nothing written before confirmation')
await click('ہاں، درج کریں'); await p.waitForTimeout(600); const h12d = await p.textContent('.answer'); step('12c', 'confirmed: ' + h12d)
expect('12c', h12d.includes('تصدیق شدہ گنتی') && (await dump()).confirmations.length === nConf + 1, 'recount 46 written after yes')

// N1. A reminder due while the app was closed is shown, but labelled late (not as if on time).
await home(); await ask('2 ghante baad pani check karna yaad dilana'); await click('ہاں، درج کریں'); await p.waitForTimeout(400)
await settings(); await click('+1 days'); await p.reload(); await p.waitForTimeout(2500)
let n1 = ''
for (let i = 0; i < 5 && await p.locator('.modal').count(); i++) {   // several reminders may be queued
  const t = await p.textContent('.modal'); if (t.includes('پانی') || t.includes('pani')) { n1 = t; await shot('N1-late-reminder') }
  await p.getByText('ٹھیک ہے').first().click().catch(() => {}); await p.waitForTimeout(400)
}
step('N1', 'late reminder: ' + n1); expect('N1', n1.includes('دیر سے'), 'late reminder labelled late')

// ---------------- Herd-count safety ----------------
// H1. Rejected read-back writes nothing.
const nEv = (await dump()).herdEvents.length
await home(); const hh1 = await ask('دو بکریاں بیچیں'); step('H1', 'read-back: ' + hh1)
await click('نہیں، غلط ہے'); await p.waitForTimeout(500)
expect('H1', (await dump()).herdEvents.length === nEv, 'rejected sale not written')
// H2. Species with no baseline + no number said: assumed qty is called out; after "yes" the change is visible, total unknown.
await home(); const hh2 = await ask('bher mar gayi'); step('H2', 'read-back: ' + hh2)
expect('H2', hh2.includes('ایک مانی'), 'assumed quantity called out')
await click('ہاں، درج کریں'); await p.waitForTimeout(600); const hh2b = await p.textContent('.answer'); step('H2', 'saved: ' + hh2b)
expect('H2', hh2b.includes('کل تعداد معلوم نہیں'), 'no-baseline total stated as unknown')
await home(); const warns = (await p.locator('.warn').allTextContents()).join(' | '); step('H2', 'home warnings: ' + warns)
expect('H2', warns.includes('کبھی تصدیق نہیں'), 'home flags never-counted species')
await click('ریوڑ کی گنتی'); await p.waitForTimeout(500)
const cards = (await p.locator('.card.herd').allTextContents()).join(' | '); step('H2', 'herd cards: ' + cards); await shot('H2-herd-nobaseline')
expect('H2', cards.includes('کوئی تصدیق شدہ گنتی نہیں') && cards.includes('−1'), 'sheep card shows change without baseline')
// offline check
await ctx.setOffline(true); await p.reload(); await p.waitForTimeout(2500); await dismissReminders(); await click('نقشہ و جگہیں'); await p.waitForTimeout(1500); await shot('13-offline-map')
const off = await p.evaluate(() => [...document.querySelectorAll('img.leaflet-image-layer')].some(i => i.complete && i.naturalWidth > 0))
step('offline', 'map img loaded: ' + off); expect('offline', off, 'offline basemap')
await ctx.setOffline(false)

// V1. Voice-first: start a trip by voice on home; end it by voice on the trip screen (confirmed), then rating.
await dismissReminders(); await home(); await p.fill('.voice.big .askbar input', 'chalo trip shuru karein'); await p.press('.voice.big .askbar input', 'Enter'); await p.waitForTimeout(1200)
const v1 = (await p.locator('.trip-screen').count()) ? 'on trip screen' : 'still home'
step('V1', 'start: ' + v1); expect('V1', await p.locator('.trip-screen').count() === 1, 'voice "start trip" opens a running trip')
await p.fill('.trip-voice .askbar input', 'trip khatam'); await p.press('.trip-voice .askbar input', 'Enter'); await p.waitForTimeout(800)
const v1b = await p.textContent('.trip-voice .answer'); step('V1', 'end read-back: ' + v1b); expect('V1', v1b.includes('ختم کر دوں'), 'end trip asks first')
expect('V1', await p.locator('.trip-screen').count() === 1, 'trip not ended before confirmation')
await click('ہاں، ختم کریں'); await p.waitForTimeout(800)
const v1c = (await p.locator('.modal').count()) ? await p.textContent('.modal') : ''; step('V1', 'after yes: ' + v1c)
expect('V1', v1c.includes('چارہ کیسا تھا'), 'rating asked after voice end'); if (v1c) await click('چھوڑیں')

// A1/A2. AI fallback: an unfamiliar phrasing is handled by the on-device classifier (shown as a guess or as choices);
// an out-of-scope health question is declined instead of answered with the herd count.
await dismissReminders(); const a1 = await ask('pichli dafa kitne ghante bahar raha'); step('A1', 'ai: ' + a1)
expect('A1', (await p.locator('.voice.big .ai-tag, .voice.big .choices').count()) > 0 && !a1.includes('آخری تصدیق'), 'unfamiliar phrasing goes to the classifier, not the herd count')
const a2 = await ask('بکری کو بخار ہے کیا کروں'); step('A2', 'oos: ' + a2); expect('A2', a2.includes('CHOTA کا کام نہیں'), 'animal-health question declined as out of scope')

// ---------------- Honest Trail ----------------
// T1. Forgotten trip: start, walk a bit, "come back" a day later. App must ask, and end it at the last recorded point.
await home(); await click('سفر شروع کریں'); await p.waitForTimeout(800); await p.getByText('200 m/s').click(); await p.waitForTimeout(2000)
// P1. Naming a place freezes the spot and pauses the demo walk; tag is saved; the walk resumes afterwards.
const pct = async () => p.evaluate(() => document.querySelector('.sim').textContent.match(/(\d+)%/)[1]).then(Number)
await click('یہ جگہ یاد رکھو'); await p.waitForTimeout(300); const p0 = await pct(); await p.waitForTimeout(2000); const p1 = await pct()
const pm = await p.textContent('.modal'); step('P1', `naming open: walk ${p0}% -> ${p1}% · ${pm}`); expect('P1', p0 === p1 && pm.includes('demo walk paused'), 'demo walk paused while naming')
await p.locator('.chips.tags button').first().click(); await p.fill('.modal input', 'چشمہ'); await p.locator('.modal .big-btn').click(); await p.waitForTimeout(600)
const pa = await p.textContent('.answer.small'); const pl = (await p.evaluate(() => new Promise(r => { const q = indexedDB.open('chota'); q.onsuccess = () => { q.result.transaction('places').objectStore('places').getAll().onsuccess = e => r(e.target.result) } }))).find(x => x.name === 'چشمہ')
step('P1', `saved: ${pa} · type=${pl?.type}`); expect('P1', pl?.type === 'water' && pa.includes('💧'), 'place saved with water tag')
await p.waitForTimeout(2000); const p2 = await pct(); step('P1', `after save: walk ${p2}%`); expect('P1', p2 > p1, 'demo walk resumes after naming')
await p.getByText('⏸').click().catch(() => {})
await settings(); await click('+1 days'); await p.reload(); await p.waitForTimeout(2500)
const t1 = (await p.locator('.modal').count()) ? await p.textContent('.modal') : ''
step('T1', 'open-trip prompt: ' + t1); expect('T1', t1.includes('ابھی تک کھلا ہے'), 'forgotten-trip prompt shown'); await shot('T1-forgotten-trip')
const before = await dump()
await click('آخری ریکارڈ شدہ جگہ پر ختم کریں'); await p.waitForTimeout(800)
if (await p.locator('.modal').count()) await click('چھوڑیں')
const after = await dump(), ft = after.trips.at(-1), fpts = after.points.filter(x => x.tripId === ft.id)
step('T1', `ended at ${ft.endedAt}, last point ${Math.max(...fpts.map(x => x.t))}, points before/after ${before.points.length}/${after.points.length}`)
expect('T1', ft.endedAt === Math.max(...fpts.map(x => x.t)), 'trip ends at its last recorded point, not now')
expect('T1', before.points.length === after.points.length, 'no new fixes appended to the forgotten trip')

await p.waitForTimeout(500); await dismissReminders()
// T2. Demo history includes a trip with a 50-min screen-off gap: listed as gap, drawn dotted, caveated.
await settings(); await click('Load demo history'); await p.waitForTimeout(800); await home(); await click('پرانے سفر'); await p.waitForTimeout(500)
const rows = await p.locator('.card.row.trip').allTextContents(); const gapRow = rows.findIndex(r => r.includes('gap'))
step('T2', 'history: ' + rows.join(' | ')); expect('T2', gapRow >= 0, 'history shows a trip with a gap')
if (gapRow >= 0) { await p.locator('.card.row.trip').nth(gapRow).click(); await p.waitForTimeout(1200) }
const dotted = await p.locator('path[stroke-dasharray="1 9"]').count(); step('T2', `dotted gap paths: ${dotted}`); expect('T2', dotted >= 1, 'gap drawn dotted'); await shot('T2-gap-dotted')

// T3. Real GPS, then the fix goes stale (clock +1 day without a new fix): answers say "last known", saving is refused.
// a fresh position (the emulated fix carries the time it was set; the run is now > 2 min, which would make it stale)
await ctx.setGeolocation({ latitude: 29.5600, longitude: 65.9400, accuracy: 12 })
await settings(); await p.locator('label', { hasText: 'Demo GPS' }).locator('input').click(); await p.waitForTimeout(2000)
await home(); const t3a = await ask('Ghar kitni door hai?'); step('T3', 'fresh: ' + t3a); expect('T3', t3a.includes('کلومیٹر') && !t3a.includes('آخری GPS'), 'fresh real-GPS answer')
await settings(); await click('+1 days'); await home()
const t3b = await ask('Ghar kitni door hai?'); step('T3', 'stale: ' + t3b); expect('T3', t3b.includes('آخری GPS') && t3b.includes('معلوم نہیں'), 'stale fix reported as last known')
await home(); const t3c = await ask('Is jagah ko Test yaad rakho'); step('T3', 'save on stale: ' + t3c); expect('T3', t3c.includes('محفوظ نہیں کی'), 'refuses to save place from stale fix'); await shot('T3-stale')

console.log('ERRORS:', errors.length ? errors : 'none')
console.log(fails.length ? `FAILED ${fails.length}:\n  ${fails.join('\n  ')}` : 'ALL EXPECTATIONS PASS')
await b.close()
process.exitCode = fails.length || errors.length ? 1 : 0
