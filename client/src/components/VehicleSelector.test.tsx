import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import VehicleSelector from './VehicleSelector'

const jsonResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response

const menu = (...values: string[]) =>
  jsonResponse({ menuItem: values.map((value) => ({ text: value, value })) })

// route the cascade like the real API: years → makes → models → options → vehicle
const routeFuelEconomy = (fetchMock: Mock, comb08: unknown = 20) => {
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/menu/year')) return Promise.resolve(menu('2019', '2018'))
    if (url.includes('/menu/make?')) return Promise.resolve(menu('Toyota', 'Honda'))
    if (url.includes('/menu/model?')) return Promise.resolve(menu('Camry', 'Corolla'))
    if (url.includes('/menu/options?')) return Promise.resolve(menu('41234'))
    return Promise.resolve(jsonResponse({ comb08 }))
  })
}

let fetchMock: Mock

describe('VehicleSelector', () => {
  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders only the gear button when closed with no saved vehicle', () => {
    render(<VehicleSelector mpg={null} label={null} onMpgChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Vehicle settings' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByText(/MPG/)).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the saved vehicle label and MPG next to the gear', () => {
    render(<VehicleSelector mpg={32} label="2019 Toyota Camry" onMpgChange={vi.fn()} />)

    expect(screen.getByText('2019 Toyota Camry · 32 MPG')).toBeInTheDocument()
  })

  it('opens the panel and populates the Year dropdown', async () => {
    routeFuelEconomy(fetchMock)
    render(<VehicleSelector mpg={null} label={null} onMpgChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Vehicle settings' }))

    expect(await screen.findByRole('option', { name: '2019' })).toBeInTheDocument()
    expect(screen.getByLabelText('Make')).toBeDisabled()
    expect(screen.getByLabelText('Model')).toBeDisabled()
  })

  it('cascades: year enables makes, make enables models', async () => {
    routeFuelEconomy(fetchMock)
    render(<VehicleSelector mpg={null} label={null} onMpgChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Vehicle settings' }))
    await screen.findByRole('option', { name: '2019' })

    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2019' } })
    expect(await screen.findByRole('option', { name: 'Toyota' })).toBeInTheDocument()
    expect(screen.getByLabelText('Make')).toBeEnabled()

    fireEvent.change(screen.getByLabelText('Make'), { target: { value: 'Toyota' } })
    expect(await screen.findByRole('option', { name: 'Camry' })).toBeInTheDocument()
    expect(screen.getByLabelText('Model')).toBeEnabled()
  })

  it('reports the resolved MPG and label on model selection, then closes', async () => {
    routeFuelEconomy(fetchMock, 32)
    const onMpgChange = vi.fn()
    render(<VehicleSelector mpg={null} label={null} onMpgChange={onMpgChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Vehicle settings' }))
    await screen.findByRole('option', { name: '2019' })
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2019' } })
    await screen.findByRole('option', { name: 'Toyota' })
    fireEvent.change(screen.getByLabelText('Make'), { target: { value: 'Toyota' } })
    await screen.findByRole('option', { name: 'Camry' })

    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'Camry' } })

    await waitFor(() => {
      expect(onMpgChange).toHaveBeenCalledWith(32, '2019 Toyota Camry')
    })
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('shows an error in the panel and keeps it open when the API is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    const onMpgChange = vi.fn()
    render(<VehicleSelector mpg={null} label={null} onMpgChange={onMpgChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Vehicle settings' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('network down')
    expect(alert).toHaveTextContent('Gas costs will use the national average.')
    expect(screen.getByLabelText('Year')).toBeInTheDocument()
    expect(onMpgChange).not.toHaveBeenCalled()
  })

  it('surfaces the specific lookup error and notes the saved vehicle stays in effect', async () => {
    routeFuelEconomy(fetchMock, 'abc')
    render(
      <VehicleSelector mpg={32} label="2019 Toyota Camry" onMpgChange={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Vehicle settings' }))
    await screen.findByRole('option', { name: '2019' })
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2019' } })
    await screen.findByRole('option', { name: 'Toyota' })
    fireEvent.change(screen.getByLabelText('Make'), { target: { value: 'Toyota' } })
    await screen.findByRole('option', { name: 'Camry' })

    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'Camry' } })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No MPG available for this vehicle')
    expect(alert).toHaveTextContent('Gas costs will keep using your saved vehicle.')
    expect(alert).not.toHaveTextContent('national average')
  })

  it('clears a stale error when the panel is reopened with years already loaded', async () => {
    // years load fine, but the make menu fails — error must not survive reopen
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/menu/year')) return Promise.resolve(menu('2019', '2018'))
      return Promise.reject(new Error('network down'))
    })
    render(<VehicleSelector mpg={null} label={null} onMpgChange={vi.fn()} />)

    const gear = screen.getByRole('button', { name: 'Vehicle settings' })
    fireEvent.click(gear)
    await screen.findByRole('option', { name: '2019' })
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2019' } })
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    fireEvent.click(gear) // close
    fireEvent.click(gear) // reopen — years are populated, loadYears is skipped

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('never reports a resolved MPG after the selection has moved on', async () => {
    let releaseOptions!: (value: Response) => void
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/menu/year')) return Promise.resolve(menu('2019', '2018'))
      if (url.includes('/menu/make?')) return Promise.resolve(menu('Toyota', 'Honda'))
      if (url.includes('/menu/model?')) return Promise.resolve(menu('Camry', 'Corolla'))
      if (url.includes('/menu/options?')) {
        return new Promise<Response>((resolve) => {
          releaseOptions = resolve
        })
      }
      return Promise.resolve(jsonResponse({ comb08: 32 }))
    })
    const onMpgChange = vi.fn()
    render(<VehicleSelector mpg={null} label={null} onMpgChange={onMpgChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Vehicle settings' }))
    await screen.findByRole('option', { name: '2019' })
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2019' } })
    await screen.findByRole('option', { name: 'Toyota' })
    fireEvent.change(screen.getByLabelText('Make'), { target: { value: 'Toyota' } })
    await screen.findByRole('option', { name: 'Camry' })
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'Camry' } })

    // lookup still in flight — user abandons it by switching the year
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2018' } })
    await screen.findByRole('option', { name: 'Toyota' })

    releaseOptions(menu('41234'))
    // let the abandoned lookup's promise chain fully settle
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(onMpgChange).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Year')).toBeInTheDocument() // panel stayed open
  })

  it('hides the gear glyph from assistive tech and links the button to the panel', async () => {
    routeFuelEconomy(fetchMock)
    render(<VehicleSelector mpg={null} label={null} onMpgChange={vi.fn()} />)

    const gear = screen.getByRole('button', { name: 'Vehicle settings' })
    expect(screen.getByText('⚙️')).toHaveAttribute('aria-hidden', 'true')

    fireEvent.click(gear)
    await screen.findByRole('option', { name: '2019' })

    const panelId = gear.getAttribute('aria-controls')
    expect(panelId).toBeTruthy()
    expect(document.getElementById(panelId as string)).toContainElement(
      screen.getByLabelText('Year'),
    )
  })

  it('keeps the panel open without persisting when the MPG lookup fails', async () => {
    routeFuelEconomy(fetchMock, 'abc')
    const onMpgChange = vi.fn()
    render(<VehicleSelector mpg={null} label={null} onMpgChange={onMpgChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Vehicle settings' }))
    await screen.findByRole('option', { name: '2019' })
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2019' } })
    await screen.findByRole('option', { name: 'Toyota' })
    fireEvent.change(screen.getByLabelText('Make'), { target: { value: 'Toyota' } })
    await screen.findByRole('option', { name: 'Camry' })

    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'Camry' } })

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onMpgChange).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Year')).toBeInTheDocument()
  })

  it('resets make and model when the year changes', async () => {
    routeFuelEconomy(fetchMock)
    render(<VehicleSelector mpg={null} label={null} onMpgChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Vehicle settings' }))
    await screen.findByRole('option', { name: '2019' })
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2019' } })
    await screen.findByRole('option', { name: 'Toyota' })
    fireEvent.change(screen.getByLabelText('Make'), { target: { value: 'Toyota' } })

    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2018' } })

    expect(screen.getByLabelText('Make')).toHaveValue('')
    expect(screen.getByLabelText('Model')).toHaveValue('')
    expect(screen.getByLabelText('Model')).toBeDisabled()
  })
})
