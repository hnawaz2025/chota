/** Demo history for the hackathon walkthrough. Clearly labelled demo data; never mixed with real use. */
import { db, setHome } from './db'
import { now, DAY } from './clock'
import { compass, bearingDeg, distanceM, pathLengthM } from './geo'

export const DEMO_HOME = { lat: 29.53766, lon: 65.97213 }   // Kili Jamaldini, Nushki (GeoNames)

const km = (e: number, n: number) => ({
  lat: DEMO_HOME.lat + n / 110.57, lon: DEMO_HOME.lon + e / (111.32 * Math.cos(DEMO_HOME.lat * Math.PI / 180)),
})

async function pastTrip(daysAgo: number, route: [number, number][], hours: number, rating: 'good' | 'okay' | 'poor') {
  const start = now() - daysAgo * DAY - 4 * 3600000
  const id = await db.trips.add({ startedAt: start, endedAt: start + hours * 3600000, rating }) as number
  const pts: { lat: number; lon: number }[] = []
  for (let i = 0; i < route.length - 1; i++)
    for (let s = 0; s < 10; s++) {
      const [e0, n0] = route[i], [e1, n1] = route[i + 1]
      pts.push(km(e0 + (e1 - e0) * s / 10 + Math.sin(i * 3 + s) * 0.05, n0 + (n1 - n0) * s / 10 + Math.cos(i * 2 + s) * 0.05))
    }
  pts.push(km(...route.at(-1)!))
  await db.points.bulkAdd(pts.map((p, i) => ({ tripId: id, t: start + i * (hours * 3600000 / pts.length), lat: p.lat, lon: p.lon, acc: 10 })))
  let far = pts[0], fd = 0
  for (const p of pts) { const d = distanceM(DEMO_HOME, p); if (d > fd) { fd = d; far = p } }
  await db.trips.update(id, { distanceM: pathLengthM(pts), furthestFromHomeM: fd, direction: compass(bearingDeg(DEMO_HOME, far)) })
  return id
}

export async function loadDemo() {
  await clearAll()
  await setHome(DEMO_HOME.lat, DEMO_HOME.lon, now() - 30 * DAY)
  // earlier trips: west (poor), north-east hills (okay), south (okay)
  await pastTrip(19, [[0, 0], [-2, -0.3], [-4.5, -0.6], [-6, 0.2], [-3, 0.4], [0, 0]], 6, 'poor')
  await pastTrip(12, [[0, 0], [1.5, 1.5], [3, 3.5], [3.8, 4.6], [2, 2.5], [0, 0]], 5, 'okay')
  await pastTrip(6, [[0, 0], [0.3, -2], [0.8, -4], [-0.2, -5.2], [0, -2.5], [0, 0]], 4.5, 'okay')
  await db.places.add({ name: 'ٹیوب ویل', type: 'water', lat: km(0.6, -1.2).lat, lon: km(0.6, -1.2).lon, createdAt: now() - 25 * DAY, note: 'چچا کا ٹیوب ویل' })
}

export async function clearAll() {
  await Promise.all([db.confirmations.clear(), db.herdEvents.clear(), db.trips.clear(), db.points.clear(),
    db.places.clear(), db.reminders.clear(), db.settings.clear()])
  try { localStorage.removeItem('chota.activeTrip') } catch { /* ignore */ }
}
