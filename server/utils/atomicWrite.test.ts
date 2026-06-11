import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { atomicWriteJson } from './atomicWrite.js'

describe('atomicWriteJson', () => {
  let dir: string
  let target: string

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'atomic-write-'))
    target = path.join(dir, 'data.json')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('writes parseable JSON to the target path', () => {
    atomicWriteJson(target, { meta: { gasPrice: 4.39 } })

    expect(JSON.parse(readFileSync(target, 'utf-8'))).toEqual({ meta: { gasPrice: 4.39 } })
  })

  it('replaces existing content entirely', () => {
    writeFileSync(target, '{"old":true}', 'utf-8')

    atomicWriteJson(target, { fresh: 1 })

    expect(JSON.parse(readFileSync(target, 'utf-8'))).toEqual({ fresh: 1 })
  })

  it('leaves no sibling tmp file behind', () => {
    atomicWriteJson(target, [1, 2, 3])

    expect(existsSync(path.join(dir, 'data.tmp.json'))).toBe(false)
  })

  it('formats with 2-space indent and a trailing newline (seed-file format)', () => {
    atomicWriteJson(target, { a: 1 })

    expect(readFileSync(target, 'utf-8')).toBe('{\n  "a": 1\n}\n')
  })

  it('cleans up the tmp file when the rename fails', () => {
    // renaming a file over an existing non-empty directory throws on all platforms
    const dirTarget = path.join(dir, 'blocked.json')
    mkdirSync(dirTarget)
    writeFileSync(path.join(dirTarget, 'occupant.txt'), 'x', 'utf-8')

    expect(() => atomicWriteJson(dirTarget, { a: 1 })).toThrow()
    expect(existsSync(path.join(dir, 'blocked.tmp.json'))).toBe(false)
  })
})
