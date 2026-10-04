/** A point in degrees. */
export interface LatLon { lat: number; lon: number }

const R = 6371000, rad = (d: number) => d * Math.PI / 180, deg = (r: number) => r * 180 / Math.PI

/** Great-circle distance in metres (haversine). */
export function distanceM(a: LatLon, b: LatLon) {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
/** Initial bearing a -> b, degrees clockwise from north. */
export function bearingDeg(a: LatLon, b: LatLon) {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat))
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon))
  return (deg(Math.atan2(y, x)) + 360) % 360
}

/** The 8 compass directions, clockwise from north. */
export const DIRS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'] as const
/** One of the 8 compass directions. */
export type Dir = typeof DIRS[number]
/** Urdu names of the compass directions. */
export const DIR_UR: Record<Dir, string> = {
  north: 'شمال', northeast: 'شمال مشرق', east: 'مشرق', southeast: 'جنوب مشرق',
  south: 'جنوب', southwest: 'جنوب مغرب', west: 'مغرب', northwest: 'شمال مغرب',
}
/** Nearest of the 8 directions for a bearing in degrees. */
export const compass = (b: number): Dir => DIRS[Math.round(b / 45) % 8]

/** Length of a polyline in metres. */
export function pathLengthM(pts: LatLon[]) {
  let d = 0
  for (let i = 1; i < pts.length; i++) d += distanceM(pts[i - 1], pts[i])
  return d
}

/** Distance for display: metres (rounded to 10) below 1 km, else km with one decimal. */
export const fmtKm = (m: number) => m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`
/** fmtKm with Urdu units. */
export const fmtKmUr = (m: number) => m < 1000 ? `${Math.round(m / 10) * 10} میٹر` : `${(m / 1000).toFixed(1)} کلومیٹر`
