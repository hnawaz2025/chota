// Layout check: Urdu/English labels never touch, icons never overlap text, text stays inside its box.
// Usage: npm run build && npx vite preview --port 4173 &  node tests/layout.mjs [baseUrl]
// Runs 390×844 and 360×740, in the dark default theme and ☀️ sun mode, over the main screens and modals. Exits non-zero on any violation.
// Glyph boxes come from Range.getClientRects() (the font's real content area, which for Nastaliq is taller than
// the CSS line box), so this is stricter than comparing element boxes.
import { chromium } from 'playwright'
const URL = process.argv[2] ?? 'http://localhost:4173/'
const MIN_GAP = 4      // px between the Urdu glyph box and the English glyph box
const INSET = 2        // px: text/icons must sit at least this far inside their box

/** Runs in the page: returns a list of violations for the current DOM. */
function audit({ MIN_GAP, INSET }) {
  const BOX = 'button, .card, .tile, .modal, .answer, .warn, .warn-line, .homechip, .sethome, .spot, .kb-hint, .rec-line, .gap-flag, .chip, .confirmed, .estimate, .badge, .stats > div, summary, .screen-note.strong, .count'
  const ICON = '.ic, .emoji, .tag-icon, .fic, .recdot'
  const out = []
  const vis = r => r.width > 0 && r.height > 0
  const skip = el => !el || el.closest('.leaflet-container, script, style') || !el.getClientRects().length
  const rangeRects = node => { const r = document.createRange(); r.selectNodeContents(node); return [...r.getClientRects()].filter(vis) }
  const union = rs => rs.length ? rs.reduce((a, r) => ({ left: Math.min(a.left, r.left), right: Math.max(a.right, r.right), top: Math.min(a.top, r.top), bottom: Math.max(a.bottom, r.bottom) }), { left: 1e9, right: -1e9, top: 1e9, bottom: -1e9 }) : undefined
  const label = el => {
    const c = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''
    return `${el.tagName.toLowerCase()}${c}`
  }
  const txt = el => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
  /** Box bounds, extended by any scrolled-away content (modals scroll). */
  const bounds = box => {
    const r = box.getBoundingClientRect(), cs = getComputedStyle(box)
    const top = r.top - box.scrollTop, bt = parseFloat(cs.borderTopWidth), bl = parseFloat(cs.borderLeftWidth), br = parseFloat(cs.borderRightWidth), bb = parseFloat(cs.borderBottomWidth)
    const h = Math.max(r.height, box.scrollHeight + bt + bb)
    return { left: r.left + bl + INSET, right: r.right - br - INSET, top: top + bt + INSET, bottom: top + h - bb - INSET }
  }
  const inside = (a, b) => a.left >= b.left - .5 && a.right <= b.right + .5 && a.top >= b.top - .5 && a.bottom <= b.bottom + .5
  const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > .5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > .5

  // (a) Urdu above English: no intersection, at least MIN_GAP between glyph boxes.
  for (const tx of document.querySelectorAll('.tx')) {
    if (skip(tx)) continue
    const ur = tx.querySelector(':scope > .ur'), en = tx.querySelector(':scope > .en')
    if (!ur || !en) continue
    const u = union(rangeRects(ur)), e = union(rangeRects(en))
    if (!u || !e) continue
    const gap = e.top - u.bottom
    if (gap < MIN_GAP) out.push({ kind: 'ur/en gap', sel: label(tx.parentElement), text: txt(ur), detail: `gap ${gap.toFixed(1)}px` })
  }
  // (b) Every visible text node and icon lies inside its nearest box.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim() || skip(n.parentElement)) continue
    const box = n.parentElement.closest(BOX); if (!box) continue
    const g = union(rangeRects(n)); if (!g) continue
    const b = bounds(box)
    if (!inside(g, b)) out.push({ kind: 'text outside box', sel: label(box), text: n.textContent.trim().slice(0, 40),
      detail: `L${(g.left - b.left).toFixed(0)} R${(b.right - g.right).toFixed(0)} T${(g.top - b.top).toFixed(0)} B${(b.bottom - g.bottom).toFixed(0)}` })
  }
  for (const ic of document.querySelectorAll(ICON)) {
    if (skip(ic)) continue
    const box = ic.parentElement.closest(BOX); if (!box) continue
    const r = ic.getBoundingClientRect(), b = bounds(box)
    if (!inside(r, b)) out.push({ kind: 'icon outside box', sel: label(box), text: txt(ic), detail: '' })
  }
  // (c) Icons never overlap their siblings (elements or bare text).
  for (const ic of document.querySelectorAll(ICON)) {
    if (skip(ic)) continue
    const a = ic.getBoundingClientRect()
    for (const sib of ic.parentElement.childNodes) {
      if (sib === ic) continue
      const rs = sib.nodeType === 3 ? (sib.textContent.trim() ? rangeRects(sib) : []) : sib.nodeType === 1 && !skip(sib) ? [...sib.querySelectorAll('*')].concat(sib).flatMap(x => [...x.childNodes].filter(t => t.nodeType === 3 && t.textContent.trim()).flatMap(rangeRects)).concat(sib.matches(ICON) ? [sib.getBoundingClientRect()] : []) : []
      if (rs.some(r => hit(a, r))) out.push({ kind: 'icon overlaps', sel: label(ic.parentElement), text: `${txt(ic)} ↔ ${(sib.textContent ?? '').trim().slice(0, 30)}`, detail: '' })
    }
  }
  return out
}

