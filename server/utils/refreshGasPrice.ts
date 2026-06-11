import axios from 'axios'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { atomicWriteJson } from './atomicWrite.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DATA_PATH = path.join(__dirname, '../data/data.json')

// EIA v2: latest weekly Washington-state (SWA) regular gasoline (EPMR) retail
// price — state-level beats the national average for Marysville trip math
const EIA_URL = 'https://api.eia.gov/v2/petroleum/pri/gnd/data/'
const REQUEST_TIMEOUT_MS = 10_000

// Fail-safe by contract: on ANY failure (missing key, network, bad payload,
// unusable price) data.json stays untouched, the reason is logged, and the
// promise resolves — a gas-price hiccup must never take the server down.
export async function refreshGasPrice(dataPath: string = DEFAULT_DATA_PATH): Promise<void> {
  const apiKey = process.env.EIA_API_KEY
  if (apiKey === undefined || apiKey === '') {
    console.warn('[refreshGasPrice] EIA_API_KEY not set — skipping refresh, keeping last known gas price')
    return
  }

  try {
    const { data: body } = await axios.get(EIA_URL, {
      timeout: REQUEST_TIMEOUT_MS,
      params: {
        api_key: apiKey,
        frequency: 'weekly',
        'data[0]': 'value',
        'facets[duoarea][]': 'SWA',
        'facets[product][]': 'EPMR',
        'sort[0][column]': 'period',
        'sort[0][direction]': 'desc',
        length: 1,
      },
    })

    // EIA returns value as a number for some series and a string for others;
    // the typeof gate blocks Number()'s exotic coercions (true → 1, [4.2] → 4.2)
    const raw: unknown = body?.response?.data?.[0]?.value
    const price = typeof raw === 'number' || typeof raw === 'string' ? Number(raw) : NaN
    if (!Number.isFinite(price) || price <= 0) {
      console.error(
        `[refreshGasPrice] EIA returned an unusable price ${JSON.stringify(raw)} — keeping last known gas price`,
      )
      return
    }

    const file = JSON.parse(readFileSync(dataPath, 'utf-8'))
    file.meta.gasPrice = price
    file.meta.gasPriceUpdatedAt = new Date().toISOString()
    atomicWriteJson(dataPath, file)
    console.log(`[refreshGasPrice] meta.gasPrice updated to ${price}`)
  } catch (err) {
    // message only — never serialize the request config (it carries the key)
    const reason = err instanceof Error ? err.message : String(err)
    console.error(`[refreshGasPrice] refresh failed — keeping last known gas price: ${reason}`)
  }
}
