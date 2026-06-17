> ⚠️ **PARKED IDEA — NOT a job, NOT a spec, NOT a source of truth.**
> This is an exploratory plan from a brainstorming session. Nothing here is decided or committed.
> Do **not** treat it as a story/task to execute, and do **not** cite it as authoritative project state.
> Two decision gates (§1) are unresolved. Revisit only if/when Erik chooses to act on it.
> Origin: `_bmad-output/brainstorming/brainstorming-session-2026-06-17-0700.md` · For real current state, check live sources, not this file.

---

# Scraper Self-Host Build Plan — Dedicate Home Hardware (PARKED)

**Status:** Parked exploration. Gate A decided **2026-06-17: Path B (push)**. Gate B resolved. Not built — parked pending Erik's go-ahead to implement.
**Date:** 2026-06-17
**Relationship to ADR-033:** This would be a **$0/mo home-hardware alternative** to ADR-033's recommended paid Render private-Docker topology (~$14/mo). (Intentionally NOT recorded as an ADR — it's not a decision yet.)

## Problem this would solve

On live `gmaslist.com`, 3 of 4 sources show **stale** (`kush21-everett-evergreen`, `the-joint-everett`, `jet-cannabis-everett`); only `remedy-tulalip` is fresh. Cause: the 3 Dutchie scrapers POST to `http://localhost:8000/scrape` — the **Python Playwright microservice (`C:\Users\erikc\Dev\Scraper`, ADR-017) is not hosted**. `scraperClient.ts` swallows the failure → those dispensaries go stale. (EIA gas price is unrelated and already working in prod.)

---

## 1. Decision gates — would need resolving BEFORE building

### Gate A — Architecture: Path A (tunnel) vs Path B (push) → ✅ CHOSEN: **Path B (push)** (Erik, 2026-06-17)

Current design is **pull**: the Render Node app runs `runScrapers()` and calls out to the scraper at `SCRAPER_URL` (`scraperClient.ts`, env-overridable per ADR-033). Two ways to put the scraper on home hardware:

| | **Path A — keep pull, tunnel the box** | **Path B — invert to push** |
|---|---|---|
| Box runs | Python scraper only | Python scraper **+** the scrape orchestration loop |
| Render code change | ~zero (`SCRAPER_URL` → tunnel hostname) | new authenticated **ingest endpoint**; Render stops scraping, serves last-known |
| Home→cloud link | Cloudflare Tunnel (box dials **out**) | box POSTs results **out** to Render |
| Network exposure | none (outbound-only) | none (outbound-only) |
| **Free-tier spin-down** (see §2) | ⚠️ **Not solved** — Happy's free Render service spins down, so its in-process hourly `setInterval` is unreliable. Needs a keep-warm pinger **or** Happy on a paid always-on plan. | ✅ **Solved** — the always-on home box owns the schedule; Happy free tier just serves what it was last sent. |
| Effort | Low | Medium (refactor + endpoint + auth) |
| Robustness | source goes stale for an hour if box/tunnel drops | app keeps serving last-known even if box dies |

**Leaning:** Given Erik already has **always-on home hardware**, **Path B is the better fit for a $0/mo target** — the always-on thing should own the schedule, which sidesteps free-tier spin-down. Path A is faster to stand up but inherits spin-down unless paired with an external keep-warm pinger or a paid Happy plan.

### Gate B — Scraper source location ✅ RESOLVED

Repo confirmed at **`C:\Users\erikc\Dev\Scraper`**, **Dockerized**:
- `Dockerfile` → `FROM mcr.microsoft.com/playwright/python:v1.60.0-noble` (browsers pre-baked — do **not** run `playwright install`), `EXPOSE 8000`.
- `docker-compose.yml` → `shm_size: "2gb"`.
- FastAPI + Uvicorn + Playwright 1.60.0 + stealth; TLS-fingerprint fallback (curl-cffi, cloudscraper).

Box-side install would be **Docker + `docker compose up`**, not manual Python/Playwright.

---

## 2. Hardware sizing

**Box:** Intel **DH61AG** thin Mini-ITX (LGA1155, 2nd/3rd-gen Core), low power → good for 24/7.

| Resource | Need | DH61AG | Verdict |
|---|---|---|---|
| CPU | Light — scrapes a few sites hourly | 2nd/3rd-gen Core | ✅ ample |
| **RAM** | **Playwright/Chromium wants ~2GB shm + Chromium overhead** | **4GB installed** | ⚠️ **tight** |
| Disk | Container image + OS, a few GB | 3.5" HDD | ✅ fine (SSD nicer for boot) |
| Network | Outbound HTTPS only | LAN | ✅ |

> 4GB is plenty for the *Node* app, but the **Python Playwright service is the memory-hungry part** (2GB shm + a Chromium instance). **Recommend bumping the DH61AG to 8GB DDR3 SO-DIMM** (board supports 16GB across 2 slots). 4GB can work if scrapes run one site at a time and the box does nothing else.

