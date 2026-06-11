import { closeSync, fsyncSync, openSync, renameSync, rmSync, writeSync } from 'node:fs'
import path from 'node:path'

// Generic atomic JSON write: serialize to a sibling tmp file, fsync it, then
// rename over the target so readers (dataRoute's per-request readFileSync)
// never observe a partial file — and a crash mid-write can't publish a
// truncated data.json. Reused by Epic 4's scraper engine — keep it
// schema-agnostic. NOTE: single-writer only; serialize callers before adding
// a second writer process (see deferred-work).
export function atomicWriteJson(targetPath: string, value: unknown): void {
  const dir = path.dirname(targetPath)
  const base = path.basename(targetPath, '.json')
  const tmpPath = path.join(dir, `${base}.tmp.json`)
  // 2-space indent + trailing newline to match the seed file's format
  const json = `${JSON.stringify(value, null, 2)}\n`
  const fd = openSync(tmpPath, 'w')
  try {
    writeSync(fd, json)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  try {
    renameSync(tmpPath, targetPath)
  } catch (err) {
    // never leave an orphan *.json tmp behind — copyData.mjs and future
    // glob-based tooling would pick it up as real data
    rmSync(tmpPath, { force: true })
    throw err
  }
}
