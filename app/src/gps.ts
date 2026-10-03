/**
 * Position source (real GPS or labelled demo simulator) + trip recorder.
 * Trip points: saved when moved >= MIN_STEP_M or MAX_GAP_MS elapsed; fixes worse than MAX_ACC_M are skipped.
 */
import { db, getHome } from './db'
import { now, advanceMs } from './clock'
import { distanceM, bearingDeg, compass, pathLengthM, type LatLon } from './geo'

export interface Fix extends LatLon { acc: number; t: number }
type Listener = (f: Fix) => void

const MIN_STEP_M = 25, MAX_GAP_MS = 120000, MAX_ACC_M = 100
const listeners = new Set<Listener>()
let last: Fix | undefined
let watchId: number | undefined
let simTimer: number | undefined

const lsGet = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const lsSet = (k: string, v: string | null) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch { /* ignore */ } }

export const isSimulated = () => lsGet('chota.sim') !== '0'   // demo default: simulated
export function setSimulated(on: boolean) { lsSet('chota.sim', on ? '1' : '0'); startPositioning() }

export const lastFix = () => last
export function onFix(fn: Listener) { listeners.add(fn); if (last) fn(last); return () => { listeners.delete(fn) } }
function emit(f: Fix) { last = f; listeners.forEach(fn => fn(f)) }

// ---------- demo simulator: a walk out from home and back, along waypoints offset from Home ----------
// Offsets in km (east, north) relative to home. Outbound west/north-west across the plain, return loop.
const SIM_ROUTE_KM: [number, number][] = [
  [0, 0], [-0.8, 0.3], [-1.6, 0.9], [-2.3, 1.8], [-3.0, 2.6], [-3.4, 3.6], [-4.1, 4.3], [-4.6, 5.0], [-4.9, 5.4],
  [-4.4, 5.9], [-3.7, 5.6], [-3.1, 4.6], [-2.2, 3.4], [-1.4, 2.0], [-0.6, 0.8], [0, 0],
]
const WALK_MPS = 1.3   // ~4.7 km/h with animals
let simIdx = 0, simFrac = 0, simSpeedMps = 40, simPaused = true
export const simState = () => ({ paused: simPaused, speed: simSpeedMps, progress: simIdx / (SIM_ROUTE_KM.length - 1) })
export function simSet(o: { paused?: boolean; speed?: number; reset?: boolean }) {
  if (o.paused !== undefined) simPaused = o.paused
  if (o.speed) simSpeedMps = o.speed
  if (o.reset) { simIdx = 0; simFrac = 0 }
}
async function simTick() {
  const home = (await getHome()) ?? { lat: 29.53766, lon: 65.97213 }
  const toLL = ([e, n]: [number, number]): LatLon =>
    ({ lat: home.lat + n / 110.57, lon: home.lon + e / (111.32 * Math.cos(home.lat * Math.PI / 180)) })
  if (!simPaused && simIdx < SIM_ROUTE_KM.length - 1) {
    const a = toLL(SIM_ROUTE_KM[simIdx]), b = toLL(SIM_ROUTE_KM[simIdx + 1])
    simFrac += simSpeedMps / Math.max(distanceM(a, b), 1)
    advanceMs(Math.max(0, simSpeedMps / WALK_MPS - 1) * 1000)   // demo clock runs at herder walking pace
    while (simFrac >= 1 && simIdx < SIM_ROUTE_KM.length - 1) { simFrac -= 1; simIdx++ }
    if (simIdx >= SIM_ROUTE_KM.length - 1) { simPaused = true; simFrac = 0 }
  }
  const a = toLL(SIM_ROUTE_KM[simIdx]), b = toLL(SIM_ROUTE_KM[Math.min(simIdx + 1, SIM_ROUTE_KM.length - 1)])
  const wob = Math.sin(now() / 7000) * 0.00012   // small natural wander
  emit({ lat: a.lat + (b.lat - a.lat) * simFrac + wob, lon: a.lon + (b.lon - a.lon) * simFrac - wob, acc: 8, t: now() })
}

export function startPositioning() {
  if (watchId !== undefined) navigator.geolocation?.clearWatch(watchId)
  if (simTimer !== undefined) clearInterval(simTimer)
  watchId = simTimer = undefined
  if (isSimulated()) { simTimer = window.setInterval(simTick, 1000); simTick(); return }
  watchId = navigator.geolocation?.watchPosition(
    p => emit({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, t: now() }),
    () => { /* keep last fix; UI shows its age */ },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 })
}

// ---------- trip recorder ----------
let activeTripId: number | undefined = Number(lsGet('chota.activeTrip')) || undefined
let lastSaved: Fix | undefined
let wakeLock: { release: () => Promise<void> } | undefined
export const activeTrip = () => activeTripId

onFix(async f => {
  if (!activeTripId || f.acc > MAX_ACC_M) return
  if (lastSaved && distanceM(lastSaved, f) < MIN_STEP_M && f.t - lastSaved.t < MAX_GAP_MS) return
  lastSaved = f
  await db.points.add({ tripId: activeTripId, t: f.t, lat: f.lat, lon: f.lon, acc: f.acc })
})

export async function startTrip() {
  if (activeTripId) return activeTripId
  activeTripId = await db.trips.add({ startedAt: now() }) as number
  lsSet('chota.activeTrip', String(activeTripId)); lastSaved = undefined
  if (last && last.acc <= MAX_ACC_M) { lastSaved = last; await db.points.add({ tripId: activeTripId, t: now(), lat: last.lat, lon: last.lon, acc: last.acc }) }
  try { wakeLock = await (navigator as any).wakeLock?.request('screen') } catch { /* not supported */ }
  if (isSimulated()) simSet({ paused: false, reset: true })
  return activeTripId
}

/** Compute trip stats from its own points (distance, furthest from home, broad direction). */
export async function tripStats(tripId: number) {
  const pts = await db.points.where('tripId').equals(tripId).sortBy('t')
  const home = await getHome()
  let furthest = 0, far: LatLon | undefined
  if (home) for (const p of pts) { const d = distanceM(home, p); if (d > furthest) { furthest = d; far = p } }
  return {
    points: pts, distanceM: pathLengthM(pts), furthestFromHomeM: furthest,
    direction: home && far && furthest > 200 ? compass(bearingDeg(home, far)) : undefined,
  }
}

export async function endTrip() {
  const id = activeTripId; if (!id) return
  activeTripId = undefined; lsSet('chota.activeTrip', null)
  if (last && last.acc <= MAX_ACC_M) await db.points.add({ tripId: id, t: now(), lat: last.lat, lon: last.lon, acc: last.acc })
  const s = await tripStats(id)
  await db.trips.update(id, { endedAt: now(), distanceM: s.distanceM, furthestFromHomeM: s.furthestFromHomeM, direction: s.direction })
  try { await wakeLock?.release() } catch { /* ignore */ }
  if (isSimulated()) simSet({ paused: true })
  return id
}
