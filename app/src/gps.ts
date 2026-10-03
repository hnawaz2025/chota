/**
 * Position source (real GPS or labelled demo simulator) + trip recorder.
 * Trip points: saved when moved >= MIN_STEP_M or MAX_GAP_MS elapsed; fixes worse than MAX_ACC_M are skipped.
 * A fix's `t` is when it was measured, not when it arrived, so a cached or old fix is never stamped as current.
 */
import { db, getHome } from './db'
import { now, advanceMs } from './clock'
import { distanceM, bearingDeg, compass, type LatLon } from './geo'
import { splitTrail, fixState, isForgotten, FIX_POOR_M } from './trail'

export interface Fix extends LatLon { acc: number; t: number }
type Listener = (f: Fix) => void

const MIN_STEP_M = 25, MAX_GAP_MS = 120000, MAX_ACC_M = FIX_POOR_M
/** Real GPS only: if no fix for this long (e.g. standing still), ask for one so silence means "no GPS", not "not moving". */
const REFRESH_AFTER_MS = 60000
const listeners = new Set<Listener>()
let last: Fix | undefined
let watchId: number | undefined
let simTimer: number | undefined
let refreshTimer: number | undefined

const lsGet = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const lsSet = (k: string, v: string | null) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch { /* ignore */ } }

export const isSimulated = () => lsGet('chota.sim') !== '0'   // demo default: simulated
export function setSimulated(on: boolean) { lsSet('chota.sim', on ? '1' : '0'); startPositioning() }

export const lastFix = () => last
export const currentFixState = () => fixState(last, now())
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

const fromPosition = (p: GeolocationPosition): Fix =>
  ({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, t: now() - Math.max(0, Date.now() - p.timestamp) })

function refresh() {
  if (isSimulated() || (last && now() - last.t < REFRESH_AFTER_MS)) return
  navigator.geolocation?.getCurrentPosition(p => emit(fromPosition(p)), () => { /* stays stale; UI says so */ },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 })
}
// Screen back on: the watch may have been suspended, so ask straight away instead of waiting for the timer.
// The browser also drops the screen wake lock whenever the page is hidden, so take it again.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { refresh(); holdScreen() } })

export function startPositioning() {
  if (watchId !== undefined) navigator.geolocation?.clearWatch(watchId)
  if (simTimer !== undefined) clearInterval(simTimer)
  if (refreshTimer !== undefined) clearInterval(refreshTimer)
  watchId = simTimer = refreshTimer = undefined
  holdScreen()   // an open trip after a reload needs the screen held too (no-op while a forgotten trip is under review)
  if (isSimulated()) { simTimer = window.setInterval(simTick, 1000); simTick(); return }
  watchId = navigator.geolocation?.watchPosition(p => emit(fromPosition(p)),
    () => { /* keep last fix; UI shows its age */ },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 })
  refreshTimer = window.setInterval(refresh, 30000)
}

// ---------- trip recorder ----------
let activeTripId: number | undefined = Number(lsGet('chota.activeTrip')) || undefined
let lastSaved: Fix | undefined
let wakeLock: { release: () => Promise<void>; released?: boolean } | undefined
export const canHoldScreen = () => 'wakeLock' in navigator
export const screenHeld = () => !!wakeLock && !wakeLock.released
/** Keep the screen on during a trip: in a web app, GPS stops when the screen goes off. */
async function holdScreen() {
  if (!activeTripId || holdRecording || screenHeld() || document.visibilityState !== 'visible') return
  try { wakeLock = await (navigator as any).wakeLock?.request('screen') } catch { /* not supported / denied */ }
}
/** While an open trip from an earlier session is being reviewed, new fixes must not be appended to it. */
let holdRecording = false
export const activeTrip = () => activeTripId

/** A fix is written as a breadcrumb only if it is accurate, fresh, and newer than the last breadcrumb. */
const recordable = (f: Fix) => f.acc <= MAX_ACC_M && fixState(f, now()).state !== 'stale' && (!lastSaved || f.t > lastSaved.t)

onFix(async f => {
  if (!activeTripId || holdRecording || !recordable(f)) return
  if (lastSaved && distanceM(lastSaved, f) < MIN_STEP_M && f.t - lastSaved.t < MAX_GAP_MS) return
  lastSaved = f
  await db.points.add({ tripId: activeTripId, t: f.t, lat: f.lat, lon: f.lon, acc: f.acc })
})

export async function startTrip() {
  if (activeTripId) return activeTripId
  activeTripId = await db.trips.add({ startedAt: now() }) as number
  lsSet('chota.activeTrip', String(activeTripId)); lastSaved = undefined; holdRecording = false
  if (last && recordable(last)) { lastSaved = last; await db.points.add({ tripId: activeTripId, t: last.t, lat: last.lat, lon: last.lon, acc: last.acc }) }
  await holdScreen()
  if (isSimulated()) simSet({ paused: false, reset: true })
  return activeTripId
}

/** Trip stats from its own recorded points only. Distance excludes gaps; furthest / direction use recorded points. */
export async function tripStats(tripId: number) {
  const [trip, pts, home] = await Promise.all([db.trips.get(tripId), db.points.where('tripId').equals(tripId).sortBy('t'), getHome()])
  const trail = splitTrail(pts, trip?.startedAt, trip?.endedAt ?? now())
  let furthest = 0, far: LatLon | undefined
  if (home) for (const p of pts) { const d = distanceM(home, p); if (d > furthest) { furthest = d; far = p } }
  return {
    points: pts, trail, distanceM: trail.recordedM, furthestFromHomeM: furthest,
    direction: home && far && furthest > 200 ? compass(bearingDeg(home, far)) : undefined,
  }
}

/**
 * End the active trip. `at` ends it at a past moment (a forgotten trip ends at its last recorded point),
 * in which case the current position is not appended: the herder may be somewhere else entirely by now.
 */
export async function endTrip(at?: number) {
  const id = activeTripId; if (!id) return
  activeTripId = undefined; lsSet('chota.activeTrip', null); holdRecording = false
  if (at === undefined && last && recordable(last)) await db.points.add({ tripId: id, t: last.t, lat: last.lat, lon: last.lon, acc: last.acc })
  await db.trips.update(id, { endedAt: at ?? now() })
  const s = await tripStats(id)
  await db.trips.update(id, { distanceM: s.distanceM, furthestFromHomeM: s.furthestFromHomeM, direction: s.direction, gapCount: s.trail.gaps.length, gapMs: s.trail.gapMs })
  try { await wakeLock?.release() } catch { /* ignore */ }
  wakeLock = undefined
  if (isSimulated()) simSet({ paused: true })
  return id
}

export interface OpenTrip { tripId: number; startedAt: number; lastPointT?: number }
/**
 * Call before startPositioning() on launch. If the open trip looks forgotten, recording is held until the
 * herder resolves it (endTrip(lastPointT) or resumeTrip()), so today's fixes are not glued onto it.
 */
export async function checkOpenTrip(): Promise<OpenTrip | undefined> {
  if (!activeTripId) return
  const trip = await db.trips.get(activeTripId)
  if (!trip || trip.endedAt) { activeTripId = undefined; lsSet('chota.activeTrip', null); return }
  const lastPointT = (await db.points.where('tripId').equals(activeTripId).sortBy('t')).at(-1)?.t
  if (!isForgotten(trip.startedAt, lastPointT, now())) return
  holdRecording = true
  return { tripId: activeTripId, startedAt: trip.startedAt, lastPointT }
}
/** Herder says they are still on this trip: keep recording; the silence stays in the record as a gap. */
export function resumeTrip() { holdRecording = false; holdScreen() }
