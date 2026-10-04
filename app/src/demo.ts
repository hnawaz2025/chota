/** Demo history for the hackathon walkthrough. Clearly labelled demo data; never mixed with real use. */
import { db, setHome, type Place } from './db'
import { now, DAY } from './clock'
import { compass, bearingDeg, distanceM } from './geo'
import { splitTrail } from './trail'

export const DEMO_HOME = { lat: 29.53766, lon: 65.97213 }   // Kili Jamaldini, Nushki (GeoNames)

const km = (e: number, n: number) => ({
  lat: DEMO_HOME.lat + n / 110.57, lon: DEMO_HOME.lon + e / (111.32 * Math.cos(DEMO_HOME.lat * Math.PI / 180)),
})

/**
 * A past trip walked at herding pace with a breadcrumb every 2 min (as the recorder saves them).
 * `offMin`: [from, to] minutes into the walk when the phone recorded nothing (screen off), kept as a real gap.
 */
async function pastTrip(daysAgo: number, route: [number, number][], hours: number, rating: 'good' | 'okay' | 'poor', offMin?: [number, number]) {
  const start = now() - daysAgo * DAY - 4 * 3600000, end = start + hours * 3600000
  const id = await db.trips.add({ startedAt: start, endedAt: end, rating }) as number
  const legs = route.slice(1).map((r, i) => Math.hypot(r[0] - route[i][0], r[1] - route[i][1]))
  const total = legs.reduce((s, x) => s + x, 0), n = Math.floor(hours * 30)
  const pts: { t: number; lat: number; lon: number }[] = []
  for (let k = 0; k <= n; k++) {
    const min = k * 2
    if (offMin && min > offMin[0] && min < offMin[1]) continue
    let d = total * k / n, i = 0
    while (i < legs.length - 1 && d > legs[i]) d -= legs[i++]
    const f = legs[i] ? d / legs[i] : 0, [e0, n0] = route[i], [e1, n1] = route[i + 1]
    pts.push({ t: start + min * 60000, ...km(e0 + (e1 - e0) * f + Math.sin(k / 3) * 0.04, n0 + (n1 - n0) * f + Math.cos(k / 4) * 0.04) })
  }
  await db.points.bulkAdd(pts.map(p => ({ tripId: id, acc: 10, ...p })))
  const tr = splitTrail(pts, start, end)
  let far = pts[0], fd = 0
  for (const p of pts) { const d = distanceM(DEMO_HOME, p); if (d > fd) { fd = d; far = p } }
  await db.trips.update(id, { distanceM: tr.recordedM, furthestFromHomeM: fd, direction: compass(bearingDeg(DEMO_HOME, far)), gapCount: tr.gaps.length, gapMs: tr.gapMs })
  return id
}

/**
 * Demo area around Kili Jamaldini (offsets in km east/north of home). A herder's own memory after ~6 weeks:
 * water points, grazing spots, shade, landmarks, rated trips in every direction, herd history, a reminder.
 * Everything is labelled demo data; ages differ on purpose so "old record" warnings show up.
 */
