import type { Request, Response } from 'express'
import { buildApiData } from '../utils/buildApiData.js'

export function dataRoute(_req: Request, res: Response) {
  try {
    res.json(buildApiData())
  } catch (err) {
    console.error('[dataRoute]', err)
    res.status(500).json({ error: 'Internal server error', code: 'SERVER_ERROR' })
  }
}
