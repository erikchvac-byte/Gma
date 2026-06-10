import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useNow } from './useNow'

const start = new Date(2026, 5, 10, 23, 0)

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(start)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the current time on first render', () => {
    const { result } = renderHook(() => useNow())
    expect(result.current.getTime()).toBe(start.getTime())
  })

  it('does not update before the interval elapses', () => {
    const { result } = renderHook(() => useNow())
    act(() => {
      vi.advanceTimersByTime(59999)
    })
    expect(result.current.getTime()).toBe(start.getTime())
  })

  it('advances every 60 seconds by default', () => {
    const { result } = renderHook(() => useNow())
    act(() => {
      vi.advanceTimersByTime(60000)
    })
    expect(result.current.getTime()).toBe(start.getTime() + 60000)
    act(() => {
      vi.advanceTimersByTime(60000)
    })
    expect(result.current.getTime()).toBe(start.getTime() + 120000)
  })

  it('honors a custom interval', () => {
    const { result } = renderHook(() => useNow(1000))
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current.getTime()).toBe(start.getTime() + 1000)
  })

  it('clears the interval on unmount', () => {
    const { unmount } = renderHook(() => useNow())
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
