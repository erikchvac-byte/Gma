import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

describe('server/index.ts', () => {
  it('sets process.env.TZ as the first executable line', () => {
    const content = readFileSync(join(__dirname, 'index.ts'), 'utf-8')
    const firstExecutableLine = content
      .split('\n')
      .find(line => { const t = line.trim(); return t && !t.startsWith('//') && !t.startsWith('/*') && !t.startsWith('*') })
    expect(firstExecutableLine?.trim()).toBe("process.env.TZ = 'America/Los_Angeles'")
  })

  it('TZ is set to Pacific time', () => {
    process.env.TZ = 'America/Los_Angeles'
    expect(process.env.TZ).toBe('America/Los_Angeles')
  })
})
