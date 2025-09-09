import time
from typing import Dict, Any

from models.schemas import SearchRequest, SearchResponse, SearchResult, WebSearchResults
from services.query_analyzer import QueryAnalyzer
from services.tavily_service import TavilyService
from services.content_synthesizer import ContentSynthesizer
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class SearchOrchestrator:
    """Main orchestrator that coordinates query analysis and web search"""

    def __init__(self):
        self.query_analyzer = QueryAnalyzer()
        self.tavily_service = TavilyService()
        self.content_synthesizer = ContentSynthesizer()

    async def execute_search(self, request: SearchRequest) -> SearchResponse:
        """Execute complete search pipeline: Analysis + Web Search + Synthesis"""

        start_time = time.time()
        analysis = None
        web_results = None

        try:
            # Step 1: Analyze Query
            logger.info(f"Step 1: Analyzing Query: '{request.query}'")
            analysis = await self.query_analyzer.process_query(request)

            # Step 2: Execute Web Searches
            logger.info(f"Step 2: Executing Web Searches")
            web_results = await self._execute_web_search(analysis, request.query)

            # Step 3: Synthesize Response
            logger.info(f"Step: Synthesizeing Response")
            synthesized_response = await self.content_synthesizer.synthesize_response(
                query=request.query,
                analysis=analysis,
                web_results=web_results
            )

            total_duration = time.time() - start_time
            logger.info(f"⚡ Total search completed in {total_duration:.2f}s")

            # Create comprehensive response
            response = SearchResponse(
                original_query=request.query,
                analysis=analysis,
                web_results=web_results,
                synthesized_response=synthesized_response,
                status="search_completed",
                timestamp=datetime.now().isoformat()
            )

            return response

        except Exception as e:
            logger.error(f"❌ Search Pipeline failed: {e}")
            
            # Return partial response
            return SearchResponse(
                original_query=request.query,
                analysis=analysis,
                web_results=web_results,
                synthesized_response=None,
                status="partial_failure",
                timestamp=datetime.now().isoformat()
            )

    async def _execute_web_search(self, analysis, original_query: str) -> WebSearchResults:
        """Execute web search using analyzed query data"""

        search_start = time.time()

        # Determine search term to use
        search_terms = analysis.suggested_searches

        # Add original query if not already in suggestions
        if original_query not in search_terms:
            search_terms = [original_query] + search_terms
        logger.info(f"Search Terms: {search_terms}")

        # Limit number of searches based on complexity
        max_searches = min(len(search_terms), self._get_max_searches(analysis.complexity_score))
        logger.info(f"Max Searches: {max_searches}")

        logger.info(f"Using {len(search_terms)} search terms: {search_terms}")

        # Execute searches via Tavily
        raw_results = await self.tavily_service.search_multiple(
            search_terms=search_terms,
            max_results_per_search=2   # 2 results per search term
        )

        # Convert to our schema
        search_results = []
        for result in raw_results:
            try:
                search_result = SearchResult(
                    title=result.get('title', 'No title'),
                    url=result.get('url', ''),
                    content=result.get('content', ''),
                    score=result.get('score', 0.0),
                    calculated_score=result.get('calculated_score'),
                    published_date=result.get('published_date')
                )
                search_results.append(search_result)
            except Exception as e:
                logger.warning(f"⚠️ Failed to parse search result: {e}")
                continue

        search_duration = time.time() - search_start

        return WebSearchResults(
            total_results=len(search_results),
            search_terms_used=search_terms,
            results=search_results,
            search_duration=search_duration
        )

    def _get_max_searches(self, complexity_score: int) -> int:
        """Determine maximum number of searches based on query complexity"""
        if complexity_score <= 3:
            return 2  # Simple queries: 2 searches
        elif complexity_score <= 6:
            return 3  # Moderate queries: 3 searches
        else:
            return 4  # Complex queries: 4 searches



