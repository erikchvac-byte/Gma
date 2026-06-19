import { useState } from 'react'
import AgeGate from './components/AgeGate'
import Header from './components/Header'
import DealFeed from './components/DealFeed'
import DisclaimerFooter from './components/DisclaimerFooter'
import VehicleSelector from './components/VehicleSelector'
import { useVehicleMpg } from './hooks/useVehicleMpg'

function App() {
  // Vehicle state and the settings-sheet toggle live here so the persistent
  // Header gear (above DealFeed's loading/error early-returns) and the bottom
  // sheet can share them; DealFeed consumes the resolved MPG as a prop.
  const { mpg, label, setVehicle } = useVehicleMpg()
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <AgeGate>
      <div style={{ minHeight: '100vh', background: 'var(--surface-page)' }}>
        <Header onOpenSettings={() => setSettingsOpen(true)} />
        <main>
          <DealFeed mpg={mpg} />
        </main>
        <DisclaimerFooter />
      </div>
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
