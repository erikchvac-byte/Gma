import AgeGate from './components/AgeGate'
import DealFeed from './components/DealFeed'

function App() {
  return (
    <AgeGate>
      <div className="min-h-screen bg-gray-50">
        <h1 className="text-2xl font-bold p-4">Gma&apos;s Helper</h1>
        <DealFeed />
      </div>
    </AgeGate>
  )
}

export default App
