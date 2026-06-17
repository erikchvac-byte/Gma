---
stepsCompleted: [1, 2]
inputDocuments: []
session_topic: 'Self-hosting the Gma scraper service locally on spare hardware'
session_goals: 'Decide whether to host the scraper at home, what hardware fits, and how it connects to the Render-hosted app'
selected_approach: 'ai-recommended'
techniques_used: ['First Principles Thinking', 'Morphological Analysis']
ideas_generated: []
chosen_hardware: 'Intel DH61AG thin Mini-ITX box, 4GB RAM (LGA1155, 2nd/3rd-gen Core)'
context_file: ''
---

# Brainstorming Session Results

**Facilitator:** Erikc
**Date:** 2026-06-17

## Session Overview

**Topic:** Self-hosting the Gma scraper service locally on spare hardware
**Goals:** Decide whether home-hosting the scraper is viable, size the hardware, and figure out how a home box reaches the live Render app.

### Session Setup

Triggered from a finding that 3 of 4 data sources are "unavailable" on the live site because the Python scraper service (`localhost:8000`) was never deployed. Erik has spare hardware and wants to explore using it as the scraper host.

## Technique Execution Results

### Phase 1 — First Principles Thinking (complete)

**Real requirements of the scraper, stripped to fundamentals:**

- Compute: trivial. Python hitting 4 sites on a schedule → a few hundred MB RAM, near-zero sustained CPU.
- Therefore: **any** of Erik's boxes is overkill. Compute is a non-issue, not a constraint.

**Hardware chosen: Intel DH61AG thin Mini-ITX, 4GB RAM.**

- 4GB RAM: comfortable for a dedicated headless scraper (Ubuntu Server ~0.4–1GB + scraper few hundred MB).
- Board is LGA1155/H61 (2nd/3rd-gen Core) — won't seat the i7-45xx Haswell mentioned earlier (that's a different tower). Doesn't affect viability.
- Thin Mini-ITX = low power draw, good for 24/7. Largely neutralizes the "is the electricity worth it?" concern that a full tower raised.
- Headless + SSH from Windows confirmed as the management model (Windows has built-in OpenSSH client; install OS once with monitor, then run monitor-less).

**First-principles conclusion:** The box is not the hard part. The only real design problem is the **home → Render connection**. That is the focus of Phase 2.

### Phase 2 — Morphological Analysis (in progress)

_Goal: map the parameter axes of a self-hosted scraper feeding the Render app, then read off viable full combinations._

**Connection axis (Axis C) — CORRECTED after reading the code.**

Initial assumption was that the app pulls a finished feed and a "push" model is trivial. Reading `server/index.ts`, `utils/runScrapers.ts`, and `utils/scraperClient.ts` corrected this:

- The **Render Node app itself** runs `runScrapers()` hourly, in-process, and writes `data.json` (served by `/api/data`).
- For the 3 Dutchie sources, each Node scraper calls `postScrape()` → HTTP POST to `SCRAPER_URL` (default `http://localhost:8000/scrape`) → a **Python FastAPI + Playwright microservice** (ADR-017). Remedy-Tulalip scrapes directly on Render (no Python service) — which is why it's the one live source.
- `SCRAPER_URL` is already an **env-var override (ADR-033)**.

**Implication:** the current design is PULL — Render *calls* the scraper. So self-hosting the Python service means Render must reach the home box (inbound to home), not the box pushing out. Two viable architectures result:

- **Path A — keep PULL, tunnel the box out (minimal code).** Python service runs on the DH61AG box. Box runs **Cloudflare Tunnel** (`cloudflared`) — which dials *outbound* to Cloudflare and gets a stable HTTPS hostname, with **no port-forward, no static IP, no router changes**. Set Render's `SCRAPER_URL` to that hostname. Code change ≈ zero (one env var). Box stays outbound-only → meets the "don't expose my network" requirement. Remedy keeps scraping on Render untouched; only the 3 broken sources route to the box.
- **Path B — invert to true PUSH (refactor).** Move the whole scrape loop to the box (Node scrapers + Python service, localhost only). Box assembles `data.json` and POSTs it to a new authenticated **ingest endpoint** on Render; Render stops scraping and serves last-known. More robust (survives box downtime, app never blocks on a scrape) but a real refactor + new endpoint + auth.

**Recommendation: Path A** for first cut (fastest to live, outbound-only, near-zero code, incremental), with Path B as a later robustness upgrade. _Both_ satisfy "box only makes outbound connections."

