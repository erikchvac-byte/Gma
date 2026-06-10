import { cpSync, mkdirSync } from 'node:fs'

mkdirSync('dist/server/data', { recursive: true })
cpSync('data', 'dist/server/data', { recursive: true })
