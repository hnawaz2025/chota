/** App shell: header, screen navigation, and the one-modal-at-a-time sequence after a trip (trip-end reminder → rating → count). */
import { useEffect, useState } from 'react'
import { type Reminder } from './data/db'
import { Herd } from './screens/Herd'
import { History } from './screens/History'
import { Home } from './screens/Home'
import { MapScreen } from './screens/MapScreen'
import { Reminders } from './screens/Reminders'
import { Settings } from './screens/Settings'
import { TripScreen } from './screens/Trip'
import { clockOffsetDays } from './services/clock'
import { type OpenTrip, activeTrip, checkOpenTrip, isSimulated, startPositioning } from './services/gps'
import { checkReminders, fireTripEnd } from './services/reminders'
import { speak } from './services/speech'
import { type Screen, lsGet, lsSet } from './ui/constants'
import { useOfflineReady } from './ui/hooks'
import { FiredReminder, ForgottenTrip, RateTrip, ReturnCount } from './ui/modals'

/** Dark charcoal is the default; ☀️ sun mode is a strong light theme for direct sunlight. Remembered per phone. */
const THEME_KEY = 'chota.theme'

const applyTheme = (sun: boolean) => { if (sun) document.documentElement.dataset.theme = 'light'; else delete document.documentElement.dataset.theme }

applyTheme(lsGet(THEME_KEY) === 'sun')   // before first paint, so there is no flash of the wrong theme

/** Root component: owns the current screen and the modal queue; checks for a forgotten trip before GPS starts. */
export default function App() {
  const [screen, setScreen] = useState<Screen>(activeTrip() ? 'trip' : 'home')
  const [fired, setFired] = useState<Reminder[]>([])
  const [rateTrip, setRateTrip] = useState<number>()
  const [openTrip, setOpenTrip] = useState<OpenTrip>()
  // Check for a forgotten trip before any new fix can be appended to it.
  useEffect(() => { checkOpenTrip().then(o => { setOpenTrip(o); startPositioning() }) }, [])
  useEffect(() => {
    const run = async () => { const due = await checkReminders(); if (due.length) { setFired(f => [...f, ...due]); speak(due[0].text) } }
    run(); const i = setInterval(run, 15000); return () => clearInterval(i)
  }, [])
  const go = (s: Screen) => { setScreen(s); window.scrollTo(0, 0) }
  const [returnCount, setReturnCount] = useState<number>()
  /** Every way a trip ends lands here: "on the way back" reminders first, then the grazing rating, then count what came home. */
  const afterTripEnded = async (id: number) => {
    const due = await fireTripEnd()
    if (due.length) { setFired(f => [...due, ...f]); speak(due[0].text) }
    setRateTrip(id); go('home')
  }
  const tripEndFired = fired.length > 0 && fired[0].trigger === 'trip_end'

  return (
    <div className="app">
      <Header onHome={() => go('home')} screen={screen} />
      <main>
        {screen === 'home' && <Home go={go} onRate={afterTripEnded} />}
        {screen === 'trip' && <TripScreen go={go} onEnded={afterTripEnded} />}
        {screen === 'reminders' && <Reminders />}
        {screen === 'herd' && <Herd />}
        {screen === 'map' && <MapScreen />}
        {screen === 'history' && <History />}
        {screen === 'settings' && <Settings />}
      </main>
      {openTrip && <ForgottenTrip o={openTrip} onDone={ended => { setOpenTrip(undefined); if (ended) afterTripEnded(ended); else go('trip') }} />}
      {/* One modal at a time. Order after a trip: "on the way back" reminder → grazing rating → count what came home.
          Other reminders wait until those are done. */}
      {!openTrip && tripEndFired && <FiredReminder r={fired[0]} onClose={() => setFired(f => f.slice(1))} go={go} />}
      {!openTrip && !tripEndFired && rateTrip && <RateTrip id={rateTrip} onDone={() => { setReturnCount(rateTrip); setRateTrip(undefined) }} />}
      {!openTrip && !tripEndFired && !rateTrip && returnCount && <ReturnCount tripId={returnCount} go={go} onDone={() => setReturnCount(undefined)} />}
      {!openTrip && !rateTrip && !returnCount && fired.length > 0 && !tripEndFired && <FiredReminder r={fired[0]} onClose={() => setFired(f => f.slice(1))} go={go} />}
    </div>
  )
}

/** RTL header: back sits top-right where Urdu readers look first; demo badges (simulated data) always visible. */
function Header({ onHome, screen }: { onHome: () => void; screen: Screen }) {
  const off = clockOffsetDays()
  const [sun, setSun] = useState(() => lsGet(THEME_KEY) === 'sun')
  const offline = useOfflineReady()
  const toggleSun = () => { const s = !sun; setSun(s); applyTheme(s); lsSet(THEME_KEY, s ? 'sun' : 'dark') }
  return (
    <header dir="rtl">
      {screen !== 'home' ? <button className="back" onClick={onHome} aria-label="Home">→</button> : null}
      <div className="brand" onClick={onHome}><b>چھوٹا</b><small dir="ltr">CHOTA</small></div>
      <div className="badges" dir="ltr">
        {isSimulated() && <span className="badge demo">DEMO GPS</span>}
        {off > 0 && <span className="badge demo">+{off}d</span>}
        {offline === 'ready' && <span className="badge off" title="offline ✓ — CHOTA works without internet">📴 آف لائن ✓</span>}
        {offline === 'caching' && <span className="badge off caching" title="Saving CHOTA for offline use…">⏳</span>}
      </div>
      <button className="sun" onClick={toggleSun} aria-pressed={sun} aria-label={sun ? 'Dark mode' : 'Sun mode (bright light)'}>{sun ? '🌙' : '☀️'}</button>
    </header>
  )
}