### Phase 3 — Failure Analysis (complete)

Deliberately break the Path A plan; attach a guard to each failure:

| Failure | Guard |
|---|---|
| Power outage | BIOS **Restore on AC Power Loss → Power On** (auto-boot); scraper auto-starts on boot via systemd. Small UPS optional (low-power board → skippable). |
| Scraper process crashes | Run Python service as a **systemd unit, `Restart=always`**; schedule via **systemd timer** (survives reboot, logs to journald). |
| Whole box freezes (kernel hang) | Optional hardware **watchdog** (`systemd`/`watchdog` daemon) auto-reboots a hung box. Cheap, optional. |
| **Box dies silently at 3am — would you know?** | Passive: app already shows "Last updated" + "N sources unavailable". Active: **dead-man's-switch heartbeat** — each successful run pings healthchecks.io; a missed check-in emails/texts you. You learn before users do. |
| Home internet outage | Graceful: app serves last-known w/ stale timestamp; box + tunnel auto-reconnect when net returns. No corruption. |
| Tunnel drops / Render unreachable | `postScrape()` already returns `[]` on failure → source goes stale that hour, retries next cycle. `cloudflared` auto-reconnects. |
| IP conflict / LAN disruption | DHCP reservation (or static IP outside the pool). Box is a LAN peer, not a gateway → cannot knock the work PC offline. |
| Security | Outbound-only (no inbound port-forward — tunnel dials out). SSH **key-only** (disable password auth); enable `unattended-upgrades`; restrict tunnel access. |
| Secrets (EIA_API_KEY etc.) | Store in a systemd `EnvironmentFile` on the box, not in repo. **Open item:** no real `EIA_API_KEY` set yet. |

## Build Plan (Path A — recommended first cut)

**Goal:** the 3 dead Dutchie sources go live by running the Python scraper microservice on the DH61AG box, reached by Render over an outbound Cloudflare Tunnel.

1. **OS install.** Ubuntu Server 24.04 LTS on the DH61AG (monitor + keyboard for setup only). Enable OpenSSH during install. Give it a DHCP reservation / static IP outside the pool. Unplug monitor; manage via `ssh user@<box-ip>` from Windows.
2. **Harden base.** SSH key-only (disable password auth), enable `unattended-upgrades`, set BIOS "Restore on AC Power Loss → Power On".
3. **Run the Python scraper microservice.** Pull the scraper repo (the FastAPI + Playwright service behind ADR-017), install deps + Playwright browsers, run it bound to `127.0.0.1:8000` as a **systemd unit** (`Restart=always`). Verify `curl localhost:8000` locally.
4. **Cloudflare Tunnel.** Install `cloudflared` on the box, authenticate to a (free) Cloudflare account, create a named tunnel mapping a hostname (e.g. `scraper.gmaslist.com`) → `http://localhost:8000`. Run `cloudflared` as a systemd unit. The box dials out — no router changes.
5. **Point Render at it.** Set `SCRAPER_URL = https://scraper.gmaslist.com/scrape` on the Render service. Redeploy/restart. Next hourly run, the 3 Dutchie sources should fetch through the tunnel.
6. **Verify.** Watch Render logs for successful scrapes; confirm `/api/data` shows the 3 sources non-stale and `gmaslist.com` renders their cards (incl. any happy-hour/urgent variants).
7. **Heartbeat.** Add a healthchecks.io check; have the run ping it on success. Confirm you get an alert when the box is off.

**Deferred (Path B upgrade, later):** invert orchestration so the box runs all 4 scrapers and pushes a finished `data.json` to a new authenticated ingest endpoint; Render stops scraping. Buys downtime-resilience and drops the tunnel.

**Open items to resolve before/at execution:**
- Confirm Path A vs Path B.
- Locate the Python scraper service repo/source (not in the Happy repo — referenced as a separate service).

**EIA_API_KEY — RESOLVED (no action needed).** Verified 2026-06-17: the key is set both locally (`.env`) and on the Render service, and it is *working in production*. Live `/api/data` shows `gasPrice: 5.343`, `gasPriceUpdatedAt: 2026-06-17T17:38Z` — refreshing live, not frozen. The earlier "frozen at Jun-9 / key missing" conclusion was a false alarm caused by reading the committed seed `server/data/data.json` instead of the live endpoint. Live dispensary status confirms the only real gap is the 3 Dutchie sources (stale) awaiting the self-hosted Python scraper.
