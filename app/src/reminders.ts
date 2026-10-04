import { db, type Reminder } from './db'
import { now, DAY } from './clock'
import { herdStatus, trackedSpecies, SPECIES_UR_OBL, STALE_DAYS } from './herd'

/** Bounded proactive memory: only facts derived from CHOTA's own records. No advice. */
async function proactive() {
  for (const sp of await trackedSpecies()) {
    const s = await herdStatus(sp)
    if (s.status !== 'stale' && s.status !== 'none') continue
    const kind = s.status === 'none' ? `herd_nobaseline:${sp}` : `herd_stale:${sp}`
    const recent = await db.reminders.where('kind').equals(kind)
      .filter(r => r.createdAt > now() - 3 * DAY || r.status === 'pending').count()
    if (recent) continue
    await db.reminders.add({
      text: s.status === 'none'
        ? `${SPECIES_UR_OBL[sp]} کی تبدیلیاں درج ہیں لیکن کبھی گنتی تصدیق نہیں ہوئی، اس لیے کل تعداد معلوم نہیں۔ گنتی کرنا چاہیں گے؟`
        : `${SPECIES_UR_OBL[sp]} کی گنتی ${s.daysSinceConfirmed} دن سے تصدیق نہیں ہوئی (${STALE_DAYS}+ دن)۔ آج دوبارہ گنتی کرنا چاہیں گے؟`,
      dueAt: now(), status: 'pending', source: 'system', kind, createdAt: now(),
    })
  }
}

/** Fire due reminders: returns those newly fired so the UI can show / speak / notify. */
let checking = false
export async function checkReminders(): Promise<Reminder[]> {
  if (checking) return []   // a slow check must not overlap the next tick and fire the same reminder twice
  checking = true
  try { return await fireDue() } finally { checking = false }
}
async function fireDue(): Promise<Reminder[]> {
  await proactive()
  const due = await db.reminders.where('status').equals('pending').filter(r => r.dueAt <= now()).toArray()
  for (const r of due) await db.reminders.update(r.id!, { status: 'fired', firedAt: now() })
  for (const r of due) notify(r)
  return due
}

function notify(r: Reminder) {
  const body = now() - r.dueAt > 10 * 60000 && r.source === 'user' ? `(دیر سے) ${r.text}` : r.text
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    navigator.serviceWorker?.ready.then(reg => reg.showNotification('CHOTA', { body, tag: `r${r.id}`, icon: `${import.meta.env.BASE_URL}icon-192.png` }))
      .catch(() => new Notification('CHOTA', { body }))
  } catch { /* notifications unavailable */ }
}

export async function requestNotifications() {
  try { return typeof Notification !== 'undefined' ? await Notification.requestPermission() : 'denied' } catch { return 'denied' }
}
