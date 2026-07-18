from pydantic import BaseModel, Field
from typing import Any, Literal, Optional
from datetime import datetime, timezone


class PaginateFilteredProducts(BaseModel):
    """Opt-in: after page-0 capture, walk Dutchie FilteredProducts NUMBERED pages
    per category via same-origin in-page fetch (the embed API 403s non-browser
    clients; the embed menu is numbered pages, not infinite scroll). Replaces the
    former scroll_after_wait no-op. See interceptor.paginate_filtered_products."""
    types: list[str] = []          # categories to enumerate (Dutchie `type` values)
    per_page: int = 100            # page size; the embed accepts up to 100
    max_pages: int = 40            # per-category safety cap


class ScrapeRequest(BaseModel):
    url: str
    intercept_pattern: Optional[str] = None   # regex matched against response URLs
    wait_for_pattern: Optional[str] = None    # block until this URL pattern fires
    tier: Literal["browser", "tls", "cloudflare"] = "browser"
    headless: bool = True
    timeout: int = 30000                      # milliseconds
    # Opt-in numbered-pagination walk for the Dutchie PRODUCT scrape. Absent for the
    # deals scrape → its navigate-wait-return timing is unchanged.
    paginate: Optional[PaginateFilteredProducts] = None


class InterceptedPayload(BaseModel):
    url: str
    status: int
    data: Any


class ScrapeResponse(BaseModel):
    request_url: str
    tier_used: str
    success: bool
    duration_ms: float
    intercepted: list[InterceptedPayload] = []
    raw_html: Optional[str] = None
    error: Optional[str] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# Dutchie-specific parsed models
class DutchieProduct(BaseModel):
    id: str
    name: str
    brand: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    thc: Optional[str] = None
    cbd: Optional[str] = None
    price: Optional[float] = None
    weight: Optional[str] = None
    in_stock: bool = True
    image_url: Optional[str] = None


class DutchieMenu(BaseModel):
    dispensary_url: str
    dispensary_name: Optional[str] = None
    products: list[DutchieProduct] = []
    scraped_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
