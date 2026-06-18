from contextlib import asynccontextmanager
from typing import Optional

from playwright.async_api import async_playwright, Browser, BrowserContext, Page
from playwright_stealth import Stealth

_stealth = Stealth()


_STEALTH_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)

_STEALTH_HEADERS = {
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;"
        "q=0.9,image/avif,image/webp,*/*;q=0.8"
    ),
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
}


class BrowserManager:
    """
    Async context manager that owns the Playwright process lifecycle.
    Launch once, create many pages via new_page().

    Usage:
        async with BrowserManager() as mgr:
            async with mgr.new_page() as page:
                ...
    """

    def __init__(
        self,
        headless: bool = True,
        proxy: Optional[str] = None,
        timeout: int = 30000,
    ):
        self.headless = headless
        self.proxy = proxy
        self.timeout = timeout
        self._playwright = None
        self._browser: Optional[Browser] = None

    async def start(self) -> "BrowserManager":
        self._playwright = await async_playwright().start()
        launch_kwargs: dict = {
            "headless": self.headless,
            "args": [
                "--no-sandbox",                            # required inside Docker
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
                "--disable-extensions",
            ],
        }
        if self.proxy:
            launch_kwargs["proxy"] = {"server": self.proxy}

        self._browser = await self._playwright.chromium.launch(**launch_kwargs)
        return self

    async def stop(self) -> None:
        if self._browser:
            await self._browser.close()
        if self._playwright:
            await self._playwright.stop()

    async def __aenter__(self) -> "BrowserManager":
        return await self.start()

    async def __aexit__(self, *_) -> None:
        await self.stop()

    @asynccontextmanager
    async def new_page(self):
        """Yield a stealth-patched Page inside a fresh BrowserContext."""
        context: BrowserContext = await self._browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent=_STEALTH_UA,
            locale="en-US",
            timezone_id="America/New_York",
            extra_http_headers=_STEALTH_HEADERS,
        )
        page: Page = await context.new_page()
        await _stealth.apply_stealth_async(page)
        page.set_default_timeout(self.timeout)
        try:
            yield page
        finally:
            await context.close()
