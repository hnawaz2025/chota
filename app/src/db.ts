import Dexie, { type EntityTable } from 'dexie'

export type Species = 'goat' | 'sheep' | 'camel' | 'cattle'
export type HerdEventType = 'birth' | 'purchase' | 'sale' | 'death' | 'loss' | 'slaughter' | 'other'
export type Rating = 'good' | 'okay' | 'poor'
export type PlaceType = 'grazing' | 'water' | 'home' | 'other'

/** A physical count the herder confirmed. The only authoritative number. */
export interface HerdConfirmation {
  id?: number; species: Species; count: number; confirmedAt: number
  source: 'manual' | 'voice' | 'reconcile'
}
/** A count-changing event recorded since some confirmation. Estimates are derived, never stored. */
export interface HerdEvent {
  id?: number; species: Species; delta: number; type: HerdEventType; at: number
  sourceText?: string; tripId?: number
}
export interface Trip {
  id?: number; startedAt: number; endedAt?: number
  distanceM?: number; furthestFromHomeM?: number; direction?: string  // 8-way compass key from home
  rating?: Rating | null
}
export interface TripPoint { id?: number; tripId: number; t: number; lat: number; lon: number; acc?: number }
export interface Place {
  id?: number; name: string; type: PlaceType; lat: number; lon: number; createdAt: number
  note?: string; tripId?: number
}
export interface Reminder {
  id?: number; text: string; dueAt: number; status: 'pending' | 'fired' | 'done' | 'dismissed'
  source: 'user' | 'system'; kind?: string; placeId?: number; createdAt: number; firedAt?: number
}
export interface Setting { key: string; value: unknown }

export const db = new Dexie('chota') as Dexie & {
  confirmations: EntityTable<HerdConfirmation, 'id'>
  herdEvents: EntityTable<HerdEvent, 'id'>
  trips: EntityTable<Trip, 'id'>
  points: EntityTable<TripPoint, 'id'>
  places: EntityTable<Place, 'id'>
  reminders: EntityTable<Reminder, 'id'>
  settings: EntityTable<Setting, 'key'>
}
db.version(1).stores({
  confirmations: '++id, species, confirmedAt',
  herdEvents: '++id, species, at',
  trips: '++id, startedAt, endedAt, rating',
  points: '++id, tripId, t',
  places: '++id, name, type, createdAt',
  reminders: '++id, status, dueAt, kind',
  settings: 'key',
})

export interface Home { lat: number; lon: number; setAt: number }
export async function getHome(): Promise<Home | undefined> {
  return (await db.settings.get('home'))?.value as Home | undefined
}
export async function setHome(lat: number, lon: number, at: number) {
  await db.settings.put({ key: 'home', value: { lat, lon, setAt: at } })
}
