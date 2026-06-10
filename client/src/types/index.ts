export interface Deal {
  type: 'happy_hour' | 'daily'
  description: string
  discountPct: number
  startTime: string | null
  endTime: string | null
  daysValid: string[]
}

export interface Dispensary {
  id: string
  name: string
  url: string
  distanceMiles: number
  stale: boolean
  lastFetchedAt: string
  deals: Deal[]
}

export interface Meta {
  lastScraperRun: string
  gasPrice: number
  nationalMpg: number
  gasPriceUpdatedAt: string
}

export interface ApiDataResponse {
  meta: Meta
  dispensaries: Dispensary[]
}
