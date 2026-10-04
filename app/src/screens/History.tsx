/** Trip history: every recorded trip, with gaps, rating and what came home. */
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { DIR_UR, fmtKm } from '../core/geo'
import { db } from '../data/db'
import { agoUr } from '../services/answer'
import { MapView } from '../ui/MapView'
import { I, Lab, T } from '../ui/common'
import { SPECIES_IC } from '../ui/constants'

const RATING_UR = { good: 'اچھا', okay: 'ٹھیک', poor: 'کمزور' } as const

const RATING_DOT = { good: '🟢', okay: '🟡', poor: '🔴' } as const

/** Trip history list; tapping a trip shows it on the map. */
export function History() {
  const trips = useLiveQuery(() => db.trips.orderBy('startedAt').reverse().toArray()) ?? []
  const counts = useLiveQuery(() => db.confirmations.filter(c => c.tripId !== undefined).toArray()) ?? []
  const [sel, setSel] = useState<number>()
  return (
    <div>
      {sel && <MapView focus={{ tripIds: [sel] }} className="map short" />}
      <div className="pad">
        <p className="muted note"><T ur="صرف وہ سفر جو CHOTA پر ریکارڈ ہوئے — مکمل تاریخ نہیں" en="Only trips recorded in CHOTA — not a complete history" /></p>
        {trips.filter(t => t.endedAt).map(t => (
          <button key={t.id} className={`card row trip ${t.rating ?? ''} ${sel === t.id ? 'sel' : ''}`} dir="rtl" onClick={() => setSel(t.id)}>
            <span><T ur={agoUr(t.startedAt)} en={new Date(t.startedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} /></span>
            <span className="trip-mid"><span className="num" dir="ltr">{fmtKm(t.distanceM ?? 0)}</span>
              <T ur={`${Math.round((t.endedAt! - t.startedAt) / 3600000 * 10) / 10} گھنٹے${t.direction ? ` · ${DIR_UR[t.direction as keyof typeof DIR_UR]}` : ''}`} en={`${Math.round((t.endedAt! - t.startedAt) / 3600000 * 10) / 10} h${t.direction ? ` · ${t.direction}` : ''}`} />
              {counts.filter(c => c.tripId === t.id).map(c => <span key={c.id} className="came-home" dir="ltr">{SPECIES_IC[c.species]} {c.count}{c.expected !== undefined && c.expected !== c.count ? ` (${c.count - c.expected > 0 ? '+' : ''}${c.count - c.expected})` : ' ✓'}</span>)}
              {t.gapCount ? <span className="gap-flag"><Lab ic="⚠️" ur={`${t.gapCount} وقفہ`} en={`${t.gapCount} gap${t.gapCount > 1 ? 's' : ''}`} /></span> : null}</span>
            <span className={`chip ${t.rating ?? ''}`}>{t.rating ? <><I c={RATING_DOT[t.rating]} /><span className="ur">{RATING_UR[t.rating]}</span></> : '—'}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
