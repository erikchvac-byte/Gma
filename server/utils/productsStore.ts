import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { atomicWriteJson } from './atomicWrite.js'
import { withDataLock } from './dataStore.js'
import type { ProductRecord, ProductsFile } from '../types/index.js'

// Longitudinal product-price dataset store (SPEC-dutchie-product-pricing CAP-6,
// ADR-053). APPEND-ONLY: each scrape adds a fresh timestamped observation per
// product rather than overwriting the latest, so price changes are trackable and
// the dataset is exportable over time (the export format IS this JSON file).
//
// Durability is by COMMIT-BACK (Erik's decision 2026-06-24): CI appends + commits
// products.json into the repo, so history survives Render's ephemeral disk. The
// pure functions below are wiring-agnostic — they read/write a JSON file and never
// touch data.json or the deals contract.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const DEFAULT_PRODUCTS_PATH = path.join(__dirname, '../data/products.json')

const PRODUCT_KEY = (dispensaryId: string, productId: string) => `${dispensaryId}::${productId}`

function emptyFile(): ProductsFile {
  return { lastUpdated: '', products: {} }
}

// Read the committed dataset. A missing or malformed file degrades to an empty
// dataset (first run / corruption) rather than throwing — mirrors the rest of the
// pipeline's fail-soft posture.
export function readProducts(productsPath: string = DEFAULT_PRODUCTS_PATH): ProductsFile {
  if (!existsSync(productsPath)) return emptyFile()
  try {
    const parsed = JSON.parse(readFileSync(productsPath, 'utf-8')) as ProductsFile
    if (!parsed || typeof parsed !== 'object' || typeof parsed.products !== 'object') {
      return emptyFile()
    }
    return parsed
  } catch {
    return emptyFile()
  }
}

// Merge a batch of freshly-normalized records (each carrying exactly one new
// observation in `history`) into the existing dataset. Existing products get the
// new observation APPENDED to their history and their descriptive identity refreshed
// to the latest scrape; unseen products are added. Pure: returns a new ProductsFile,
// does not mutate the input. Records with empty history are ignored.
export function applyProductObservations(
  existing: ProductsFile,
  incoming: ProductRecord[],
  now: string,
): ProductsFile {
  const products: Record<string, ProductRecord> = { ...existing.products }

  for (const rec of incoming) {
    const observation = rec.history[0]
    if (!observation) continue
    const key = PRODUCT_KEY(rec.dispensaryId, rec.productId)
    const prior = products[key]
    if (prior) {
      products[key] = {
        // refresh descriptive identity to the latest scrape...
        ...rec,
        // ...but keep the full history and append the new observation
        history: [...prior.history, observation],
      }
    } else {
      products[key] = { ...rec, history: [observation] }
    }
  }

  return { lastUpdated: now, products }
}

// Look up one product's full record (incl. observation history) by identity.
export function getProduct(
  file: ProductsFile,
  dispensaryId: string,
  productId: string,
): ProductRecord | undefined {
  return file.products[PRODUCT_KEY(dispensaryId, productId)]
}

// Read → apply → atomic write, serialized against other writers via withDataLock.
// The single write path used by the scrape/commit-back CLI.
export async function persistProductObservations(
  incoming: ProductRecord[],
  now: string,
  productsPath: string = DEFAULT_PRODUCTS_PATH,
): Promise<ProductsFile> {
  return withDataLock(() => {
    const merged = applyProductObservations(readProducts(productsPath), incoming, now)
    atomicWriteJson(productsPath, merged)
    return merged
  })
}
