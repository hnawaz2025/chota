/** Home screen: the voice hub (big mic) with home distance, warnings and shortcuts to every feature. */
import { useLiveQuery } from 'dexie-react-hooks'
import { DIR_UR, bearingDeg, compass, distanceM, fmtKm } from '../core/geo'
import { isAtHome, spanEn, spanUr } from '../core/trail'
import { db, getHome } from '../data/db'
import { activeTrip, currentFixState, startTrip } from '../services/gps'
import { SPECIES_EN, SPECIES_UR, SPECIES_UR_OBL, herdStatus, trackedSpecies } from '../services/herd'
import { VoiceAsk } from '../ui/VoiceAsk'
import { T } from '../ui/common'
import { ICON, SPECIES_IC, type Screen } from '../ui/constants'
import { useFix, useTick } from '../ui/hooks'

/** Home screen: home distance, herd warnings, the voice hub, and feature shortcuts. */
export function Home({ go, onRate }: { go: (s: Screen) => void; onRate: (tripId: number) => void }) {
  useTick(5000)
  const fix = useFix()
  const home = useLiveQuery(getHome)
  const pending = useLiveQuery(() => db.reminders.where('status').anyOf('pending', 'fired').count()) ?? 0
  const herd = useLiveQuery(async () => Promise.all((await trackedSpecies()).map(herdStatus)), [])
  const stale = herd?.filter(h => h.status === 'stale' || h.status === 'none') ?? []
  const tid = activeTrip()
  const hd = home && fix ? distanceM(fix, home) : undefined
  const fs = currentFixState()
  const isStale = fs.state === 'stale'
  return (
    <div className="home">
      {home ? (hd !== undefined && (
        // Solid = current position; dashed + "last GPS …" = last known, not current.
        <div className={`homechip strip ${isStale ? 'stale' : ''}`} dir="rtl">
          <span className="ic">🏠</span>
          {isAtHome(hd, fix!.acc) && !isStale ? <T ur="آپ گھر پر ہیں" en="You are at home" />
            : <><span className="num" dir="ltr">{fmtKm(hd)}</span>
              <T ur={DIR_UR[compass(bearingDeg(fix!, home))]} en={`Home · ${compass(bearingDeg(fix!, home))}`} /></>}
          {isStale && <span className="last"><T ur={`آخری GPS ${spanUr(fs.ageMs)} پہلے`} en={`last GPS ${spanEn(fs.ageMs)} ago`} /></span>}
        </div>))
        : <button className="sethome strip" onClick={() => go('settings')}><span className="ic">🏠</span><T ur="پہلے اپنا گھر محفوظ کریں" en="Set your home first" /></button>}
      {stale.map(s => (
        <button key={s.species} className="warn" dir="rtl" onClick={() => go('herd')}>
          <span className="ic">⚠️</span><span className="ic">{SPECIES_IC[s.species]}</span>
          {s.status === 'none'
            ? <T ur={`${SPECIES_UR[s.species]}: تبدیلیاں درج ہیں، گنتی کبھی تصدیق نہیں ہوئی`} en={`${SPECIES_EN[s.species]}: changes recorded but never counted`} />
            : <T ur={`${SPECIES_UR_OBL[s.species]} کی گنتی ${s.daysSinceConfirmed} دن سے تصدیق نہیں ہوئی`} en={`${SPECIES_EN[s.species]} not recounted for ${s.daysSinceConfirmed} days`} emph />}
          <span className="go-arrow">‹</span>
        </button>
      ))}
      <VoiceAsk big onAction={a => { if ('go' in a) go(a.go); else if ('rate' in a) onRate(a.rate) }} />
      <div className="grid3">
        <button className={`tile trip ${tid ? 'active' : ''}`} onClick={async () => { if (!tid) await startTrip(); go('trip') }}>
          {tid ? <><span className="emoji">{ICON.trip}</span><T ur="سفر جاری ہے" en="Trip in progress" /><i className="count" aria-label="recording"><span className="recdot" /></i></>
            : <><span className="emoji">{ICON.trip}</span><T ur="سفر شروع کریں" en="Start Trip" /></>}
        </button>
        <button className="tile herd" onClick={() => go('herd')}><span className="emoji">{ICON.herd}</span><T ur="ریوڑ کی گنتی" en="Herd Count" />{stale.length > 0 && <i className="count">!</i>}</button>
        <button className="tile rem" onClick={() => go('reminders')}><span className="emoji">{ICON.rem}</span><T ur="یاد دہانیاں" en="Reminders" />{pending > 0 && <i className="count">{pending}</i>}</button>
      </div>
      <div className="row3">
        <button onClick={() => go('map')}><span className="ic">🗺️</span><T ur="نقشہ و جگہیں" en="Map & Places" /></button>
        <button onClick={() => go('history')}><span className="ic">🕓</span><T ur="پرانے سفر" en="Trip History" /></button>
        <button onClick={() => go('settings')}><span className="ic">⚙️</span><T ur="سیٹنگز" en="Settings" /></button>
      </div>
    </div>
  )
}
