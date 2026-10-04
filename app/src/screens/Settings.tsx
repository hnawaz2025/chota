/** Settings: home, subtitles, demo GPS, notifications, demo controls and data sources. */
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { getHome, setHome } from '../data/db'
import { clearAll, loadDemo } from '../data/demo'
import { agoEn } from '../services/answer'
import { clockOffsetDays, now, shiftDays } from '../services/clock'
import { isSimulated, setSimulated } from '../services/gps'
import { requestNotifications } from '../services/reminders'
import { canListen, hasUrduVoice } from '../services/speech'
import { I, Lab, Row, T } from '../ui/common'
import { lsGet, lsSet } from '../ui/constants'
import { useFix } from '../ui/hooks'

/** Settings and demo controls (load demo data, shift the app clock, clear data). */
export function Settings() {
  const fix = useFix()
  const home = useLiveQuery(getHome)
  const [, force] = useState(0)
  const [en, setEn] = useState(lsGet('chota.en') !== '0')
  return (
    <div className="pad">
      <Row>
        <Lab ic="🏠" ur="گھر" en="Home" big />
        <p className="muted">{home ? `${home.lat.toFixed(5)}, ${home.lon.toFixed(5)} · ${agoEn(home.setAt)}` : '—'}</p>
        <button className="big-btn back" disabled={!fix} onClick={() => fix && setHome(fix.lat, fix.lon, now())}><I c="🏠" /><T ur="یہ جگہ میرا گھر ہے" en="Set current location as Home" /></button>
      </Row>
      <Row>
        <label><input type="checkbox" checked={en} onChange={e => { lsSet('chota.en', e.target.checked ? '1' : '0'); setEn(e.target.checked) }} /> English subtitles</label>
        <label><input type="checkbox" checked={isSimulated()} onChange={e => { setSimulated(e.target.checked); force(x => x + 1) }} /> Demo GPS (simulated walk) — off = real phone GPS</label>
        <button onClick={() => requestNotifications().then(() => force(x => x + 1))}>🔔 Enable notifications ({typeof Notification !== 'undefined' ? Notification.permission : 'n/a'})</button>
        <p className="muted">Urdu voice output: {hasUrduVoice() ? 'available' : 'no Urdu TTS voice on this device. On Android: Settings → Text-to-speech → Google → install Urdu'} · Speech input: {canListen() ? 'browser (needs network) + keyboard mic' : 'keyboard mic only'}</p>
      </Row>
      <Row>
        <b>Demo controls</b>
        <div className="chips">
          <button onClick={async () => { if (confirm('Load demo history? This replaces all CHOTA data on this device with demo data.')) { await loadDemo(); force(x => x + 1) } }}>Load demo history</button>
          {[1, 3, 7, 14].map(d => <button key={d} onClick={() => { shiftDays(d); force(x => x + 1) }}>+{d} days</button>)}
          <button onClick={() => { shiftDays(0); force(x => x + 1) }}>Reset clock</button>
          <button className="danger" onClick={async () => { if (confirm('Delete all CHOTA data on this device?')) { await clearAll(); force(x => x + 1) } }}>Clear all data</button>
        </div>
        <p className="muted">Clock: {new Date(now()).toLocaleString('en-GB')} {clockOffsetDays() ? `(+${clockOffsetDays()} days demo)` : ''}</p>
      </Row>
      <Row>
        <b>About the data</b>
        <p className="muted">All records stay on this phone. Map: Copernicus Sentinel-2 true colour (30 Sep 2026), GeoNames villages, geoBoundaries border. CHOTA does not judge pasture, water or access; places and grazing ratings are the herder's own.</p>
      </Row>
    </div>
  )
}
