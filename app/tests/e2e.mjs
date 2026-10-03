// Vertical-slice e2e: runs the 12 milestone steps against the production build in a phone viewport.
import { chromium } from 'playwright'
const OUT = process.argv[2], URL = 'http://localhost:4173/'
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ur-PK' })
const p = await ctx.newPage()
const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('console', m => m.type() === 'error' && errors.push(m.text()))
const shot = async n => p.screenshot({ path: `${OUT}/${n}.png` })
const step = (n, s) => console.log(`[${n}] ${s}`)
const click = async t => p.getByText(t, { exact: false }).first().click()
const ask = async q => { await click('چھوٹا سے پوچھیں'); await p.fill('.askbar input', q); await p.press('.askbar input', 'Enter'); await p.waitForSelector('.answer'); await p.waitForTimeout(800); return (await p.textContent('.answer')).trim() }
const home = async () => { if (await p.locator('header .back').count()) await p.locator('header button.back').click().catch(() => {}); await p.waitForTimeout(300) }

await p.goto(URL); await p.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('chota') }); await p.reload(); await p.waitForTimeout(2500)
await shot('00-home-empty')
// 1. Home
await click('سیٹنگز'); await click('یہ جگہ میرا گھر ہے'); await p.waitForTimeout(500); step(1, 'home: ' + (await p.textContent('.card.set .muted')))
await home()
// 2. Herd count 47 goats
await click('ریوڑ کی گنتی'); await click('نئی قسم شامل کریں'); await p.fill('input.num', '47'); await click('کی تصدیق'); await p.waitForTimeout(500)
step(2, 'herd: ' + (await p.textContent('.card.herd')).replace(/\s+/g, ' ').slice(0, 120)); await shot('02-herd-confirmed'); await home()
// 3-4. Start trip, simulated walk
await click('سفر شروع کریں'); await p.waitForTimeout(800); await p.getByText('200 m/s').click()
for (let i = 0; i < 60; i++) { await p.waitForTimeout(1000); const t = await p.textContent('.sim'); if (+t.match(/(\d+)%/)[1] >= 50) break }
await p.getByText('⏸').click().catch(() => {})
step('3-4', 'trip stats: ' + (await p.textContent('.stats')).replace(/\s+/g, ' ')); await shot('03-trip-walking')
// 5. Save place
await click('یہ جگہ یاد رکھو'); await p.fill('.modal input', 'پرانا چارہ'); await p.locator('.modal .big-btn').click(); await p.waitForTimeout(800)
step(5, 'place: ' + (await p.textContent('.answer.small')).trim()); await shot('05-place-saved')
// 8-9 during trip: way back
await click('واپسی کا راستہ'); await p.waitForTimeout(1500); step('8-9', 'way back: ' + (await p.textContent('.answer.small')).trim()); await shot('09-way-back')
// 6. End trip + rating
await click('سفر ختم کریں'); await p.waitForSelector('.modal'); await shot('06-rate'); await p.locator('.rate .good').click(); await p.waitForTimeout(500)
const trip = await p.evaluate(() => new Promise(r => { const q = indexedDB.open('chota'); q.onsuccess = () => { const tx = q.result.transaction(['trips', 'points']); const out = {}; tx.objectStore('trips').getAll().onsuccess = e => out.trips = e.target.result; tx.objectStore('points').count().onsuccess = e => out.points = e.target.result; tx.oncomplete = () => r(out) } }))
step(6, 'db: ' + JSON.stringify(trip))
// 7. Days later: ask about good grazing
await click('سیٹنگز'); await click('+3 days'); await home()
step(7, 'good grazing: ' + await ask('پچھلی بار اچھا چارہ کہاں ملا تھا؟')); await shot('07-good-grazing')
// 8. Distance home (position is still at end of trip walk)
await home(); step(8, 'home: ' + await ask('Ghar kitni door hai?')); await shot('08-home-distance')
await home(); step('8b', 'been here: ' + await ask('Main is jagah pehle aya hoon?'))
await home(); step('8c', 'place: ' + await ask('پرانا چارہ کتنی دور ہے؟'))
// 10. Reminder
await home(); step(10, 'reminder: ' + await ask('کل صبح ریوڑ کی گنتی کرنا یاد دلانا'))
// 11. Trigger: jump +1 day and reload (scheduler runs on start and every 15 s)
await home(); await click('سیٹنگز'); await click('+1 days'); await p.reload(); await p.waitForSelector('.modal', { timeout: 20000 })
step(11, 'fired: ' + (await p.textContent('.modal')).replace(/\s+/g, ' ')); await shot('11-reminder-fired'); await p.getByText('ٹھیک ہے').first().click()
// 12. Stale herd: +14 days
await click('سیٹنگز'); await click('+14 days'); await p.reload(); await p.waitForTimeout(2500)
if (await p.locator('.modal').count()) { step('12a', 'proactive: ' + (await p.textContent('.modal')).replace(/\s+/g, ' ')); await shot('12a-proactive'); await p.getByText('بعد میں').first().click() }
await shot('12b-home-stale'); await click('ریوڑ کی گنتی'); await p.waitForTimeout(500)
step(12, 'herd: ' + (await p.textContent('.card.herd')).replace(/\s+/g, ' ')); await shot('12-herd-stale')
// reconcile by voice-style text
await home(); step('12c', 'reconcile: ' + await ask('Mere paas ab 46 bakriyan hain'))
// offline check
await ctx.setOffline(true); await p.reload(); await p.waitForTimeout(2500); await click('نقشہ و جگہیں'); await p.waitForTimeout(1500); await shot('13-offline-map')
step('offline', 'map img loaded: ' + await p.evaluate(() => [...document.querySelectorAll('img.leaflet-image-layer')].some(i => i.complete && i.naturalWidth > 0)))
console.log('ERRORS:', errors.length ? errors : 'none')
await b.close()
