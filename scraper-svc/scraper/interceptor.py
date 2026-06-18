import asyncio
import re
from typing import Optional

from playwright.async_api import Page, Response


class NetworkInterceptor:
    """
    Captures JSON responses whose URLs match a regex pattern.

    Key behaviors:
    - Registers on the page BEFORE navigation so no responses are missed
    - Default wait strategy: "load" event + scroll to bottom (triggers lazy iframes)
    - wait_for_pattern: uses expect_response() to unblock immediately when
      a specific URL fires — most efficient for known API endpoints
    - on_all_urls(): captures every URL (no JSON filter) for discovery
    """

    def __init__(self, page: Page):
        self._page = page
        self._captured: list[dict] = []

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
        return self

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

        wait_for_pattern: blocks via expect_response() until that URL fires.
        scroll: scrolls to bottom after load to trigger lazy-loaded iframes.
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
