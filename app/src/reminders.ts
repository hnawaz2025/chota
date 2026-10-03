import { db, type Reminder } from './db'
import { now, DAY } from './clock'
import { herdStatus, trackedSpecies, SPECIES_UR, STALE_DAYS } from './herd'

/** Bounded proactive memory: only facts derived from CHOTA's own records. No advice. */
async function proactive() {
  for (const sp of await trackedSpecies()) {
    const s = await herdStatus(sp)
    if (s.status !== 'stale') continue
    const recent = await db.reminders.where('kind').equals(`herd_stale:${sp}`)
      .filter(r => r.createdAt > now() - 3 * DAY || r.status === 'pending').count()
    if (recent) continue
    await db.reminders.add({
      text: `${SPECIES_UR[sp]} کی گنتی ${s.daysSinceConfirmed} دن سے تصدیق نہیں ہوئی (${STALE_DAYS}+ دن)۔ آج دوبارہ گنتی کرنا چاہیں گے؟`,
      dueAt: now(), status: 'pending', source: 'system', kind: `herd_stale:${sp}`, createdAt: now(),
    })
  }
}

/** Fire due reminders: returns those newly fired so the UI can show / speak / notify. */
export async function checkReminders(): Promise<Reminder[]> {
  await proactive()
  const due = await db.reminders.where('status').equals('pending').filter(r => r.dueAt <= now()).toArray()
  for (const r of due) await db.reminders.update(r.id!, { status: 'fired', firedAt: now() })
  for (const r of due) notify(r)
  return due
}

function notify(r: Reminder) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    navigator.serviceWorker?.ready.then(reg => reg.showNotification('CHOTA', { body: r.text, tag: `r${r.id}`, icon: '/icon-192.png' }))
      .catch(() => new Notification('CHOTA', { body: r.text }))
  } catch { /* notifications unavailable */ }
}

export async function requestNotifications() {
  try { return typeof Notification !== 'undefined' ? await Notification.requestPermission() : 'denied' } catch { return 'denied' }
}
