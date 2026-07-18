"""Unit tests for the Dutchie numbered-pagination walk (ADR-089).

Covers the pure URL/response helpers and the in-page walk's control flow
(page-count derivation from queryInfo.totalPages, empty-page terminator when the
total is unavailable, and mid-page fail-soft) using a fake Playwright page so no
browser/network is touched.
"""
import json
from urllib.parse import parse_qs, urlencode, urlparse

import pytest

from scraper.interceptor import (
    NetworkInterceptor,
    count_products,
    read_total_pages,
    rewrite_filtered_products_url,
)


def _template_url(dispensary_id="disp-1", category="Flower", page=0, per_page=25):
    variables = {
        "someOtherKey": True,  # a non-page variable that must survive untouched
        "productsFilter": {
            "dispensaryId": dispensary_id,
            "pricingType": "rec",
            "types": [category],
        },
        "page": page,
        "perPage": per_page,
    }
    extensions = {"persistedQuery": {"version": 1, "sha256Hash": "abc123"}}
    query = urlencode({
        "operationName": "FilteredProducts",
        "variables": json.dumps(variables),
        "extensions": json.dumps(extensions),
    })
    return f"https://dutchie.com/api-0/graphql?{query}"


def _body(products, total_pages=None):
    query_info = {}
    if total_pages is not None:
        query_info["totalPages"] = total_pages
    return {"data": {"filteredProducts": {"products": products, "queryInfo": query_info}}}


# --- pure helpers -----------------------------------------------------------

def test_rewrite_sets_page_perpage_and_types_preserving_everything_else():
    out = rewrite_filtered_products_url(_template_url(), "Concentrate", 3, 100)
    variables = json.loads(parse_qs(urlparse(out).query)["variables"][0])
    assert variables["page"] == 3
    assert variables["perPage"] == 100
    assert variables["productsFilter"]["types"] == ["Concentrate"]
    # untouched fields survive verbatim
    assert variables["someOtherKey"] is True
    assert variables["productsFilter"]["dispensaryId"] == "disp-1"
    # operationName + persisted-query extensions are carried through unchanged
    q = parse_qs(urlparse(out).query)
    assert q["operationName"][0] == "FilteredProducts"
    assert json.loads(q["extensions"][0])["persistedQuery"]["sha256Hash"] == "abc123"


def test_rewrite_raises_on_malformed_template():
    with pytest.raises(Exception):
        rewrite_filtered_products_url("https://dutchie.com/api-0/graphql?variables=notjson", "Flower", 1, 100)


def test_read_total_pages():
    assert read_total_pages(_body([], total_pages=4)) == 4
    assert read_total_pages(_body([], total_pages=None)) is None  # queryInfo has no totalPages
    assert read_total_pages({"data": {}}) is None
    assert read_total_pages(None) is None
    assert read_total_pages({"data": {"filteredProducts": {"queryInfo": {"totalPages": "x"}}}}) is None


def test_count_products():
    assert count_products(_body([{"_id": "a"}, {"_id": "b"}])) == 2
    assert count_products(_body([])) == 0
    assert count_products({"data": {}}) == 0
    assert count_products(None) == 0


# --- walk control flow with a fake page -------------------------------------

class FakePage:
    """Returns scripted {status, data} dicts from evaluate() in order, recording the
    fetched (category, page) lifted back out of each rewritten URL."""

    def __init__(self, responses):
        self._responses = list(responses)
        self.fetched = []  # (category, page) tuples in call order

    async def evaluate(self, expression, arg=None):
        # arg is the rewritten URL string built by _fetch_page.
        variables = json.loads(parse_qs(urlparse(arg).query)["variables"][0])
        self.fetched.append((variables["productsFilter"]["types"][0], variables["page"]))
        if not self._responses:
            return {"status": 200, "data": _body([])}
        return self._responses.pop(0)


async def _walk(responses, types=("Flower",), max_pages=40):
    page = FakePage(responses)
    interceptor = NetworkInterceptor(page)  # type: ignore[arg-type]
    await interceptor.paginate_filtered_products(
        _template_url(), list(types), per_page=100, max_pages=max_pages, page_pause_ms=0
    )
    return interceptor, page


async def test_walk_uses_total_pages_to_fetch_exactly_that_many():
    # totalPages=3 → fetch pages 0,1,2 and stop (no page 3).
    interceptor, page = await _walk([
        {"status": 200, "data": _body([{"_id": "p0"}] * 100, total_pages=3)},
        {"status": 200, "data": _body([{"_id": "p1"}] * 100, total_pages=3)},
        {"status": 200, "data": _body([{"_id": "p2"}] * 27, total_pages=3)},
    ])
    assert page.fetched == [("Flower", 0), ("Flower", 1), ("Flower", 2)]
    assert len(interceptor._captured) == 3


async def test_walk_empty_page_terminator_when_total_unavailable():
    # No totalPages anywhere → walk until a page returns zero products.
    interceptor, page = await _walk([
        {"status": 200, "data": _body([{"_id": "p0"}] * 100)},
        {"status": 200, "data": _body([{"_id": "p1"}] * 100)},
        {"status": 200, "data": _body([])},  # empty → stop
    ])
    assert page.fetched == [("Flower", 0), ("Flower", 1), ("Flower", 2)]
    assert len(interceptor._captured) == 3  # the empty page is captured then loop stops


async def test_walk_midpage_failure_with_known_total_skips_and_continues():
    # totalPages=4; page 1 fails (non-200) → skipped, but the walk continues to 2,3.
    interceptor, page = await _walk([
        {"status": 200, "data": _body([{"_id": "p0"}] * 100, total_pages=4)},
        {"status": 500, "data": None},  # transient page failure
        {"status": 200, "data": _body([{"_id": "p2"}] * 100, total_pages=4)},
        {"status": 200, "data": _body([{"_id": "p3"}] * 60, total_pages=4)},
    ])
    assert page.fetched == [("Flower", 0), ("Flower", 1), ("Flower", 2), ("Flower", 3)]
    # page 1 contributed no capture; 0/2/3 did
    assert len(interceptor._captured) == 3


async def test_walk_skips_category_when_page0_unreadable():
    interceptor, page = await _walk([{"status": 403, "data": None}])
    assert page.fetched == [("Flower", 0)]
    assert interceptor._captured == []


async def test_walk_covers_every_category():
    # Each category returns a single page (totalPages=1).
    responses = [{"status": 200, "data": _body([{"_id": "x"}], total_pages=1)} for _ in range(3)]
    interceptor, page = await _walk(responses, types=("Flower", "Edible", "Concentrate"))
    assert [c for c, _ in page.fetched] == ["Flower", "Edible", "Concentrate"]
    assert len(interceptor._captured) == 3
