/**
 * Recorded vs assumed. Pure functions over breadcrumb points and GPS fixes (no DB), so they are unit-tested.
 * A trail is a list of recorded segments. Between them are gaps where CHOTA has no data; a gap is never
 * drawn or measured as if the herder walked the straight line across it.
 */
import { distanceM, pathLengthM, type LatLon } from './geo.ts'

/** A breadcrumb: position plus the time it was measured. */
export interface Pt extends LatLon { t: number }

/** The recorder saves a point at least every 2 min while fixes arrive (gps.ts), so a longer silence means no GPS. */
export const GAP_MS = 5 * 60000
/** Faster than this between consecutive points is a GPS glitch or a vehicle, not walking with animals. */
export const JUMP_MPS = 10, JUMP_MIN_M = 300

/** Why a part of the trail is missing. */
export type GapKind = 'head' | 'silence' | 'jump' | 'tail'
/** `from`/`to` are the recorded points either side; a head gap has no `from`, a tail gap no `to`. */
export interface Gap { kind: GapKind; from?: Pt; to?: Pt; ms: number; straightM?: number }
/** A trip's breadcrumbs as recorded segments + gaps, with recorded distance and total gap time. */
export interface Trail<P extends Pt = Pt> { segments: P[][]; gaps: Gap[]; recordedM: number; gapMs: number }

/**
 * Split a trip's points (sorted by t) into recorded segments and gaps.
 * startT / endT: trip start and end (or now for an active trip); silence at either end becomes a head / tail gap.
 */
export function splitTrail<P extends Pt>(pts: P[], startT?: number, endT?: number): Trail<P> {
  const segments: P[][] = [], gaps: Gap[] = []
  if (!pts.length) {
    if (startT !== undefined && endT !== undefined && endT - startT > GAP_MS) gaps.push({ kind: 'head', ms: endT - startT })
    return { segments, gaps, recordedM: 0, gapMs: gaps.reduce((s, g) => s + g.ms, 0) }
  }
  if (startT !== undefined && pts[0].t - startT > GAP_MS) gaps.push({ kind: 'head', to: pts[0], ms: pts[0].t - startT })
  let cur: P[] = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], ms = b.t - a.t, d = distanceM(a, b)
    const kind: GapKind | undefined = ms > GAP_MS ? 'silence' : d > JUMP_MIN_M && d / Math.max(ms / 1000, 1) > JUMP_MPS ? 'jump' : undefined
    if (kind) { segments.push(cur); cur = []; gaps.push({ kind, from: a, to: b, ms, straightM: d }) }
    cur.push(b)
  }
  segments.push(cur)
  const last = pts[pts.length - 1]
  if (endT !== undefined && endT - last.t > GAP_MS) gaps.push({ kind: 'tail', from: last, ms: endT - last.t })
  return {
    segments, gaps,
    recordedM: segments.reduce((s, seg) => s + pathLengthM(seg), 0),
    gapMs: gaps.reduce((s, g) => s + g.ms, 0),
  }
}

// ---------- current position freshness ----------
/** A fix older than this is "last known", not "current". */
export const FIX_STALE_MS = 2 * 60000
/** Worse than this the fix is not used for breadcrumbs, and answers state the uncertainty. */
export const FIX_POOR_M = 100

/** How usable the current GPS fix is. */
export type FixState = 'none' | 'ok' | 'stale' | 'poor'
/** Classify a fix as ok / poor (inaccurate) / stale (too old) / none, as of nowMs. */
export function fixState(f: { t: number; acc: number } | undefined, nowMs: number): { state: FixState; ageMs: number } {
  if (!f) return { state: 'none', ageMs: Infinity }
  const ageMs = Math.max(0, nowMs - f.t)
  return { state: ageMs > FIX_STALE_MS ? 'stale' : f.acc > FIX_POOR_M ? 'poor' : 'ok', ageMs }
}

// ---------- at home ----------
/** GPS wobbles 5-15 m even standing still, so near home a distance and direction would flicker ("10 m N", "0 m", "8 m SW").
 *  Within this (or within the fix's own accuracy, if worse) the honest answer is simply "at home". */
export const AT_HOME_M = 100
/** True when the distance to home is within GPS noise (or within the fix accuracy). */
export const isAtHome = (distanceM: number, accM: number) => distanceM <= Math.max(AT_HOME_M, accM)

// ---------- forgotten trips ----------
/** No recorded point for this long, or open this long overall, and the trip is probably forgotten. */
export const FORGOTTEN_IDLE_MS = 2 * 3600000, FORGOTTEN_TOTAL_MS = 14 * 3600000
/** True when an open trip looks forgotten (long idle, or open for very long). */
export function isForgotten(startedAt: number, lastPointT: number | undefined, nowMs: number) {
  return nowMs - (lastPointT ?? startedAt) > FORGOTTEN_IDLE_MS || nowMs - startedAt > FORGOTTEN_TOTAL_MS
}

// ---------- wording ----------
/** Calendar days between t and now (local midnight to midnight), not 24-hour blocks. */
export function calendarDaysAgo(t: number, nowMs: number) {
  const a = new Date(nowMs), b = new Date(t); a.setHours(0, 0, 0, 0); b.setHours(0, 0, 0, 0)
  return Math.round((a.getTime() - b.getTime()) / 86400000)
}
/** A duration in Urdu: minutes, hours or days. */
export function spanUr(ms: number) {
  const m = Math.round(ms / 60000)
  const h = Math.round(m / 60)
  return m < 60 ? `${m} منٹ` : m < 48 * 60 ? `${h} ${h === 1 ? 'گھنٹہ' : 'گھنٹے'}` : `${Math.round(m / 1440)} دن`
}
/** A duration in English: min, h or days. */
export function spanEn(ms: number) {
  const m = Math.round(ms / 60000)
  return m < 60 ? `${m} min` : m < 48 * 60 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} days`
}