export async function loadDemo() {
  await clearAll()
  await setHome(DEMO_HOME.lat, DEMO_HOME.lon, now() - 50 * DAY)
  const R: [number, number] = [0, 0]
  // trips: [days ago, route, hours, rating, screen-off minutes]
  const east = await pastTrip(44, [R, [2, 0.2], [4.5, 0.4], [4.8, -0.6], [2.2, -0.3], R], 5, 'poor')
  const spring = await pastTrip(33, [R, [1.5, 1.6], [3.1, 3.7], [3.6, 4.4], [2, 2.3], R], 6, 'good')
  const south = await pastTrip(26, [R, [0.4, -2.1], [0.3, -4.5], [-0.4, -5], [0, -2.4], R], 5, 'okay')
  await pastTrip(19, [R, [-2, -0.3], [-4.5, -0.6], [-6, 0.2], [-3, 0.4], R], 6, 'poor', [60, 110])   // west, 50 min screen-off gap
  const pond = await pastTrip(15, [R, [-1.8, -0.6], [-4.6, -1], [-5, -1.6], [-2.4, -0.8], R], 5.5, 'okay')
  const oldChara = await pastTrip(12, [R, [-1.2, 0.8], [-2.2, 1.6], [-2.5, 1.9], [-1.4, 1], R], 5, 'good')
  const karez = await pastTrip(9, [R, [-1, 0.5], [-1.8, 0.9], [-2.2, 1.4], [-1.2, 0.8], R], 4.5, 'good')
  await pastTrip(6, [R, [0.3, -2], [0.2, -4.6], [-0.3, -5.1], [0, -2.5], R], 4.5, 'okay')
  await pastTrip(3, [R, [1, -1.2], [2, -2.5], [2.6, -3], [1.2, -1.4], R], 4, 'okay')
  await pastTrip(1, [R, [-1.1, 0.6], [-2, 1.2], [-2.3, 1.1], [-1.2, 0.5], R], 4, 'good')
  const place = (name: string, type: Place['type'], e: number, n: number, daysAgo: number, note?: string, tripId?: number, acc = 10) =>
    db.places.add({ name, type, ...km(e, n), createdAt: now() - daysAgo * DAY, note, tripId, acc })
  // water
  await place('ٹیوب ویل', 'water', 0.6, -1.2, 25, 'چچا کا ٹیوب ویل')
  await place('کاریز', 'water', -1.8, 0.9, 9, 'پانی کم تھا', karez)
  await place('چشمہ', 'water', 3.1, 3.7, 33, undefined, spring)
  await place('بارش کا تالاب', 'water', -4.6, -1, 15, 'بارش کے بعد بھرا تھا', pond)
  // grazing
  await place('پرانا چارہ', 'grazing', -2.3, 1.7, 12, undefined, oldChara)
  await place('سبز نالہ', 'grazing', 3.4, 4.2, 33, undefined, spring)
  await place('جنوبی میدان', 'grazing', 0.3, -4.5, 26, 'جھاڑیاں زیادہ', south)
  // shade + landmarks
  await place('بڑا درخت', 'shade', -1.6, 1.2, 9, undefined, karez)
  await place('کیکر کے درخت', 'shade', 0.9, -1, 25)
  await place('سفید پتھر', 'landmark', 4.5, 0.5, 44, undefined, east)
  await place('زیارت', 'landmark', -0.8, 2.6, 30)
  // herd: counted 8 days ago, changes since (estimate differs from count)
  await db.confirmations.bulkAdd([{ species: 'goat', count: 46, confirmedAt: now() - 8 * DAY, source: 'manual' }, { species: 'sheep', count: 18, confirmedAt: now() - 8 * DAY, source: 'manual' }])
  await db.herdEvents.bulkAdd([
    { species: 'goat', delta: 2, type: 'birth', at: now() - 6 * DAY, sourceText: 'دو میمنے پیدا ہوئے' },
    { species: 'sheep', delta: -1, type: 'sale', at: now() - 4 * DAY, sourceText: 'ایک بھیڑ بیچی' },
    { species: 'goat', delta: -1, type: 'death', at: now() - 2 * DAY, sourceText: 'ایک بکری مر گئی' },
  ])
  const due = new Date(now() + DAY); due.setHours(8, 0, 0, 0)
  await db.reminders.add({ text: 'کاریز پر پانی دیکھنا', dueAt: due.getTime(), status: 'pending', source: 'user', createdAt: now() })
}

export async function clearAll() {
  await Promise.all([db.confirmations.clear(), db.herdEvents.clear(), db.trips.clear(), db.points.clear(),
    db.places.clear(), db.reminders.clear(), db.settings.clear()])
  try { localStorage.removeItem('chota.activeTrip') } catch { /* ignore */ }
}
