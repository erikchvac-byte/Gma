import { describe, it, expect } from 'vitest'
import { withDataLock } from './dataStore.js'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('withDataLock', () => {
  it('serializes overlapping calls — the second does not start until the first resolves', async () => {
    const events: string[] = []

    const first = withDataLock(async () => {
      events.push('first-start')
      await delay(20)
      events.push('first-end')
    })

    const second = withDataLock(async () => {
      events.push('second-start')
      await delay(5)
      events.push('second-end')
    })

    await Promise.all([first, second])

    expect(events).toEqual(['first-start', 'first-end', 'second-start', 'second-end'])
  })

  it('does not deadlock when a queued fn throws/rejects — later calls still run', async () => {
    const failing = withDataLock(() => {
      throw new Error('boom')
    })

    await expect(failing).rejects.toThrow('boom')

    const events: string[] = []
    await withDataLock(() => {
      events.push('ran-after-failure')
    })

    expect(events).toEqual(['ran-after-failure'])
  })
})
