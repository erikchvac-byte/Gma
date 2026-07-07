import { describe, it, expect } from 'vitest'
import { wrapEnvelope, isEnvelope } from './derivedEnvelope.js'

describe('wrapEnvelope', () => {
  it('produces the four-key envelope shape with an ISO generatedAt', () => {
    const envelope = wrapEnvelope({ hello: 'world' }, [{ reason: 'unmatched', count: 3 }], { total: 5 })
    expect(envelope.data).toEqual({ hello: 'world' })
    expect(envelope.excluded).toEqual([{ reason: 'unmatched', count: 3 }])
    expect(envelope.coverage).toEqual({ total: 5 })
    expect(() => new Date(envelope.generatedAt).toISOString()).not.toThrow()
    expect(new Date(envelope.generatedAt).toISOString()).toBe(envelope.generatedAt)
  })
})

describe('isEnvelope', () => {
  it('accepts a well-formed envelope', () => {
    const envelope = wrapEnvelope({ a: 1 }, [], {})
    expect(isEnvelope(envelope)).toBe(true)
  })

  it('rejects an array', () => {
    expect(isEnvelope([1, 2, 3])).toBe(false)
  })

  it('rejects an object missing required keys', () => {
    expect(isEnvelope({ data: {} })).toBe(false)
    expect(isEnvelope({ data: {}, excluded: [], coverage: {} })).toBe(false) // no generatedAt
  })

  it('rejects a bare (un-enveloped) report', () => {
    expect(isEnvelope({ totalRecords: 5, disparities: [] })).toBe(false)
  })

  it('rejects null and primitives', () => {
    expect(isEnvelope(null)).toBe(false)
    expect(isEnvelope('hello')).toBe(false)
    expect(isEnvelope(42)).toBe(false)
  })
})
