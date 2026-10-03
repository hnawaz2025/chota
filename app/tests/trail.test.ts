import { test } from 'node:test'
import assert from 'node:assert/strict'
import { splitTrail, fixState, isForgotten, GAP_MS, FIX_STALE_MS } from '../src/trail.ts'

const MIN = 60000, T0 = new Date('2026-10-03T08:00:00').getTime()
const HOME = { lat: 29.53766, lon: 65.97213 }
/** Point `km` east of home at minute `m`. */
const pt = (m: number, km: number) => ({ t: T0 + m * MIN, lat: HOME.lat, lon: HOME.lon + km / (111.32 * Math.cos(HOME.lat * Math.PI / 180)) })
/** Walk east at ~4.8 km/h, one point every 2 min, minutes a..b. */
const walk = (a: number, b: number) => { const out = []; for (let m = a; m <= b; m += 2) out.push(pt(m, m * 0.08)); return out }

test('continuous walk: one segment, no gaps, distance = walked', () => {
  const tr = splitTrail(walk(0, 60), T0, T0 + 60 * MIN)
  assert.equal(tr.segments.length, 1); assert.equal(tr.gaps.length, 0)
  assert.ok(Math.abs(tr.recordedM - 4800) < 50, `recordedM ${tr.recordedM}`)
})

test('silence longer than GAP_MS splits the trail and is not counted as walked', () => {
  const pts = [...walk(0, 20), ...walk(60, 80)]           // screen off 20 -> 60 min
  const tr = splitTrail(pts, T0, T0 + 80 * MIN)
  assert.equal(tr.segments.length, 2); assert.equal(tr.gaps.length, 1)
  const g = tr.gaps[0]
  assert.equal(g.kind, 'silence'); assert.equal(g.ms, 40 * MIN)
  assert.ok(Math.abs(g.straightM! - 3200) < 50)
  assert.ok(Math.abs(tr.recordedM - 3200) < 50, 'only the two 1.6 km recorded segments count')
})

test('a silence of exactly GAP_MS is not a gap; just over is', () => {
  assert.equal(splitTrail([pt(0, 0), { ...pt(0, 0.1), t: T0 + GAP_MS }]).gaps.length, 0)
  assert.equal(splitTrail([pt(0, 0), { ...pt(0, 0.1), t: T0 + GAP_MS + 1 }]).gaps.length, 1)
})

test('implausible jump (GPS glitch / vehicle) is a gap even without silence', () => {
  const tr = splitTrail([pt(0, 0), pt(2, 0.15), pt(3, 5), pt(5, 5.15)])   // 4.85 km in 1 min
  assert.equal(tr.gaps.length, 1); assert.equal(tr.gaps[0].kind, 'jump')
  assert.equal(tr.segments.length, 2)
})

test('head and tail silence are reported as open-ended gaps', () => {
  const tr = splitTrail(walk(30, 40), T0, T0 + 120 * MIN)
  assert.deepEqual(tr.gaps.map(g => g.kind), ['head', 'tail'])
  assert.equal(tr.gaps[0].from, undefined); assert.equal(tr.gaps[1].to, undefined)
  assert.equal(tr.gapMs, 30 * MIN + 80 * MIN)
})

test('no points at all: whole trip is one gap', () => {
  const tr = splitTrail([], T0, T0 + 60 * MIN)
  assert.equal(tr.segments.length, 0); assert.equal(tr.gaps.length, 1); assert.equal(tr.recordedM, 0)
})

test('fix freshness: none / ok / poor / stale (stale wins over poor)', () => {
  assert.equal(fixState(undefined, T0).state, 'none')
  assert.equal(fixState({ t: T0, acc: 10 }, T0 + 30000).state, 'ok')
  assert.equal(fixState({ t: T0, acc: 250 }, T0 + 30000).state, 'poor')
  assert.equal(fixState({ t: T0, acc: 250 }, T0 + FIX_STALE_MS + 1).state, 'stale')
  assert.equal(fixState({ t: T0, acc: 10 }, T0 + 25 * MIN).ageMs, 25 * MIN)
})

test('forgotten trip: long idle or very long open', () => {
  assert.equal(isForgotten(T0, T0 + 30 * MIN, T0 + 60 * MIN), false)
  assert.equal(isForgotten(T0, T0 + 30 * MIN, T0 + 3 * 60 * MIN), true)        // 2.5 h since last point
  assert.equal(isForgotten(T0, undefined, T0 + 3 * 60 * MIN), true)             // never recorded a point
  assert.equal(isForgotten(T0, T0 + 15 * 60 * MIN, T0 + 15.5 * 60 * MIN), true) // open 15.5 h
})
