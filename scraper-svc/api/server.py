import asyncio
import json
import re
import time
from typing import Any, Optional
from urllib.parse import parse_qs, urlparse

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
                    timeout=request.timeout,
                )

                # Opt-in: walk the Dutchie numbered menu in-page off a captured
                # FilteredProducts template, appending every page to the capture set.
                if request.paginate and request.paginate.types:
                    template = _find_filtered_products_template(
                        captured, request.wait_for_pattern
                    )
                    if template:
                        # Defense-in-depth: the walk is fail-soft by construction
                        # (every page path returns None instead of raising), but an
                        # unexpected raise must degrade to the page-0 capture we
                        # already hold, never to a 502 that discards it.
                        try:
                            await interceptor.paginate_filtered_products(
                                template,
                                request.paginate.types,
                                per_page=request.paginate.per_page,
                                max_pages=request.paginate.max_pages,
                            )
                        except Exception as exc:
                            print(f"[paginate] walk failed unexpectedly ({exc!r}) — returning captures collected so far")
                        captured = list(interceptor._captured)
                    else:
                        print("[paginate] no usable FilteredProducts template captured — walk skipped, page-0 capture only")

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


def _find_filtered_products_template(
    captured: list[dict], wait_for_pattern: Optional[str]
) -> Optional[str]:
    """Pick a captured FilteredProducts GET URL usable as a pagination template:
    one whose `variables` parse and carry a dict `productsFilter` and a `page`. The
    page-walk rewrites those, preserving the persisted-query hash + dispensaryId.

    PREFERS a template whose scoping filters (productIds / subcategories /
    strainTypes) are already unconstrained: homepage carousels can be pinned to
    explicit productIds (live-confirmed in the committed kushmart-north fixture),
    and capture order is a network race — first-match selection of a pinned
    template would silently collapse the whole walk to that ~25-product subset.
    Falls back to a pinned template only when no unconstrained one was captured
    (the rewrite clears the scoping keys defensively)."""
    pattern = wait_for_pattern or "FilteredProducts"
    fallback: Optional[str] = None
    for entry in captured:
        url = entry.get("url", "")
        if not re.search(pattern, url):
            continue
        try:
            variables = json.loads(parse_qs(urlparse(url).query)["variables"][0])
        except (KeyError, IndexError, ValueError, TypeError):
            continue
        if not isinstance(variables, dict) or "page" not in variables:
            continue
        pf = variables.get("productsFilter")
        if not isinstance(pf, dict):
            continue
        if all(not pf.get(key) for key in ("productIds", "subcategories", "strainTypes")):
            return url  # unconstrained — ideal template
        if fallback is None:
            fallback = url
    return fallback


def _elapsed(start: float) -> float:
    return (time.monotonic() - start) * 1000
