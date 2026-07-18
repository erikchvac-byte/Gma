import asyncio
import json
import re
from typing import Any, Optional
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from playwright.async_api import Page, Response


# ---------------------------------------------------------------------------
# Dutchie FilteredProducts numbered-pagination helpers (pure — unit tested).
#
# The embed menu paginates via NUMBERED pages (a `page` variable, zero-indexed,
# perPage=100), NOT infinite scroll — so scrolling captures nothing past page 1.
# We instead lift ONE captured FilteredProducts GET URL as a template and rewrite
# its `variables` to walk every page of every category. Rewriting is a pure string
# transform (below); the actual fetch must run same-origin INSIDE the browser
# (the embed API 403s any non-browser client), see paginate_filtered_products.
# ---------------------------------------------------------------------------

def rewrite_filtered_products_url(
    template_url: str, category: str, page: int, per_page: int
) -> str:
    """Return the template URL with variables.page / .perPage / .productsFilter.types
    rewritten for one (category, page). Preserves every other variable (dispensaryId,
    persisted-query hash in `extensions`, etc.) verbatim. Raises on a malformed
    template so the caller can skip pagination rather than fetch a bad URL."""
    parts = urlparse(template_url)
    query = parse_qs(parts.query, keep_blank_values=True)
    variables = json.loads(query["variables"][0])
    variables["page"] = page
    variables["perPage"] = per_page
    pf = variables.get("productsFilter")
    if isinstance(pf, dict):
        pf["types"] = [category]
        # Normalize the scoping keys to unconstrained ([]). Homepage carousels can
        # be pinned to explicit productIds (live-confirmed in the committed
        # kushmart-north fixture) — walking such a template would silently collapse
        # every page of every category to that ~25-product subset. Unconstrained
        # category listings carry these keys as [] (the live-proven shape).
        for key in ("productIds", "subcategories", "strainTypes"):
            if key in pf:
                pf[key] = []
    # Re-serialize only the variables param; leave operationName + extensions intact.
    new_query = {k: v[0] for k, v in query.items()}
    new_query["variables"] = json.dumps(variables, separators=(",", ":"))
    return urlunparse(parts._replace(query=urlencode(new_query)))


def read_total_pages(data: Any) -> Optional[int]:
    """Read data.filteredProducts.queryInfo.totalPages from a FilteredProducts
    response body, or None when the shape is missing/unexpected."""
    try:
        qi = data["data"]["filteredProducts"]["queryInfo"]
        tp = qi.get("totalPages")
        return tp if isinstance(tp, int) and tp >= 0 else None
    except (KeyError, TypeError):
        return None


def count_products(data: Any) -> int:
    """Number of products in a FilteredProducts response body (0 when missing)."""
    try:
        products = data["data"]["filteredProducts"]["products"]
        return len(products) if isinstance(products, list) else 0
    except (KeyError, TypeError):
        return 0


