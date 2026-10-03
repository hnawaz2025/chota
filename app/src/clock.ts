/** App clock. In demo mode it can be shifted forward ("days later") without touching the device clock. */
const KEY = 'chota.clockOffsetMs'
const read = () => { try { return Number(localStorage.getItem(KEY)) || 0 } catch { return 0 } }
let offset = read()

export const now = () => Date.now() + offset
export const clockOffsetDays = () => Math.round(offset / 86400000)
export function shiftDays(days: number) {
  offset = days === 0 ? 0 : offset + days * 86400000
  try { localStorage.setItem(KEY, String(offset)) } catch { /* private mode */ }
}
export const DAY = 86400000
export const daysAgo = (t: number) => Math.floor((now() - t) / DAY)
/** Demo only: advance the app clock (used so a fast simulated walk records realistic walking time). */
export function advanceMs(ms: number) {
  offset += ms
  try { localStorage.setItem(KEY, String(offset)) } catch { /* private mode */ }
}
