import { pathToFileURL, fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import axios from 'axios'
import type { ApiDataResponse, Dispensary } from '../../client/src/types/index.js'

// STORE-LINK LIVENESS GUARD (added 2026-06-30 after `the-vault-silvana` shipped a
// silently-404ing public link). The card link is the dispensary's `url`; for the
// batch Dutchie stores it was historically SYNTHESIZED as
// `dutchie.com/dispensary/<our id>` — a guess that the public slug equals our id.
// Nothing ever fetched it, so a wrong/dead slug rendered as a normal link and 404'd
// on click. The client's only check (`isLinkableUrl`) validates URL *syntax*, not
// that the page exists.
//
// This guard actually GETs every store url and flags the dead ones. It is built to
// run from a RESIDENTIAL IP (the Weedmaps local-runner / Scheduled Task pattern,
// ADR-064): Dutchie — like Weedmaps — 403-walls datacenter IPs, so a GitHub Actions
// CI run cannot tell a real 404 from the bot-wall. From a home IP the status codes
// are truthful.
//
// Philosophy mirrors alertGate: only a DEFINITE break (404/410) reds the run. A
// 403/429 (bot-wall / throttle) or 5xx (transient) is logged as "unknown", never an
// alert — exactly the false-positive class we must avoid.

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export type LinkVerdict = 'ok' | 'broken' | 'unknown' | 'skip'

export interface LinkProbe {
  id: string
  url: string | undefined
  status?: number
  error?: string
}

// Pure classification — no I/O, fully unit-testable. The probe carries the observed
// HTTP status (or a transport error); this decides what it means.
export function classifyProbe(probe: Pick<LinkProbe, 'url' | 'status' | 'error'>): LinkVerdict {
  const { url, status, error } = probe
  // No usable link to check (empty / non-http). The card simply renders plain text;
  // that is not a broken link, so it is out of scope here.
  if (!url || !/^https?:\/\//i.test(url)) return 'skip'
  if (typeof status === 'number') {
    if (status >= 200 && status < 400) return 'ok'
    if (status === 404 || status === 410) return 'broken' // definitively gone
    // 403/429 bot-wall or throttle; 5xx transient server error — ambiguous, not an alert.
    return 'unknown'
  }
  // Transport error (DNS, TLS, timeout): could be a dead domain or a transient blip.
  // Treat as unknown so a flaky network never reds the run; the message is logged.
  if (error) return 'unknown'
  return 'unknown'
}

// Probe one store's link. validateStatus:()=>true so 4xx/5xx come back as data, not
// thrown; redirects are followed (a 301→200 store is fine). Browser-like UA because
// some store sites 403 a bare client.
async function probe(d: Pick<Dispensary, 'id' | 'url'>): Promise<LinkProbe> {
  const url = d.url
  if (!url || !/^https?:\/\//i.test(url)) return { id: d.id, url }
  try {
    const res = await axios.get(url, {
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      },
    })
    return { id: d.id, url, status: res.status }
  } catch (err) {
    return { id: d.id, url, error: (err as Error).message }
  }
}

function loadDispensaries(): Dispensary[] {
  const dataUrlEnv = process.env.DATA_URL
  if (dataUrlEnv) return [] // signal: caller fetches live (handled in main)
  const seed = path.join(__dirname, '../data/data.json')
  const parsed = JSON.parse(readFileSync(seed, 'utf-8')) as ApiDataResponse
  return parsed.dispensaries
}

async function main(): Promise<void> {
  let dispensaries: Dispensary[]
  const dataUrl = process.env.DATA_URL
  if (dataUrl) {
    const res = await axios.get<ApiDataResponse>(dataUrl, { timeout: 30000 })
    dispensaries = res.data?.dispensaries
    if (!Array.isArray(dispensaries)) {
      console.error('[checkStoreLinks] DATA_URL response has no dispensaries array')
      process.exit(1)
    }
  } else {
    dispensaries = loadDispensaries()
  }

  const probes = await Promise.all(dispensaries.map(probe))
  const broken: LinkProbe[] = []
  const unknown: LinkProbe[] = []
  for (const p of probes) {
    const verdict = classifyProbe(p)
    const tag = p.status !== undefined ? String(p.status) : (p.error ?? 'no-url')
    console.log(`[checkStoreLinks] ${verdict.padEnd(7)} ${p.id.padEnd(34)} ${tag}  ${p.url ?? ''}`)
    if (verdict === 'broken') broken.push(p)
    else if (verdict === 'unknown') unknown.push(p)
  }

  console.log(
    `[checkStoreLinks] ${dispensaries.length} stores: ` +
      `${broken.length} broken, ${unknown.length} unknown (bot-wall/transient), ` +
      `${dispensaries.length - broken.length - unknown.length} ok/skip`,
  )

  if (broken.length > 0) {
    console.error(
      `[checkStoreLinks] ALERT: ${broken.length} dead link(s): ` +
        broken.map((p) => `${p.id} (${p.status})`).join(', '),
    )
    process.exit(1)
  }
  console.log('[checkStoreLinks] ok — no dead links')
}

// CLI only when executed directly (not when imported by tests).
const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().catch((err) => {
    console.error('[checkStoreLinks] fatal', err)
    process.exit(1)
  })
}