---

## 3. Build steps (sketch)

> Assumes **Path A** unless noted; Path B adds the orchestration move + ingest endpoint (§3.6).

**3.1 Hardware prep** — (rec.) install 8GB RAM; BIOS **Restore on AC Power Loss → Power On**; attach monitor/keyboard for install only.

**3.2 OS install** — Ubuntu Server 24.04 LTS, enable **OpenSSH**; give the box a **DHCP reservation** (or static outside the pool) to avoid IP conflict with the work PC and give a stable SSH target; unplug monitor, manage via `ssh user@<box-ip>` from Windows. _(Box is a LAN peer, not a gateway — cannot knock the work PC offline.)_

**3.3 Harden** — SSH key-only (disable password); `unattended-upgrades`.

**3.4 Run the scraper (Docker)** — install Docker + compose; copy `C:\Users\erikc\Dev\Scraper` to the box; `docker compose up -d` (binds `127.0.0.1:8000`, compose sets `shm_size: 2gb`); verify `curl localhost:8000/health` → `{"status":"ok"}`; set restart policy `unless-stopped`.

**3.5 Connect home → cloud (Cloudflare Tunnel, outbound-only)** — install `cloudflared`, auth to a free Cloudflare account, map e.g. `scraper.gmaslist.com` → `http://localhost:8000` (box dials **out** — no port-forward/static IP/router change); run as a service; set Render `SCRAPER_URL = https://scraper.gmaslist.com/scrape`; optionally lock down with Cloudflare Access so only Render can call it.

**3.6 Path B only** — move `runScrapers()` to the box (all 4 scrapers local; Python stays `localhost:8000`, no tunnel needed); add an authenticated `POST /api/ingest` on Render with a shared secret; box POSTs assembled `data.json`; Render stops its `setInterval` scraping and serves last-ingested. This is what removes the spin-down dependency.

**3.7 Trigger reliability (free Happy tier)** — Path A: external keep-warm ping (cron-job.org / UptimeRobot → `https://gmaslist.com` every ~10 min) or upgrade Happy. Path B: N/A — box scheduler drives it.

---

## 4. Failure guards (from Phase 3 — Failure Analysis)

| Failure | Guard |
|---|---|
| Power outage | BIOS Restore-on-AC → Power On; Docker `restart: unless-stopped` + `cloudflared` auto-start. UPS optional. |
| Scraper container crash | Docker `restart: unless-stopped`. |
| Whole box freezes | Optional hardware watchdog auto-reboots. |
| **Box dies silently at 3am** | Passive: app shows "Last updated" + "N sources unavailable". Active: dead-man's-switch heartbeat (healthchecks.io) emails/texts on a missed check-in. |
| Home internet outage | Graceful: app serves last-known w/ stale timestamp; tunnel + container auto-reconnect. |
| Tunnel/Render drop | `postScrape()` returns `[]` → stale that hour, retries next cycle; `cloudflared` reconnects. |
| IP conflict / LAN | DHCP reservation / static outside pool; box is a peer, not a gateway. |
| Security | Outbound-only (no inbound port-forward — tunnel dials out); SSH key-only; `unattended-upgrades`; optional Cloudflare Access. |

---

## 5. Cost

| | Self-host (this plan) | ADR-033 (Render Docker) |
|---|---|---|
| Hosting | **$0/mo** | ~$14/mo |
| Hardware | spare DH61AG (+ optional ~$15 8GB RAM) | none |
| Power | ~$2–6/mo electricity | included |
| Tradeoff | depends on home power + internet uptime | managed, always-on |

---

## 6. Verification (if/after built)

1. Box `curl localhost:8000/health` → ok.
2. Tunnel `curl https://scraper.gmaslist.com/health` from elsewhere → ok.
3. After a scrape cycle, `https://gmaslist.com/api/data` shows the 3 Dutchie sources `stale: false`.
4. `gmaslist.com` renders their cards (incl. urgent/happy-hour variants once live data carries them).
5. Power the box off → confirm the healthchecks.io alert fires.

---

## Open items
- **Gate A:** ✅ DECIDED 2026-06-17 — **Path B (push)**: always-on box runs all scrapers + orchestration and POSTs to a new authenticated ingest endpoint on Render; Happy stays free and serves last-known (sidesteps spin-down).
- **Gate B:** ✅ resolved — `C:\Users\erikc\Dev\Scraper`, Dockerized.
- RAM bump to 8GB recommended (optional).
- **Remaining before build:** Erik's explicit go-ahead to implement. Path B includes a **Render-app code change** (ingest endpoint + auth, move `runScrapers()` off Render) that should run through the normal BMad story flow, plus the box-side OS/Docker/scheduler setup (§3, §3.6).
