import { db, type HerdConfirmation, type HerdEvent, type Species } from './db'
import { now, DAY } from './clock'

export const STALE_DAYS = 14
export const SPECIES_UR: Record<Species, string> = { goat: 'بکریاں', sheep: 'بھیڑیں', camel: 'اونٹ', cattle: 'گائیں' }
/** Oblique plural ("بکریوں کی گنتی") and singular ("1 بکری") — Urdu needs both. */
export const SPECIES_UR_OBL: Record<Species, string> = { goat: 'بکریوں', sheep: 'بھیڑوں', camel: 'اونٹوں', cattle: 'گایوں' }
export const SPECIES_UR_ONE: Record<Species, string> = { goat: 'بکری', sheep: 'بھیڑ', camel: 'اونٹ', cattle: 'گائے' }
export const countUr = (n: number, s: Species) => `${n} ${n === 1 ? SPECIES_UR_ONE[s] : SPECIES_UR[s]}`
export const SPECIES_EN: Record<Species, string> = { goat: 'Goats', sheep: 'Sheep', camel: 'Camels', cattle: 'Cattle' }

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

export async function confirmCount(species: Species, count: number, source: HerdConfirmation['source']) {
  return db.confirmations.add({ species, count, confirmedAt: now(), source })
}
