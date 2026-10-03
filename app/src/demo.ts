/** Demo history for the hackathon walkthrough. Clearly labelled demo data; never mixed with real use. */
import { db, setHome } from './db'
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

export async function loadDemo() {
  await clearAll()
  await setHome(DEMO_HOME.lat, DEMO_HOME.lon, now() - 30 * DAY)
  // earlier trips: west (poor, phone screen was off for ~50 min on the way out), north-east hills (okay), south (okay)
  await pastTrip(19, [[0, 0], [-2, -0.3], [-4.5, -0.6], [-6, 0.2], [-3, 0.4], [0, 0]], 6, 'poor', [60, 110])
  await pastTrip(12, [[0, 0], [1.5, 1.5], [3, 3.5], [3.8, 4.6], [2, 2.5], [0, 0]], 5, 'okay')
  await pastTrip(6, [[0, 0], [0.3, -2], [0.8, -4], [-0.2, -5.2], [0, -2.5], [0, 0]], 4.5, 'okay')
  await db.places.add({ name: 'ٹیوب ویل', type: 'water', lat: km(0.6, -1.2).lat, lon: km(0.6, -1.2).lon, createdAt: now() - 25 * DAY, note: 'چچا کا ٹیوب ویل' })
}

export async function clearAll() {
  await Promise.all([db.confirmations.clear(), db.herdEvents.clear(), db.trips.clear(), db.points.clear(),
    db.places.clear(), db.reminders.clear(), db.settings.clear()])
  try { localStorage.removeItem('chota.activeTrip') } catch { /* ignore */ }
}
