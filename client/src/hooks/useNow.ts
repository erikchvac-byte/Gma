import { useEffect, useState } from 'react'

// Current time, re-rendering every intervalMs (default 60s). The clock lives
// above the cards: components consume the Date, never their own intervals.
export function useNow(intervalMs = 60000): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return now
}
