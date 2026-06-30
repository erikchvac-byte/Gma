import { describe, it, expect } from 'vitest'
import { classifyProbe } from './checkStoreLinks.js'

describe('checkStoreLinks / classifyProbe', () => {
  it('treats 2xx and 3xx as ok (redirects are followed but a bare 3xx is still live)', () => {
    expect(classifyProbe({ url: 'https://x.com', status: 200 })).toBe('ok')
    expect(classifyProbe({ url: 'https://x.com', status: 204 })).toBe('ok')
    expect(classifyProbe({ url: 'https://x.com', status: 301 })).toBe('ok')
    expect(classifyProbe({ url: 'https://x.com', status: 399 })).toBe('ok')
  })

  it('flags only a definitive break (404/410) as broken — this is the dead-link alert', () => {
    expect(classifyProbe({ url: 'https://x.com', status: 404 })).toBe('broken')
    expect(classifyProbe({ url: 'https://x.com', status: 410 })).toBe('broken')
  })

  it('does NOT alert on bot-wall / throttle / transient server errors (the false-positive class)', () => {
    expect(classifyProbe({ url: 'https://x.com', status: 403 })).toBe('unknown') // datacenter bot-wall
    expect(classifyProbe({ url: 'https://x.com', status: 429 })).toBe('unknown') // throttle
    expect(classifyProbe({ url: 'https://x.com', status: 500 })).toBe('unknown')
    expect(classifyProbe({ url: 'https://x.com', status: 503 })).toBe('unknown')
  })

  it('treats a transport error as unknown, never a hard alert (flaky network must not red the run)', () => {
    expect(classifyProbe({ url: 'https://x.com', error: 'ETIMEDOUT' })).toBe('unknown')
    expect(classifyProbe({ url: 'https://x.com', error: 'getaddrinfo ENOTFOUND' })).toBe('unknown')
  })

  it('skips stores with no usable http link (plain-text card, out of scope)', () => {
    expect(classifyProbe({ url: undefined })).toBe('skip')
    expect(classifyProbe({ url: '' })).toBe('skip')
    expect(classifyProbe({ url: 'ftp://x.com' })).toBe('skip')
    expect(classifyProbe({ url: 'not-a-url' })).toBe('skip')
  })
})
