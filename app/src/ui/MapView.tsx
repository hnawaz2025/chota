/**
 * Offline map (Leaflet over a saved Sentinel-2 image): trails coloured by rating, gaps dotted, places, home and position.
 */
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getHome, placeIcon, type TripPoint } from '../data/db'
import { onFix, activeTrip, type Fix } from '../services/gps'
import type { MapFocus } from '../services/answer'
import { now } from '../services/clock'
import { splitTrail, fixState, GAP_MS, type Pt } from '../core/trail'

const BASE = import.meta.env.BASE_URL
const RATING_COLOR: Record<string, string> = { good: '#2e9e4f', okay: '#d9a21b', poor: '#c4442f' }
/** Where nothing was recorded: a thin dotted connector between the recorded ends, never a solid "walked" line. */
const gapStyle = (color: string): L.PolylineOptions => ({ color, weight: 2, dashArray: '1 9', lineCap: 'round', opacity: 0.95 })
const ll = (p: { lat: number; lon: number }) => [p.lat, p.lon] as [number, number]
/** Today's live trail: cream with a dark casing, so it stands out on the brown satellite image (not a rating colour). */
const LIVE = '#fff4e0', CASING = '#2a1a0e'
function drawTrail(g: L.LayerGroup, pts: Pt[], startT: number, endT: number, color: string, weight: number, casing?: string) {
  const tr = splitTrail(pts, startT, endT)
  if (casing) for (const seg of tr.segments) L.polyline(seg.map(ll), { color: casing, weight: weight + 3, opacity: 0.9 }).addTo(g)
  for (const seg of tr.segments) L.polyline(seg.map(ll), { color, weight, opacity: casing ? 1 : 0.85 }).addTo(g)
  for (const gp of tr.gaps) if (gp.from && gp.to)
    L.polyline([ll(gp.from), ll(gp.to)], gapStyle(color)).bindTooltip('ریکارڈ نہیں ہوا · not recorded').addTo(g)
}
/** Place names come from the herder's typing or voice: escape them before they go into marker HTML. */
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const icon = (html: string, cls = 'pin') => L.divIcon({ html, className: cls, iconSize: [30, 30], iconAnchor: [15, 28] })

const metaP = fetch(`${BASE}data/basemap.json`).then(r => r.json()) as Promise<{ bounds: [[number, number], [number, number]]; date: string }>
const villagesP = fetch(`${BASE}data/villages.json`).then(r => r.json()) as Promise<{ n: string; a: number; o: number }[]>
const borderP = fetch(`${BASE}data/pakistan.geojson`).then(r => r.json())

