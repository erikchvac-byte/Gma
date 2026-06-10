import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useLocalStorage } from './useLocalStorage'

describe('useLocalStorage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the initial value when the key is absent', () => {
    const { result } = renderHook(() => useLocalStorage('gma_test_key', false))
    expect(result.current[0]).toBe(false)
  })

  it('returns the parsed stored value when present', () => {
    localStorage.setItem('gma_test_key', JSON.stringify(true))
    const { result } = renderHook(() => useLocalStorage('gma_test_key', false))
    expect(result.current[0]).toBe(true)
  })

  it('setValue updates React state and localStorage', () => {
    const { result } = renderHook(() => useLocalStorage('gma_test_key', false))

    act(() => {
      result.current[1](true)
    })

    expect(result.current[0]).toBe(true)
    expect(localStorage.getItem('gma_test_key')).toBe('true')
  })

  it('falls back to initialValue when stored JSON is invalid', () => {
    localStorage.setItem('gma_test_key', 'not-json')
    const { result } = renderHook(() => useLocalStorage('gma_test_key', false))
    expect(result.current[0]).toBe(false)
  })

  it('falls back to initialValue when reading storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })

    const { result } = renderHook(() => useLocalStorage('gma_test_key', false))
    expect(result.current[0]).toBe(false)
  })

  it('still updates React state when writing to storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    const { result } = renderHook(() => useLocalStorage('gma_test_key', false))

    act(() => {
      result.current[1](true)
    })

    expect(result.current[0]).toBe(true)
  })

  it('keeps a stable setValue identity across re-renders', () => {
    const { result, rerender } = renderHook(() => useLocalStorage('gma_test_key', false))
    const firstSetValue = result.current[1]

    act(() => {
      result.current[1](true)
    })
    rerender()

    expect(result.current[1]).toBe(firstSetValue)
  })
})
