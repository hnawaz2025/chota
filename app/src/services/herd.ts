/**
 * Herd memory: a physical count is the only confirmed number; the estimate is always derived (count + recorded changes).
 */
import { db, type HerdConfirmation, type HerdEvent, type Species } from '../data/db'
import { now, DAY } from './clock'

/** After this many days without a recount, the count is "stale". */
export const STALE_DAYS = 14
/** Urdu plural name of each species. */
export const SPECIES_UR: Record<Species, string> = { goat: 'بکریاں', sheep: 'بھیڑیں', camel: 'اونٹ', cattle: 'گائیں' }
/** Oblique plural ("بکریوں کی گنتی") and singular ("1 بکری") — Urdu needs both. */
export const SPECIES_UR_OBL: Record<Species, string> = { goat: 'بکریوں', sheep: 'بھیڑوں', camel: 'اونٹوں', cattle: 'گایوں' }
/** Urdu singular name of each species. */
export const SPECIES_UR_ONE: Record<Species, string> = { goat: 'بکری', sheep: 'بھیڑ', camel: 'اونٹ', cattle: 'گائے' }
/** A number with the right Urdu form ("1 بکری", "5 بکریاں"). */
export const countUr = (n: number, s: Species) => `${n} ${n === 1 ? SPECIES_UR_ONE[s] : SPECIES_UR[s]}`
/** English name of each species. */
export const SPECIES_EN: Record<Species, string> = { goat: 'Goats', sheep: 'Sheep', camel: 'Camels', cattle: 'Cattle' }

/** Confirmed count, changes since, estimate and status for one species. */
export interface HerdStatus {
  species: Species
  confirmed?: HerdConfirmation
  eventsSince: HerdEvent[]
  additions: number; removals: number
  estimate?: number
  daysSinceConfirmed?: number
  status: 'none' | 'confirmed' | 'estimated' | 'stale'
}

/** Confirmed count is authoritative; estimate = confirmed + explicitly recorded events since. */
export async function herdStatus(species: Species): Promise<HerdStatus> {
  const confirmed = (await db.confirmations.where('species').equals(species).sortBy('confirmedAt')).at(-1)
  const all = await db.herdEvents.where('species').equals(species).sortBy('at')
  const eventsSince = confirmed ? all.filter(e => e.at > confirmed.confirmedAt) : all
  const additions = eventsSince.filter(e => e.delta > 0).reduce((s, e) => s + e.delta, 0)
  const removals = -eventsSince.filter(e => e.delta < 0).reduce((s, e) => s + e.delta, 0)
  if (!confirmed) return { species, eventsSince, additions, removals, status: 'none' }
  const days = Math.floor((now() - confirmed.confirmedAt) / DAY)
  return {
    species, confirmed, eventsSince, additions, removals,
    estimate: confirmed.count + additions - removals,
    daysSinceConfirmed: days,
    status: days >= STALE_DAYS ? 'stale' : eventsSince.length ? 'estimated' : 'confirmed',
  }
}

/** Species with a confirmed count OR any recorded change: a change without a baseline must still be visible. */
export async function trackedSpecies(): Promise<Species[]> {
  const s = new Set<Species>([...(await db.confirmations.toArray()), ...(await db.herdEvents.toArray())].map(c => c.species))
  return (['goat', 'sheep', 'camel', 'cattle'] as Species[]).filter(x => s.has(x))
}

/** Record a physical count (the new confirmed number). */
export async function confirmCount(species: Species, count: number, source: HerdConfirmation['source'], extra: { tripId?: number; expected?: number } = {}) {
  return db.confirmations.add({ species, count, confirmedAt: now(), source, ...extra })
}
