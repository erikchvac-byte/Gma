import type { Deal } from '../../client/src/types/index.js'

export type ScraperResult = Deal[]

export type LogEntry = string // "ok" | `error: ${string}`

export interface LogRun {
  runAt: string
  results: Record<string, LogEntry>
}
