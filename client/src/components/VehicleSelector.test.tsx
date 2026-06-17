import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import VehicleSelector from './VehicleSelector'

const jsonResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response

const menu = (...values: string[]) =>
  jsonResponse({ menuItem: values.map((value) => ({ text: value, value })) })

// route the cascade like the real API: years → makes → models → options → vehicle
const routeFuelEconomy = (mock: Mock, comb08: unknown = 20) => {
  mock.mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/menu/year')) return Promise.resolve(menu('2019', '2018'))
    if (url.includes('/menu/make?')) return Promise.resolve(menu('Toyota', 'Honda'))
    if (url.includes('/menu/model?')) return Promise.resolve(menu('Camry', 'Corolla'))
    if (url.includes('/menu/options?')) return Promise.resolve(menu('41234'))
    return Promise.resolve(jsonResponse({ comb08 }))
  })
}

let fetchMock: Mock

// stateful harness: starts open, onClose collapses the sheet (as App does)
function Sheet({
  mpg = null,
  label = null,
  onMpgChange = vi.fn(),
}: {
  mpg?: number | null
  label?: string | null
  onMpgChange?: (mpg: number, label: string) => void
}) {
  const [open, setOpen] = useState(true)
  return (
    <VehicleSelector
      open={open}
      onClose={() => setOpen(false)}
      mpg={mpg}
      label={label}
      onMpgChange={onMpgChange}
    />
  )
}

const pickCamry = async () => {
  await screen.findByRole('option', { name: '2019' })
  fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2019' } })
  await screen.findByRole('option', { name: 'Toyota' })
  fireEvent.change(screen.getByLabelText('Make'), { target: { value: 'Toyota' } })
  await screen.findByRole('option', { name: 'Camry' })
  fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'Camry' } })
}

describe('VehicleSelector (bottom sheet)', () => {
  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders nothing and fetches nothing when closed', () => {
    const { container } = render(
      <VehicleSelector open={false} onClose={vi.fn()} mpg={null} label={null} onMpgChange={vi.fn()} />,
    )

    expect(container).toBeEmptyDOMElement()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('exposes dialog semantics and loads the Year list on open', async () => {
    routeFuelEconomy(fetchMock)
    render(<Sheet />)

    const dialog = screen.getByRole('dialog', { name: 'Vehicle settings' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(await screen.findByRole('option', { name: '2019' })).toBeInTheDocument()
    expect(screen.getByLabelText('Make')).toBeDisabled()
    expect(screen.getByLabelText('Model')).toBeDisabled()
  })

  it('moves focus into the sheet on open', async () => {
    routeFuelEconomy(fetchMock)
    render(<Sheet />)

    const dialog = screen.getByRole('dialog')
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
  })

  it('shows the saved vehicle and MPG inside the sheet', async () => {
    routeFuelEconomy(fetchMock)
    render(<Sheet mpg={32} label="2019 Toyota Camry" />)

    expect(screen.getByText('2019 Toyota Camry · 32 MPG')).toBeInTheDocument()
  })

  it('cascades: year enables makes, make enables models', async () => {
    routeFuelEconomy(fetchMock)
    render(<Sheet />)

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
    render(<Sheet onMpgChange={onMpgChange} />)

    await pickCamry()

    await waitFor(() => expect(onMpgChange).toHaveBeenCalledWith(32, '2019 Toyota Camry'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('closes via the close button', async () => {
    routeFuelEconomy(fetchMock)
    render(<Sheet />)

    await screen.findByRole('option', { name: '2019' })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes when Escape is pressed', async () => {
    routeFuelEconomy(fetchMock)
    render(<Sheet />)

    const dialog = await screen.findByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes when the scrim is clicked', async () => {
    routeFuelEconomy(fetchMock)
    const { container } = render(<Sheet />)

    await screen.findByRole('option', { name: '2019' })
    // the scrim is the first child of the overlay wrapper, behind the dialog
    const scrim = container.firstElementChild!.firstElementChild as HTMLElement
    fireEvent.click(scrim)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('traps Tab focus within the sheet', async () => {
    routeFuelEconomy(fetchMock)
    render(<Sheet />)

    await screen.findByRole('option', { name: '2019' })
    const closeButton = screen.getByRole('button', { name: 'Close' })
    const yearSelect = screen.getByLabelText('Year')

    // Make/Model are disabled, so Year is the last focusable; Tab past it wraps
    yearSelect.focus()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' })
    expect(closeButton).toHaveFocus()
  })

  it('shows an error in the sheet and keeps it open when the API is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    const onMpgChange = vi.fn()
    render(<Sheet onMpgChange={onMpgChange} />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('network down')
    expect(alert).toHaveTextContent('Gas costs will use the national average.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onMpgChange).not.toHaveBeenCalled()
  })

  it('surfaces the specific lookup error and notes the saved vehicle stays in effect', async () => {
    routeFuelEconomy(fetchMock, 'abc')
    render(<Sheet mpg={32} label="2019 Toyota Camry" />)

    await pickCamry()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No MPG available for this vehicle')
    expect(alert).toHaveTextContent('Gas costs will keep using your saved vehicle.')
    expect(alert).not.toHaveTextContent('national average')
  })

  it('clears a stale error when the sheet is reopened', async () => {
    // years load fine, but the make menu fails — error must not survive reopen
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/menu/year')) return Promise.resolve(menu('2019', '2018'))
      return Promise.reject(new Error('network down'))
    })
    const { rerender } = render(
      <VehicleSelector open onClose={vi.fn()} mpg={null} label={null} onMpgChange={vi.fn()} />,
    )

    await screen.findByRole('option', { name: '2019' })
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2019' } })
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    rerender(
      <VehicleSelector open={false} onClose={vi.fn()} mpg={null} label={null} onMpgChange={vi.fn()} />,
    )
    rerender(
      <VehicleSelector open onClose={vi.fn()} mpg={null} label={null} onMpgChange={vi.fn()} />,
    )

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
    render(<Sheet onMpgChange={onMpgChange} />)

    await pickCamry()

    // lookup still in flight — user abandons it by switching the year
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2018' } })
    await screen.findByRole('option', { name: 'Toyota' })

    releaseOptions(menu('41234'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(onMpgChange).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument() // sheet stayed open
  })

  it('keeps the sheet open without persisting when the MPG lookup fails', async () => {
    routeFuelEconomy(fetchMock, 'abc')
    const onMpgChange = vi.fn()
    render(<Sheet onMpgChange={onMpgChange} />)

    await pickCamry()

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onMpgChange).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('resets make and model when the year changes', async () => {
    routeFuelEconomy(fetchMock)
    render(<Sheet />)

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
