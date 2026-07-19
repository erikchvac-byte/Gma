import { vi, describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    readFileSync: vi.fn(actual.readFileSync),
  }
})

import { readFileSync } from 'node:fs'
import { makeShellRoute } from './shellRoute.js'
import { buildApiData } from '../utils/buildApiData.js'

const mockedReadFileSync = vi.mocked(readFileSync)

const SHELL_HTML =
  '<!doctype html><html><head><title>gmas list</title></head>' +
  '<body><div id="root"></div></body></html>'

// $-patterns ($$, $&, $`, $') are expanded by String.replace when the
// replacement is a STRING — the route must use a function replacement or
// scraped text like this corrupts the snapshot (review finding). U+2028 is a
// JS line terminator pre-ES2019 and must survive via its unicode escape.
const HOSTILE_TITLE = ['SAVE $$$ TODAY', '$&', '$' + String.fromCharCode(96), "$'", String.fromCharCode(0x2028) + 'END'].join(' ')

// time-invariant fixture: everyday, no time window — active at any test run instant
const FIXTURE_DATA = {
  meta: {
    lastScraperRun: '2026-07-11T00:00:00Z',
    gasPrice: 4.2,
    gasPriceUpdatedAt: '2026-07-11T00:00:00Z',
  },
  dispensaries: [
    {
      id: 'a',
      name: 'Store </script><script>alert(1)</script>',
      url: 'https://example.test',
      distanceMiles: 1,
      stale: false,
      lastFetchedAt: '2026-07-11T00:00:00Z',
      deals: [
        {
          title: HOSTILE_TITLE,
          type: 'discount',
          daysValid: ['everyday'],
          startTime: null,
          endTime: null,
        },
      ],
    },
  ],
}

// route data.json reads to the fixture; everything else (the shell) hits disk
function mockDataJson(content: string | (() => never)) {
  mockedReadFileSync.mockImplementation((file, options) => {
    if (String(file).endsWith('data.json')) {
      if (typeof content === 'function') return content()
      return content
    }
    return realReadFileSync(file, options)
  })
}

let realReadFileSync: typeof readFileSync
let fixtureDir: string
let app: express.Express

beforeAll(async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  realReadFileSync = actual.readFileSync
  fixtureDir = mkdtempSync(path.join(tmpdir(), 'shell-route-'))
  writeFileSync(path.join(fixtureDir, 'index.html'), SHELL_HTML)

  app = express()
  const shellRoute = makeShellRoute(fixtureDir)
  app.get('/', shellRoute)
  app.get(/^(?!\/api).*/, shellRoute)
})

afterAll(() => {
  rmSync(fixtureDir, { recursive: true, force: true })
})

afterEach(() => {
  mockedReadFileSync.mockImplementation(realReadFileSync)
})

function extractSnapshot(html: string): unknown {
  // stops at the FIRST ';window.__GMA_DROPS__' boundary (the two globals share one script)
  const match = html.match(/window\.__GMA_DATA__ = (.*?);window\.__GMA_DROPS__ = /s)
  expect(match).not.toBeNull()
  return JSON.parse(match![1])
}

function extractDrops(html: string): unknown {
  const match = html.match(/window\.__GMA_DROPS__ = (.*?)<\/script>/s)
  expect(match).not.toBeNull()
  return JSON.parse(match![1])
}

describe('shellRoute', () => {
  it('serves the shell with an injected snapshot equal to the /api/data derivation', async () => {
    mockDataJson(JSON.stringify(FIXTURE_DATA))

    const res = await request(app).get('/')

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.headers['cache-control']).toBe('no-cache')
    expect(res.text).toContain('<div id="root">')

    // exactly one injected script (AC1)
    expect(res.text.match(/window\.__GMA_DATA__/g)).toHaveLength(1)

    // derivation parity: the snapshot deep-equals the shared /api/data builder's
    // output (fixture is time-invariant, so back-to-back `now` values agree)
    const snapshot = extractSnapshot(res.text)
    expect(snapshot).toEqual(JSON.parse(JSON.stringify(buildApiData())))

    // the drops snapshot is injected too (ADR-092), exactly once, as a valid honesty
    // envelope — hydrates useValueDrops on first render so it never reflows the feed.
    // (content = the real committed derived file / empty envelope; assert shape, not rows)
    expect(res.text.match(/window\.__GMA_DROPS__/g)).toHaveLength(1)
    const drops = extractDrops(res.text) as { data?: { rows?: unknown } }
    expect(Array.isArray(drops.data?.rows)).toBe(true)
  })

  it('injects on SPA deep links too', async () => {
    mockDataJson(JSON.stringify(FIXTURE_DATA))

    const res = await request(app).get('/some/deep/link')

    expect(res.status).toBe(200)
    expect(res.text).toContain('window.__GMA_DATA__ = ')
  })

  it('escapes < so hostile deal text cannot break out of the script tag', async () => {
    mockDataJson(JSON.stringify(FIXTURE_DATA))

    const res = await request(app).get('/')

    // the raw closing sequence from the store name must not appear anywhere
    expect(res.text).not.toContain('</script><script>alert(1)')
    expect(res.text).toContain('\\u003c/script>\\u003cscript>')
    // and the escaped form parses back to the original text
    const snapshot = extractSnapshot(res.text) as { dispensaries: Array<{ name: string }> }
    expect(snapshot.dispensaries[0].name).toBe('Store </script><script>alert(1)</script>')
  })

  it('survives $-replacement patterns and U+2028 in scraped deal text unchanged', async () => {
    mockDataJson(JSON.stringify(FIXTURE_DATA))

    const res = await request(app).get('/')

    // a string-replacement would have expanded $& into "</head>" — the shell
    // must still contain exactly one </head> and exactly one injected script
    expect(res.text.match(/<\/head>/g)).toHaveLength(1)
    expect(res.text.match(/window\.__GMA_DATA__/g)).toHaveLength(1)

    const snapshot = extractSnapshot(res.text) as {
      dispensaries: Array<{ deals: Array<{ title: string }> }>
    }
    // byte-exact round trip: $$ not collapsed, $& / $` / $' not spliced,
    // U+2028 delivered via its unicode escape
    expect(snapshot.dispensaries[0].deals[0].title).toBe(HOSTILE_TITLE)
  })

  it('serves the plain shell (200, no snapshot) when data.json is malformed JSON', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockDataJson('{ this is not json')

    const res = await request(app).get('/')

    expect(res.status).toBe(200)
    expect(res.text).not.toContain('__GMA_DATA__')
    // the drops snapshot is coupled to the data path: a broken data.json drops both (ADR-092)
    expect(res.text).not.toContain('__GMA_DROPS__')
    expect(res.text).toContain('<div id="root">')
    consoleError.mockRestore()
  })

  it('serves the plain shell (200, no snapshot) when data.json is unreadable', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockDataJson(() => {
      throw new Error('ENOENT: no such file or directory')
    })

    const res = await request(app).get('/')

    expect(res.status).toBe(200)
    expect(res.text).not.toContain('__GMA_DATA__')
    expect(res.text).not.toContain('__GMA_DROPS__')
    expect(res.text).toContain('<div id="root">')
    consoleError.mockRestore()
  })

  it('returns 500 when the shell itself is missing', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const emptyApp = express()
    emptyApp.get('/', makeShellRoute(path.join(fixtureDir, 'does-not-exist')))

    const res = await request(emptyApp).get('/')

    expect(res.status).toBe(500)
    consoleError.mockRestore()
  })
})
