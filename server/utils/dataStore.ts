let tail: Promise<unknown> = Promise.resolve()

// Runs `fn` only after all previously-queued calls have settled (success or
// failure), serializing every read-modify-write critical section against
// server/data/data.json. Single in-process mutex — sufficient because this
// app runs as one Node process (ADR-010); do not add cross-process locking.
export function withDataLock<T>(fn: () => Promise<T> | T): Promise<T> {
  const result = tail.then(fn, fn)
  tail = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}
