import type { Request, Response } from 'express'

// Liveness/keep-warm endpoint. Its sole job is to be the cheapest possible
// request that still wakes and holds the Render free-tier instance: the free
// web tier spins the service down after ~15 min idle, so an external uptime
// monitor (UptimeRobot / cron-job.org) pings this every ~5 min to keep the
// single instance awake — otherwise AI crawlers (GPTBot, Google-Extended,
// PerplexityBot) hit a cold instance and index Render's "service waking up"
// holding page instead of the SSR'd deals (shellRoute). Deliberately does NO
// file reads or derivation (unlike /api/data or /) so each ping is near-free
// and can never 500 the keep-warm signal. Registered before the SPA fallback
// so it returns JSON, not the React shell.
export function healthzRoute(_req: Request, res: Response) {
  res.json({ status: 'ok', time: new Date().toISOString() })
}