class NetworkInterceptor:
    """
    Captures JSON responses whose URLs match a regex pattern.

    Key behaviors:
    - Registers on the page BEFORE navigation so no responses are missed
    - Default wait strategy: "load" event + scroll to bottom (triggers lazy iframes)
    - wait_for_pattern: uses expect_response() to unblock immediately when
      a specific URL fires — most efficient for known API endpoints
    - on_all_urls(): captures every URL (no JSON filter) for discovery
    - paginate_filtered_products(): walks the Dutchie numbered menu in-page
    """

    def __init__(self, page: Page):
        self._page = page
        self._captured: list[dict] = []
        self._handlers: list = []

    def on_url(self, pattern: str) -> "NetworkInterceptor":
        """Capture JSON responses matching the regex pattern."""

        async def _handler(response: Response) -> None:
            if not re.search(pattern, response.url):
                return
            try:
                data = await response.json()
                self._captured.append({
                    "url": response.url,
                    "status": response.status,
                    "data": data,
                })
            except Exception:
                pass  # non-JSON or body consumed — skip

        self._page.on("response", _handler)
        self._handlers.append(_handler)
        return self

    def on_all_urls(self) -> "NetworkInterceptor":
        """Capture every URL that fires — for discovery/debugging."""

        async def _handler(response: Response) -> None:
            self._captured.append({
                "url": response.url,
                "status": response.status,
                "data": None,
            })

        self._page.on("response", _handler)
        self._handlers.append(_handler)
        return self

    def detach(self) -> None:
        """Remove all registered response listeners. Called before the pagination
        walk: its in-page fetches hit the same graphql URLs the passive listener
        matches, so leaving it attached would double-capture every walked page
        (once via the listener, once via the walk's own append) — and the async
        listener appends land nondeterministically late."""
        for handler in self._handlers:
            self._page.remove_listener("response", handler)
        self._handlers.clear()

    async def navigate_and_collect(
        self,
        url: str,
        wait_for_pattern: Optional[str] = None,
        extra_wait_ms: int = 8000,
        scroll: bool = True,
        timeout: int = 45000,
    ) -> list[dict]:
        """
        Navigate to url and return captured payloads.

        wait_for_pattern: blocks via expect_response() until that URL fires, then
            returns as soon as the awaited op is in (the deals scrape path — timing
            is deliberately minimal). Full-menu coverage for the product scrape is
            handled separately by paginate_filtered_products(), not by scrolling.
        scroll: scrolls to bottom after load to trigger lazy-loaded iframes (only on
            the no-wait path).
        extra_wait_ms: additional wait after load/scroll for in-flight requests.
        """
        self._captured.clear()

        if wait_for_pattern:
            async with self._page.expect_response(
                lambda r: bool(re.search(wait_for_pattern, r.url)),
                timeout=timeout,
            ):
                await self._page.goto(url, wait_until="domcontentloaded", timeout=timeout)
            await asyncio.sleep(1)
        else:
            # "load" fires when HTML + blocking resources are done.
            # Does NOT wait for infinite Next.js RSC prefetches (networkidle would hang).
            await self._page.goto(url, wait_until="load", timeout=timeout)

            if scroll:
                await self._scroll_to_bottom()

            # Hold for lazy iframe / async API calls triggered by scroll
            await asyncio.sleep(extra_wait_ms / 1000)

        return list(self._captured)

    async def paginate_filtered_products(
        self,
        template_url: str,
        types: list[str],
        per_page: int = 100,
        max_pages: int = 40,
        page_pause_ms: int = 200,
    ) -> None:
        """
        Walk the Dutchie FilteredProducts numbered pages for each category and append
        every response to self._captured (same {url,status,data} shape as intercepts,
        so the caller's existing union+dedupe assembles the full menu).

        Per category: fetch page 0 to learn queryInfo.totalPages, then fetch pages
        1..totalPages-1. When totalPages is unavailable, fall back to walking until a
        page returns zero products (empty-page terminator) or two CONSECUTIVE pages
        fail (a single transient failure is tolerated). Best-effort throughout —
        any page that fails (non-200 / missing body / thrown) is skipped and never
        aborts the category or the store; every degrade path is logged so a silent
        regression to page-0-only coverage is visible in the run logs. Runs as
        same-origin in-page fetches because the embed API 403s non-browser clients;
        the browser session is already cleared.
        """
        # The walk's own fetches match the passive listener's pattern — detach it so
        # every page isn't captured twice (see detach()). Page-0 nav captures are
        # already in self._captured; from here the walk owns all appends.
        self.detach()
        for category in types:
            page0 = await self._fetch_page(template_url, category, 0, per_page)
            if page0 is None:
                print(f"[paginate] {category}: page 0 unreadable — category skipped")
                continue  # fail-soft: category contributes nothing
            self._captured.append(page0)

            total_pages = read_total_pages(page0["data"])
            if total_pages is not None and total_pages > max_pages:
                print(f"[paginate] {category}: totalPages {total_pages} capped at max_pages {max_pages}")
            consecutive_failures = 0
            page = 1
            while True:
                if total_pages is not None:
                    if page >= min(total_pages, max_pages):
                        break
                elif page >= max_pages:
                    break  # safety cap when total is unknown

                result = await self._fetch_page(template_url, category, page, per_page)
                if result is None:
                    # Transient page failure: with a known total, keep going (a gap is
                    # better than truncating the category); walking blind, tolerate a
                    # single failure and probe the next page, stopping only after two
                    # consecutive failures.
                    consecutive_failures += 1
                    if total_pages is None and consecutive_failures >= 2:
                        print(f"[paginate] {category}: stopping blind walk at page {page} after {consecutive_failures} consecutive failed pages")
                        break
                    print(f"[paginate] {category}: page {page} failed — continuing")
                    page += 1
                    await asyncio.sleep(page_pause_ms / 1000)
                    continue

                consecutive_failures = 0
                self._captured.append(result)
                # Empty-page terminator only matters when we're walking blind.
                if total_pages is None and count_products(result["data"]) == 0:
                    break
                page += 1
                await asyncio.sleep(page_pause_ms / 1000)

    async def _fetch_page(
        self, template_url: str, category: str, page: int, per_page: int
    ) -> Optional[dict]:
        """Same-origin in-page GET for one (category, page). Returns a captured-shaped
        dict on HTTP 200 with a JSON body, else None. Never raises."""
        try:
            url = rewrite_filtered_products_url(template_url, category, page, per_page)
        except Exception:
            return None
        try:
            result = await self._page.evaluate(
                """async (u) => {
                    const res = await fetch(u, {
                        headers: { 'accept': '*/*', 'apollo-require-preflight': 'true' },
                        credentials: 'include',
                    });
                    let data = null;
                    try { data = await res.json(); } catch (e) {}
                    return { status: res.status, data };
                }""",
                url,
            )
        except Exception:
            return None
        if not result or result.get("status") != 200 or result.get("data") is None:
            return None
        return {"url": url, "status": 200, "data": result["data"]}

    async def _scroll_to_bottom(self) -> None:
        """Scroll in steps to trigger intersection-observer lazy loads."""
        height = await self._page.evaluate("document.body.scrollHeight")
        step = 600
        pos = 0
        while pos < height:
            pos = min(pos + step, height)
            await self._page.evaluate(f"window.scrollTo(0, {pos})")
            await asyncio.sleep(0.15)
        # Scroll back to top so any top-anchored content also fires
        await self._page.evaluate("window.scrollTo(0, 0)")
        await asyncio.sleep(0.5)
