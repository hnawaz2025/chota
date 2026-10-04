/** Small React hooks: the current GPS fix, a re-render tick, and whether CHOTA is saved for offline use. */
import { useEffect, useState } from 'react'
import { type Fix, onFix } from '../services/gps'

/**
 * "Works offline" badge: only once the service worker actually holds the app (controller set, or ready resolved).
 * Before that a quiet ⏳ while it caches; nothing at all where service workers don't exist. Never claims offline early.
 */
export function useOfflineReady(): 'none' | 'caching' | 'ready' {
  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined
  const [s, setS] = useState<'none' | 'caching' | 'ready'>(() => !sw ? 'none' : sw.controller ? 'ready' : 'caching')
  useEffect(() => {
    if (!sw || s === 'ready') return
    let alive = true
    sw.ready.then(() => { if (alive) setS('ready') }).catch(() => {})
    return () => { alive = false }
  }, [sw, s])
  return s
}
/** The latest GPS fix, updating on each new fix. */
export function useFix() { const [f, setF] = useState<Fix>(); useEffect(() => onFix(setF), []); return f }
/** Re-render every `ms` milliseconds (clocks, ages). */
export function useTick(ms = 1000) { const [, s] = useState(0); useEffect(() => { const i = setInterval(() => s(x => x + 1), ms); return () => clearInterval(i) }, [ms]) }
