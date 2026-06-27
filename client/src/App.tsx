import { useEffect, useState } from 'react'
import AgeGate from './components/AgeGate'
import Header from './components/Header'
import DealFeed from './components/DealFeed'
import DisclaimerFooter from './components/DisclaimerFooter'
import LocationBar from './components/LocationBar'
import LocationOnboarding from './components/LocationOnboarding'
import VehicleBar from './components/VehicleBar'
import VehicleSelector from './components/VehicleSelector'
import { useLocalStorage } from './hooks/useLocalStorage'
import { useLocation } from './hooks/useLocation'
import { useVehicleMpg } from './hooks/useVehicleMpg'

function App() {
  // Vehicle state and the settings-sheet toggle live here so the persistent
  // Header gear (above DealFeed's loading/error early-returns) and the bottom
  // sheet can share them; DealFeed consumes the resolved MPG as a prop.
  const { mpg, label, setVehicle } = useVehicleMpg()
  const [settingsOpen, setSettingsOpen] = useState(false)
  // One useLocation instance owns the location state; the first-run onboarding
  // step and the persistent top-of-feed bar both drive it (CAP-3).
  const { location, status, requestGps, setFromZip, clear } = useLocation()
  // First-run location step shows once; "Not now" or a successful set marks it
  // done so it never blocks returning visitors (the bar handles later changes).
  const [onboarded, setOnboarded] = useLocalStorage('gma_location_onboarded', false)

  // auto-advance the onboarding step the moment a location resolves
  useEffect(() => {
    if (!onboarded && location !== null) setOnboarded(true)
  }, [onboarded, location, setOnboarded])

  return (
    <AgeGate>
      {!onboarded ? (
        <LocationOnboarding
          status={status}
          onUseGps={requestGps}
          onZipSubmit={setFromZip}
          onSkip={() => setOnboarded(true)}
        />
      ) : (
        <div style={{ minHeight: '100vh', background: 'var(--surface-page)' }}>
          <Header />
          <LocationBar
            location={location}
            status={status}
            onUseGps={requestGps}
            onZipSubmit={setFromZip}
            onClear={clear}
          />
          <VehicleBar mpg={mpg} label={label} onOpen={() => setSettingsOpen(true)} />
          <main>
            <DealFeed mpg={mpg} location={location} />
          </main>
          <DisclaimerFooter />
        </div>
      )}
      <VehicleSelector
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        mpg={mpg}
        label={label}
        onMpgChange={setVehicle}
      />
    </AgeGate>
  )
}

export default App