/** The map component. `focus` highlights trips / places / the way home; `allTrips` shows every trip. */
export function MapView({ focus, allTrips = false, className = 'map' }: { focus?: MapFocus; allTrips?: boolean; className?: string }) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | undefined>(undefined)
  const data = useRef<L.LayerGroup | undefined>(undefined)
  const me = useRef<L.CircleMarker | undefined>(undefined)
  const [ready, setReady] = useState(false)
  const [fix, setFix] = useState<Fix>()
  const [tick, setTick] = useState(0)
  useEffect(() => { const i = setInterval(() => setTick(x => x + 1), 10000); return () => clearInterval(i) }, [])

  const home = useLiveQuery(getHome)
  const places = useLiveQuery(() => db.places.toArray())
  const tid = activeTrip()
  const live = useLiveQuery(() => tid ? db.points.where('tripId').equals(tid).sortBy('t') : Promise.resolve([] as TripPoint[]), [tid])
  const liveTrip = useLiveQuery(() => tid ? db.trips.get(tid) : undefined, [tid])
  const tripIds = focus?.tripIds ?? []
  const trips = useLiveQuery(async () => {
    const ts = allTrips ? await db.trips.toArray() : await db.trips.bulkGet(tripIds)
    return Promise.all(ts.filter(t => t && t.id !== tid).map(async t => ({ t: t!, pts: await db.points.where('tripId').equals(t!.id!).sortBy('t') })))
  }, [allTrips, tripIds.join(','), tid])

  useEffect(() => onFix(setFix), [])

  // init once
  useEffect(() => {
    if (!el.current || map.current) return
    const m = L.map(el.current, { zoomSnap: 0.25, zoomControl: false, attributionControl: true, minZoom: 9, maxZoom: 17 })
    map.current = m
    m.setView([29.5377, 65.9721], 12)
    metaP.then(mm => {
      L.imageOverlay(`${BASE}data/basemap.jpg`, mm.bounds, { attribution: `Sentinel-2 ${mm.date}` }).addTo(m).bringToBack()
      m.setMaxBounds(L.latLngBounds(mm.bounds).pad(0.1))
    })
    borderP.then(gj => L.geoJSON(gj, { style: { color: '#b3261e', weight: 2, dashArray: '6 6', fill: false }, interactive: false }).addTo(m))
    const vl = L.layerGroup()
    villagesP.then(vs => vs.forEach(v => L.marker([v.a, v.o], { icon: L.divIcon({ className: 'village', html: v.n, iconSize: [0, 0] }), interactive: false }).addTo(vl)))
    // Zoomed out, place names pile on top of each other: show icons only (highlighted places keep their names).
    const syncVillages = () => { if (m.getZoom() >= 13) vl.addTo(m); else vl.remove(); m.getContainer().classList.toggle('z-low', m.getZoom() < 13) }
    m.on('zoomend', syncVillages); syncVillages()
    data.current = L.layerGroup().addTo(m)
    setReady(true)
    // Stop any running pan/zoom before removing the map, or its animation frame fires on a removed map (_leaflet_pos).
    return () => { m.stop(); m.off(); m.remove(); map.current = undefined }
  }, [])

  // data layers
  useEffect(() => {
    const m = map.current, g = data.current
    if (!ready || !m || !g) return
    g.clearLayers()
    const fitPts: L.LatLngExpression[] = []
    for (const { t, pts } of trips ?? []) {
      drawTrail(g, pts, t.startedAt, t.endedAt ?? now(), RATING_COLOR[t.rating ?? ''] ?? '#5b6b7a', 4)
      if (focus?.tripIds?.includes(t.id!)) fitPts.push(...pts.map(ll))
    }
    if (live?.length && liveTrip) {
      drawTrail(g, live, liveTrip.startedAt, now(), LIVE, focus?.wayBack ? 6 : 4, CASING)
      if (focus?.wayBack) { fitPts.push(...live.map(ll)); L.marker(ll(live[0]), { icon: icon('🚩') }).addTo(g) }
    }
    if (home) {
      L.marker([home.lat, home.lon], { icon: icon('🏠') }).addTo(g)
      if (focus?.homeLine && fix) fitPts.push([home.lat, home.lon], [fix.lat, fix.lon])
    }
    for (const p of places ?? []) {
      const hi = focus?.placeIds?.includes(p.id!)
      L.marker([p.lat, p.lon], { icon: icon(`<span>${placeIcon(p.type)}</span><b>${esc(p.name)}</b>`, hi ? 'pin place hi' : 'pin place') }).addTo(g)
      if (hi) fitPts.push([p.lat, p.lon])
    }
    if (allTrips) (trips ?? []).forEach(({ pts }) => pts.forEach(p => fitPts.push([p.lat, p.lon])))
    // Instant moves (no animation): smoother on cheap phones, and nothing left running if the screen changes.
    if (fitPts.length) m.fitBounds(L.latLngBounds(fitPts).pad(allTrips ? 0.06 : 0.25), { maxZoom: 15, animate: false })
    else if (fix) m.setView([fix.lat, fix.lon], Math.max(m.getZoom(), 13), { animate: false })
    // Deliberately not on every fix: re-fitting the map each second would fight the herder's own panning.
    // Position-following lines are in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, trips, live?.length, liveTrip, home, places, focus, allTrips])

  // Lines that follow the current position (home line, still-unrecorded tail) live in their own layer, redrawn on each
  // fix without re-fitting the map, so they never point from where the herder used to be.
  useEffect(() => {
    const m = map.current; if (!ready || !m) return
    const dyn = L.layerGroup().addTo(m)
    if (fix && home && focus?.homeLine) L.polyline([[fix.lat, fix.lon], [home.lat, home.lon]], { color: '#fff', weight: 2, dashArray: '4 8' }).addTo(dyn)
    const lastPt = live?.at(-1)
    if (fix && lastPt && liveTrip && fixState(fix, now()).state !== 'stale' && fix.t - lastPt.t > GAP_MS) L.polyline([ll(lastPt), ll(fix)], gapStyle(LIVE)).addTo(dyn)
    return () => { dyn.remove() }
  }, [ready, fix, home, focus, live, liveTrip])

  // my position
  useEffect(() => {
    const m = map.current; if (!ready || !m || !fix) return
    if (!me.current) me.current = L.circleMarker([fix.lat, fix.lon], { radius: 8, color: '#fff', weight: 3, fillOpacity: 1 }).addTo(m)
    else me.current.setLatLng([fix.lat, fix.lon])
    // Grey = last known position, not current.
    me.current.setStyle({ fillColor: fixState(fix, now()).state === 'stale' ? '#9e9e9e' : '#1a73e8' })
    if (tid && !focus) m.panTo([fix.lat, fix.lon], { animate: false })
  }, [ready, fix, tid, focus, tick])

  return <div ref={el} className={className} />
}

