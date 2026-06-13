import { useId, useRef, useState } from 'react'
import { useFuelEconomy } from '../hooks/useFuelEconomy'

interface VehicleSelectorProps {
  mpg: number | null
  label: string | null
  onMpgChange: (mpg: number, label: string) => void
}

// Gear icon + cascading Year → Make → Model panel (fueleconomy.gov).
// Controlled: the persisted vehicle arrives via props; a completed selection
// is reported through onMpgChange — this component never touches storage
export default function VehicleSelector({ mpg, label, onMpgChange }: VehicleSelectorProps) {
  const yearId = useId()
  const makeId = useId()
  const modelId = useId()
  const panelId = useId()
  const [isOpen, setIsOpen] = useState(false)
  const [year, setYear] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  // bumped on every Year/Make/Model change — an MPG lookup that finishes
  // after the selection moved on must never report its result
  const selectionRef = useRef(0)
  const { years, makes, models, error, loadYears, loadMakes, loadModels, resolveMpg, clearError } =
    useFuelEconomy()

  const togglePanel = () => {
    const opening = !isOpen
    setIsOpen(opening)
    if (opening) {
      // an error from the previous visit must not greet the reopen
      clearError()
      if (years.length === 0) void loadYears()
    }
  }

  const handleYearChange = (nextYear: string) => {
    selectionRef.current += 1
    setYear(nextYear)
    setMake('')
    setModel('')
    if (nextYear !== '') void loadMakes(nextYear)
  }

  const handleMakeChange = (nextMake: string) => {
    selectionRef.current += 1
    setMake(nextMake)
    setModel('')
    if (nextMake !== '') void loadModels(year, nextMake)
  }

  const handleModelChange = async (nextModel: string) => {
    const selection = ++selectionRef.current
    setModel(nextModel)
    if (nextModel === '') return
    const resolved = await resolveMpg(year, make, nextModel)
    // a failed lookup keeps the panel open with the error on display;
    // an abandoned one (selection changed while in flight) is dropped
    if (resolved !== null && selection === selectionRef.current) {
      onMpgChange(resolved, `${year} ${make} ${nextModel}`)
      setIsOpen(false)
    }
  }

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Vehicle settings"
          aria-expanded={isOpen}
          aria-controls={isOpen ? panelId : undefined}
          onClick={togglePanel}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-lg leading-none"
        >
          <span aria-hidden="true">⚙️</span>
        </button>
        {mpg !== null && label !== null && (
          <span className="text-sm text-gray-700">
            {label} · {mpg} MPG
          </span>
        )}
      </div>
      {isOpen && (
        <div id={panelId} className="mt-2 space-y-3 rounded-lg border border-gray-200 bg-white p-3">
          {error !== null && (
            <p role="alert" className="text-sm text-red-700">
              <span className="block">{error}</span>
              <span className="block">
                {mpg !== null
                  ? 'Gas costs will keep using your saved vehicle.'
                  : 'Gas costs will use the national average.'}
              </span>
            </p>
          )}
          <div>
            <label htmlFor={yearId} className="block text-sm text-gray-700">
              Year
            </label>
            <select
              id={yearId}
              value={year}
              onChange={(event) => handleYearChange(event.target.value)}
              className="w-full rounded border border-gray-300 p-2"
            >
              <option value="">Select year</option>
              {years.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={makeId} className="block text-sm text-gray-700">
              Make
            </label>
            <select
              id={makeId}
              value={make}
              onChange={(event) => handleMakeChange(event.target.value)}
              disabled={year === ''}
              className="w-full rounded border border-gray-300 p-2 disabled:bg-gray-100"
            >
              <option value="">Select make</option>
              {makes.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={modelId} className="block text-sm text-gray-700">
              Model
            </label>
            <select
              id={modelId}
              value={model}
              onChange={(event) => void handleModelChange(event.target.value)}
              disabled={make === ''}
              className="w-full rounded border border-gray-300 p-2 disabled:bg-gray-100"
            >
              <option value="">Select model</option>
              {models.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}
