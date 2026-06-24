import asyncio
import time
from typing import Any

from fastapi import FastAPI, HTTPException

from scraper.browser import BrowserManager
from scraper.fetcher import cloudflare_fetch, tls_fetch
from scraper.interceptor import NetworkInterceptor
from scraper.models import InterceptedPayload, ScrapeRequest, ScrapeResponse

app = FastAPI(title="Scraper API", version="1.0.0", description="Stealth browser scraping service")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/discover")
async def discover(request: ScrapeRequest) -> dict:
    """
    Debug endpoint: loads the page and returns every URL that fired a network
    response. Use this to find the real API pattern before using /scrape.
    """
    start = time.monotonic()
    try:
        async with BrowserManager(headless=request.headless, timeout=request.timeout) as mgr:
            async with mgr.new_page() as page:
                interceptor = NetworkInterceptor(page)
                interceptor.on_all_urls()
                await interceptor.navigate_and_collect(
                    request.url,
                    timeout=request.timeout,
                )
                return {
                    "duration_ms": _elapsed(start),
                    "urls": [{"status": c["status"], "url": c["url"]} for c in interceptor._captured],
                }
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@app.post("/scrape", response_model=ScrapeResponse)
async def scrape(request: ScrapeRequest) -> ScrapeResponse:
    """
    Unified scrape endpoint. Selects the appropriate tier based on request.tier.

    - browser (default): Playwright + stealth + network interception
    - tls:               curl_cffi TLS fingerprint spoof (no JS)
    - cloudflare:        cloudscraper CF challenge solver (no JS)

    For Dutchie menus set tier=browser, intercept_pattern="dutchie\\.com",
    and optionally wait_for_pattern to the specific API endpoint pattern.
    """
    start = time.monotonic()

    if request.tier == "tls":
        return await _run_tls(request, start, tier_label="tls")

    if request.tier == "cloudflare":
        return await _run_cloudflare(request, start)

    return await _run_browser(request, start)


# ---------------------------------------------------------------------------
# Tier implementations
# ---------------------------------------------------------------------------

async def _run_tls(request: ScrapeRequest, start: float, tier_label: str) -> ScrapeResponse:
    try:
        result = await tls_fetch(request.url, timeout=request.timeout // 1000)
        intercepted = (
            [InterceptedPayload(url=request.url, status=result["status"], data=result["data"])]
            if result["type"] == "json"
            else []
        )
        return ScrapeResponse(
            request_url=request.url,
            tier_used=tier_label,
            success=True,
            duration_ms=_elapsed(start),
            intercepted=intercepted,
            raw_html=result["data"] if result["type"] == "html" else None,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


async def _run_cloudflare(request: ScrapeRequest, start: float) -> ScrapeResponse:
    try:
        result = await asyncio.to_thread(cloudflare_fetch, request.url)
        intercepted = (
            [InterceptedPayload(url=request.url, status=result["status"], data=result["data"])]
            if result["type"] == "json"
            else []
        )
        return ScrapeResponse(
            request_url=request.url,
            tier_used="cloudflare",
            success=True,
            duration_ms=_elapsed(start),
            intercepted=intercepted,
            raw_html=result["data"] if result["type"] == "html" else None,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


async def _run_browser(request: ScrapeRequest, start: float) -> ScrapeResponse:
    try:
        async with BrowserManager(headless=request.headless, timeout=request.timeout) as mgr:
            async with mgr.new_page() as page:
                interceptor = NetworkInterceptor(page)
                if request.intercept_pattern:
                    interceptor.on_url(request.intercept_pattern)

                captured = await interceptor.navigate_and_collect(
                    request.url,
                    wait_for_pattern=request.wait_for_pattern,
                    scroll_after_wait=request.scroll_after_wait,
                    timeout=request.timeout,
                )

                html = await page.content() if not captured else None

                return ScrapeResponse(
                    request_url=request.url,
                    tier_used="browser+stealth",
                    success=True,
                    duration_ms=_elapsed(start),
                    intercepted=[InterceptedPayload(**p) for p in captured],
                    raw_html=html,
                )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


def _elapsed(start: float) -> float:
    return (time.monotonic() - start) * 1000
