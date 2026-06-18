from typing import Optional

import cloudscraper
from curl_cffi.requests import AsyncSession


# Valid impersonation targets for curl_cffi
IMPERSONATE = "chrome131"


async def tls_fetch(
    url: str,
    headers: Optional[dict] = None,
    timeout: int = 30,
    impersonate: str = IMPERSONATE,
) -> dict:
    """
    Tier 3: TLS fingerprint spoofing via curl_cffi.
    Lightweight — no browser, no JS execution.
    Use when the target only checks TLS/JA3 fingerprints, not JS behavior.
    """
    async with AsyncSession(impersonate=impersonate) as session:
        resp = await session.get(url, headers=headers or {}, timeout=timeout)
        resp.raise_for_status()
        try:
            return {"type": "json", "data": resp.json(), "status": resp.status_code}
        except Exception:
            return {"type": "html", "data": resp.text, "status": resp.status_code}


def cloudflare_fetch(url: str, headers: Optional[dict] = None) -> dict:
    """
    Tier 3 fallback: Cloudflare JS challenge solver via cloudscraper.
    Synchronous. Handles CF's JS challenge without a full browser.
    Does NOT execute page JS or render iFrames.
    """
    scraper = cloudscraper.create_scraper(
        browser={"browser": "chrome", "platform": "windows", "mobile": False}
    )
    resp = scraper.get(url, headers=headers or {})
    resp.raise_for_status()
    try:
        return {"type": "json", "data": resp.json(), "status": resp.status_code}
    except Exception:
        return {"type": "html", "data": resp.text, "status": resp.status_code}
