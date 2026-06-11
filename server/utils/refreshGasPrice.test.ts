import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import axios from 'axios'
import { refreshGasPrice } from './refreshGasPrice.js'

vi.mock('axios')
const mockedGet = vi.mocked(axios.get)

const seed = {
  meta: {
    lastScraperRun: '2026-06-09T00:00:00.000Z',
    gasPrice: 4.25,
    nationalMpg: 28,
    gasPriceUpdatedAt: '2026-06-09T00:00:00.000Z',
  },
  dispensaries: [{ id: 'a', name: 'Alpha Greens' }],
}

const eiaBody = (value: unknown) => ({ data: { response: { data: [{ value }] } } })

describe('refreshGasPrice', () => {
  let dir: string
  let dataPath: string
  let errorSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>

  const fileNow = () => JSON.parse(readFileSync(dataPath, 'utf-8'))

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'gas-price-'))
    dataPath = path.join(dir, 'data.json')
    writeFileSync(dataPath, JSON.stringify(seed, null, 2), 'utf-8')
    vi.stubEnv('EIA_API_KEY', 'test-key')
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    vi.clearAllMocks()
    rmSync(dir, { recursive: true, force: true })
  })

  it('updates meta.gasPrice and sets a fresh ISO gasPriceUpdatedAt on success', async () => {
    mockedGet.mockResolvedValue(eiaBody(4.439))
    const before = Date.now()

    await refreshGasPrice(dataPath)

    const file = fileNow()
    expect(file.meta.gasPrice).toBe(4.439)
    const updatedAt = Date.parse(file.meta.gasPriceUpdatedAt)
    expect(updatedAt).toBeGreaterThanOrEqual(before)
    expect(file.meta.gasPriceUpdatedAt).toBe(new Date(updatedAt).toISOString())
  })

  it('passes the rest of the file through untouched and leaves no tmp file', async () => {
    mockedGet.mockResolvedValue(eiaBody(4.439))

    await refreshGasPrice(dataPath)

    const file = fileNow()
    expect(file.dispensaries).toEqual(seed.dispensaries)
    expect(file.meta.lastScraperRun).toBe(seed.meta.lastScraperRun)
    expect(file.meta.nationalMpg).toBe(28)
    expect(existsSync(path.join(dir, 'data.tmp.json'))).toBe(false)
  })

  it('coerces a numeric-string value from EIA', async () => {
    mockedGet.mockResolvedValue(eiaBody('4.439'))

    await refreshGasPrice(dataPath)

    expect(fileNow().meta.gasPrice).toBe(4.439)
  })

  it.each(['', undefined])('skips with one warning and no HTTP call when the key is %s', async (key) => {
    if (key === undefined) {
      vi.stubEnv('EIA_API_KEY', undefined as unknown as string)
      delete process.env.EIA_API_KEY
    } else {
      vi.stubEnv('EIA_API_KEY', key)
    }

    await refreshGasPrice(dataPath)

    expect(mockedGet).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledOnce()
    expect(fileNow()).toEqual(seed)
  })

  it('keeps the file unchanged and logs on network failure, without throwing', async () => {
    mockedGet.mockRejectedValue(new Error('timeout of 10000ms exceeded'))

    await expect(refreshGasPrice(dataPath)).resolves.toBeUndefined()

    expect(fileNow()).toEqual(seed)
    expect(errorSpy).toHaveBeenCalledOnce()
  })

  it('never leaks the API key into logs on failure', async () => {
    mockedGet.mockRejectedValue(new Error('Request failed with status code 403'))

    await refreshGasPrice(dataPath)

    const logged = errorSpy.mock.calls.flat().map(String).join(' ')
    expect(logged).not.toContain('test-key')
    expect(fileNow()).toEqual(seed)
  })

  it.each([
    ['empty rows', { data: { response: { data: [] } } }],
    ['missing response', { data: {} }],
    ['null body', { data: null }],
  ])('keeps the file unchanged on malformed body (%s)', async (_label, body) => {
    mockedGet.mockResolvedValue(body)

    await refreshGasPrice(dataPath)

    expect(fileNow()).toEqual(seed)
    expect(errorSpy).toHaveBeenCalledOnce()
  })

  it.each([[0], [-1], ['abc'], [null], [Infinity], [true], [[4.2]], [{}]])(
    'rejects unusable price value %s and keeps the file unchanged',
    async (value) => {
      mockedGet.mockResolvedValue(eiaBody(value))

      await refreshGasPrice(dataPath)

      expect(fileNow()).toEqual(seed)
      expect(errorSpy).toHaveBeenCalledOnce()
    },
  )
})
