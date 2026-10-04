/** Map & places: all recorded trips coloured by rating, and the list of saved places. */
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { DIR_UR, bearingDeg, compass, distanceM, fmtKm } from '../core/geo'
import { db, placeIcon } from '../data/db'
import { type Answer, agoEn, agoUr } from '../services/answer'
import { MapView } from '../ui/MapView'
import { Lab, T } from '../ui/common'
import { ICON } from '../ui/constants'
import { useFix } from '../ui/hooks'

/** Map of all trips; tapping a place focuses it. */
export function MapScreen() {
  const fix = useFix()
  const places = useLiveQuery(() => db.places.toArray()) ?? []
  const [focus, setFocus] = useState<Answer['map']>()
  return (
    <div>
      <MapView allTrips={!focus} focus={focus} className="map tall" />
      <div className="legend" dir="rtl"><span className="g"><i />اچھا</span><span className="o"><i />ٹھیک</span><span className="p"><i />کمزور</span><span className="a"><i />آج</span><span className="x"><i />ریکارڈ نہیں</span></div>
      <div className="pad">
        {places.length === 0 && <p className="muted note"><Lab ic={ICON.place} ur="ابھی کوئی جگہ محفوظ نہیں" en="No places saved yet" /></p>}
        {places.map(p => (
          <button key={p.id} className="card row" dir="rtl" onClick={() => setFocus({ placeIds: [p.id!] })}>
            <span className="row-main"><span className="ic">{placeIcon(p.type)}</span><b dir="auto">{p.name}</b></span>
            <span className="row-side">{fix && <span className="num" dir="ltr">{fmtKm(distanceM(fix, p))}</span>}
              <T ur={`${fix ? DIR_UR[compass(bearingDeg(fix, p))] + ' · ' : ''}${agoUr(p.createdAt)}`} en={`${fix ? compass(bearingDeg(fix, p)) + ' · ' : ''}${agoEn(p.createdAt)}`} /></span>
          </button>
        ))}
      </div>
    </div>
  )
}
