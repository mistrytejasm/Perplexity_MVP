import httpx
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from config.settings import settings
import asyncio
import logging

logger = logging.getLogger(__name__)


class TavilyService:
    """
    Tavily web search client.
    Supports two modes:
      - Standard: basic depth, 3 results/query, domain-ranked
      - Real-time: advanced depth + news topic + 1-day freshness, 5 results/query
    """

    BASE_URL = "https://api.tavily.com"
    TIMEOUT = 30

    # Domains to always exclude
    EXCLUDED_DOMAINS = ["youtube.com", "tiktok.com", "instagram.com", "reddit.com"]

    def __init__(self):
        self.api_key = settings.TAVILY_API_KEY

    # ─── Public API ──────────────────────────────────────────────────────────

    async def search_multiple(
        self,
        search_terms: List[str],
        is_real_time: bool = False,
        max_results_per_search: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Execute multiple searches in parallel and return deduplicated, ranked results.

        Args:
            search_terms: List of queries to search in parallel
            is_real_time: If True, uses advanced depth + news topic + freshness filter
            max_results_per_search: Override per-query result count
        """
        if max_results_per_search is None:
            max_results_per_search = 5 if is_real_time else 3

        logger.info(
            f"🔍 Executing {len(search_terms)} parallel searches "
            f"[real_time={is_real_time}, results_per_query={max_results_per_search}]"
        )

        tasks = [
            self._single_search(term, max_results_per_search, is_real_time)
            for term in search_terms
        ]

        search_results = await asyncio.gather(*tasks, return_exceptions=True)

        all_results: List[Dict[str, Any]] = []
        for i, result in enumerate(search_results):
            if isinstance(result, Exception):
                logger.error(f"❌ Search failed for '{search_terms[i]}': {result}")
                continue
            if result and result.get("results"):
                all_results.extend(result["results"])

        deduplicated = self._deduplicate(all_results)
        ranked = self._rank(deduplicated, is_real_time=is_real_time)

        logger.info(f"✅ Found {len(ranked)} unique sources after dedup + ranking")
        return ranked

    # ─── Private Methods ─────────────────────────────────────────────────────

    async def _single_search(
        self,
        query: str,
        max_results: int,
        is_real_time: bool
    ) -> Dict[str, Any]:
        """Execute a single Tavily search with appropriate config."""

        payload: Dict[str, Any] = {
            "api_key": self.api_key,
            "query": query,
            "include_answers": False,       # We generate our own answer
            "include_raw_content": True,    # Full content for richer LLM context
            "max_results": max_results,
            "exclude_domains": self.EXCLUDED_DOMAINS,
        }

        if is_real_time:
            # Advanced mode: fresh news sources, last 24 hours preferred
            payload["search_depth"] = "advanced"
            payload["topic"] = "news"
            payload["days"] = 3             # Last 3 days for real-time relevance
        else:
            payload["search_depth"] = "basic"

        async with httpx.AsyncClient(timeout=self.TIMEOUT) as client:
            try:
                response = await client.post(f"{self.BASE_URL}/search", json=payload)
                response.raise_for_status()
                result = response.json()
                count = len(result.get("results", []))
                logger.info(f"  ↳ '{query}' → {count} results")
                return result

            except httpx.HTTPStatusError as e:
                logger.error(f"❌ Tavily HTTP {e.response.status_code} for '{query}': {e}")
                return {"results": []}
            except httpx.TimeoutException:
                logger.error(f"⏱️ Tavily timeout for '{query}'")
                return {"results": []}
            except Exception as e:
                logger.error(f"❌ Unexpected Tavily error for '{query}': {e}")
                return {"results": []}

    def _deduplicate(self, results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Remove duplicate results by URL."""
        seen: set = set()
        unique: List[Dict[str, Any]] = []
        for r in results:
            url = r.get("url", "")
            if url and url not in seen:
                seen.add(url)
                unique.append(r)
        return unique

    def _rank(
        self,
        results: List[Dict[str, Any]],
        is_real_time: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Rank results by a composite score:
          - Tavily relevance score (base)
          - Content length bonus
          - Domain authority bonus
          - Freshness bonus (extra weight for real-time queries)
        """
        now = datetime.now(timezone.utc)

        def score(r: Dict[str, Any]) -> float:
            s = float(r.get("score", 0.0))

            # ── Content length bonus ──────────────────────────────
            length = len(r.get("content", ""))
            if length > 1000:
                s += 1.0
            elif length > 400:
                s += 0.5

            # ── Domain authority bonus ────────────────────────────
            url = r.get("url", "").lower()
            if any(d in url for d in _REPUTABLE_DOMAINS):
                s += 0.3

            # ── Freshness bonus ───────────────────────────────────
            pub_date_str = r.get("published_date") or r.get("publishedDate")
            if pub_date_str:
                try:
                    # Handle multiple date formats from Tavily
                    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d", "%Y-%m-%dT%H:%M:%S"):
                        try:
                            pub_dt = datetime.strptime(pub_date_str[:19], fmt)
                            pub_dt = pub_dt.replace(tzinfo=timezone.utc)
                            break
                        except ValueError:
                            continue
                    else:
                        pub_dt = None

                    if pub_dt:
                        age_hours = (now - pub_dt).total_seconds() / 3600
                        if age_hours <= 24:
                            s += 2.5 if is_real_time else 0.5   # big boost for real-time
                        elif age_hours <= 168:  # 7 days
                            s += 1.0 if is_real_time else 0.2
                        elif age_hours <= 720:  # 30 days
                            s += 0.3
                except Exception:
                    pass  # Skip freshness scoring if date parse fails

            return s

        ranked = sorted(results, key=score, reverse=True)

        # Annotate with final score for debugging
        for r in ranked:
            r["calculated_score"] = round(score(r), 3)

        return ranked


# ─── Domain Authority List ────────────────────────────────────────────────────

_REPUTABLE_DOMAINS = [
    # General knowledge
    "wikipedia.org", "britannica.com",
    # Academia
    "stanford.edu", "mit.edu", "ox.ac.uk", "harvard.edu",
    # Science
    "nature.com", "sciencedirect.com", "arxiv.org", "ncbi.nlm.nih.gov",
    # Tech News
    "techcrunch.com", "theverge.com", "wired.com", "arstechnica.com",
    # News
    "bbc.com", "bbc.co.uk", "reuters.com", "apnews.com",
    "nytimes.com", "theguardian.com", "washingtonpost.com",
    "ndtv.com", "thehindu.com", "hindustantimes.com",
    # Health
    "nih.gov", "who.int", "cdc.gov", "mayoclinic.org",
    # Sports
    "espn.com", "espncricinfo.com", "cricbuzz.com",
    "skysports.com", "icc-cricket.com", "bcci.tv",
    "cbssports.com", "bleacherreport.com", "goal.com",
    # Finance
    "bloomberg.com", "ft.com", "wsj.com", "forbes.com",
]