const b = await chromium.launch()
const all = []
for (const [w, h] of [[390, 844], [390, 664], [360, 740]]) for (const theme of ['dark', 'sun']) {   // dark = default, sun = ☀️ sun mode
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: 'ur-PK',
    permissions: ['geolocation'], geolocation: { latitude: 29.5600, longitude: 65.9400, accuracy: 12 } })
  const p = await ctx.newPage()
  const errors = []; p.on('pageerror', e => errors.push(e.message))
  const tag = `${w}×${h} ${theme}`
  const check = async screen => {
    await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(150)
    for (const v of await p.evaluate(audit, { MIN_GAP, INSET })) all.push({ at: `${tag} ${screen}`, ...v })
  }
  const click = async t => p.getByText(t, { exact: false }).filter({ visible: true }).first().click()
  const home = async () => { if (await p.locator('header button.back').count()) await p.locator('header button.back').click().catch(() => {}); await p.waitForTimeout(250) }
  const dismiss = async () => { for (let i = 0; i < 6 && await p.locator('.modal').count(); i++) { await check('reminder pop-up'); await p.getByText('بعد میں').first().click().catch(() => {}); await p.waitForTimeout(250) } }
  const ask = async q => { await dismiss(); await home(); await p.fill('.voice.big .askbar input', q); await p.press('.voice.big .askbar input', 'Enter'); await p.waitForTimeout(700) }

  await p.goto(URL); await p.evaluate(t => { localStorage.clear(); if (t === 'sun') localStorage.setItem('chota.theme', 'sun'); indexedDB.deleteDatabase('chota') }, theme); await p.reload(); await p.waitForTimeout(2000)
  if ((await p.evaluate(() => document.documentElement.dataset.theme ?? 'dark')) !== (theme === 'sun' ? 'light' : 'dark')) all.push({ at: tag, kind: 'theme not applied', sel: 'html', text: theme, detail: '' })
  await check('home empty')
  // The home screen fits one phone screen without scrolling (the last row of buttons is visible).
  { const over = await p.evaluate(() => Math.round(document.querySelector('.row3').getBoundingClientRect().bottom - innerHeight))
    if (over > 0) all.push({ at: `${tag} home empty`, kind: 'home does not fit the screen', sel: '.row3', text: `last row ${over}px below the screen`, detail: '' }) }
  await p.locator('details.examples-box summary').click(); await check('home examples open'); await p.locator('details.examples-box summary').click()
  await click('سیٹنگز'); await click('یہ جگہ میرا گھر ہے'); await p.waitForTimeout(300); await check('settings'); await home()
  await click('ریوڑ کی گنتی'); await click('نئی قسم شامل کریں'); await check('count pad'); await p.fill('input.num', '47'); await click('کی تصدیق'); await p.waitForTimeout(300); await home()
  await ask('دو بکریاں بیچیں'); await check('home read-back'); await click('ہاں، درج کریں'); await p.waitForTimeout(300)
  await ask('bher mar gayi'); await click('ہاں، درج کریں'); await p.waitForTimeout(300)
  await ask('کل صبح ریوڑ کی گنتی کرنا یاد دلانا'); await ask('2 ghante baad pani check karna yaad dilana')
  await ask('گھر کتنی دور ہے؟'); await check('home answer')
  await dismiss(); await home(); await click('ریوڑ کی گنتی'); await p.waitForTimeout(300); await check('herd (estimate + never counted)')
  await p.getByText('تبدیلی درج کریں').first().click(); await check('event pad'); await p.mouse.click(5, 5); await home()
  await click('یاد دہانیاں'); await p.waitForTimeout(300); await check('reminders'); await home()
  // trip
  await dismiss(); await click('سفر شروع کریں'); await p.waitForTimeout(800); await p.getByText('200 m/s').click(); await p.waitForTimeout(3000)
  await p.getByText('⏸').click().catch(() => {}); await dismiss(); await check('trip')
  await click('یہ جگہ یاد رکھو'); await p.waitForTimeout(300); await p.fill('.modal input', 'چشمہ'); await check('naming modal')
  await p.locator('.modal .big-btn').click(); await p.waitForTimeout(500)
  await click('واپسی کا راستہ'); await p.waitForTimeout(800); await check('trip way back')
  await home(); await check('home trip running'); await click('سفر جاری ہے'); await p.waitForTimeout(400)
  await dismiss(); await click('سفر ختم کریں'); await p.waitForSelector('.modal'); await check('rating modal'); await click('چھوڑیں'); await p.waitForTimeout(300)
  // stale goats: +15 days
  await dismiss(); await home(); await click('سیٹنگز'); await click('+14 days'); await click('+1 days'); await p.reload(); await p.waitForTimeout(2000)
  await dismiss(); await check('home stale'); await click('ریوڑ کی گنتی'); await p.waitForTimeout(300); await check('herd (stale + never counted)'); await home()
  // history with a gap trip
  await click('سیٹنگز'); await click('Load demo history'); await p.waitForTimeout(600); await home(); await click('پرانے سفر'); await p.waitForTimeout(400)
  const rows = await p.locator('.card.row.trip').allTextContents(); const gi = rows.findIndex(r => r.includes('gap'))
  if (gi >= 0) { await p.locator('.card.row.trip').nth(gi).click(); await p.waitForTimeout(800) }
  await check('history'); await home(); await click('نقشہ و جگہیں'); await p.waitForTimeout(800); await check('map & places')
  if (errors.length) all.push({ at: tag, kind: 'page error', sel: '', text: errors.join(' | '), detail: '' })
  await ctx.close()
}
await b.close()
const seen = new Set(), uniq = all.filter(v => { const k = `${v.at}|${v.kind}|${v.sel}|${v.text}`; return !seen.has(k) && seen.add(k) })
for (const v of uniq) console.log(`✗ [${v.at}] ${v.kind}: ${v.sel} “${v.text}” ${v.detail}`)
console.log(uniq.length ? `LAYOUT VIOLATIONS: ${uniq.length}` : 'LAYOUT OK: 0 violations')
process.exitCode = uniq.length ? 1 : 0
