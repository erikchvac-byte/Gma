from pydantic import BaseModel, Field
from typing import Any, Literal, Optional
from datetime import datetime, timezone


class ScrapeRequest(BaseModel):
    url: str
    intercept_pattern: Optional[str] = None   # regex matched against response URLs
    wait_for_pattern: Optional[str] = None    # block until this URL pattern fires
    tier: Literal["browser", "tls", "cloudflare"] = "browser"
    headless: bool = True
    timeout: int = 30000                      # milliseconds
    # After wait_for_pattern fires, scroll to trigger lazy/paginated follow-up
    # requests and hold for them (ADR-053, products scrape). Default False keeps the
    # deals scrape's wait-and-return timing unchanged.
    scroll_after_wait: bool = False


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
