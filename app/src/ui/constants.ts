/** UI constants: screens, the one icon per feature, species icons, and safe localStorage helpers. */
import { type Species } from '../data/db'

/** The app screens. */
export type Screen = 'home' | 'trip' | 'reminders' | 'herd' | 'map' | 'history' | 'settings'
/** localStorage read that never throws (private mode). */
export const lsGet = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
/** localStorage write that never throws. */
export const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } }

/**
 * One icon + one colour per feature, used on tiles, buttons, answers and cards alike, so a herder who does not read
 * can still tell "this is about my herd" from "this is about the way home". Colours live in index.css (--trip, --herd…).
 */
export type Feature = 'trip' | 'place' | 'home' | 'herd' | 'rem'
/** The one icon per feature. */
export const ICON: Record<Feature, string> = { trip: '👣', place: '📍', home: '🏠', herd: '🐐', rem: '🔔' }
/** Icon per species. */
export const SPECIES_IC: Record<Species, string> = { goat: '🐐', sheep: '🐑', camel: '🐪', cattle: '🐄' }

/** Which feature an answer belongs to (drives its icon and border colour). */
export const FEATURE_OF: Record<string, Feature> = {
  start_trip: 'trip', end_trip: 'trip', good_grazing: 'trip', last_trip_dir: 'trip', trips_this_month: 'trip', last_trip_duration: 'trip', been_here: 'trip',
  save_place: 'place', place_distance: 'place', home_distance: 'home', way_back: 'home',
  reminder: 'rem', reminders_list: 'rem', herd_confirm: 'herd', herd_event: 'herd', herd_status: 'herd',
}
