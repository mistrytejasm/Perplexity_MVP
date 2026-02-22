import re
from typing import List
from models.schemas import QueryAnalysis, SearchRequest
from services.groq_service import GroqService
import logging

logger = logging.getLogger(__name__)

class QueryAnalyzer:
    def __init__(self):
        self.groq_service = GroqService()

    async def process_query(
        self,
        request: SearchRequest,
        has_documents: bool = False,
        history: list = None
    ) -> QueryAnalysis:
        """
        Main method to process and analyze user query.

        Args:
            request: The incoming SearchRequest with the user message.
            has_documents: True when the session already has uploaded documents.
            history: Conversation history ({role, content} dicts) for follow-up
                     reference resolution (e.g. 'code for this').
        """

        # 1. Clean and validate query
        cleaned_query = self._clean_query(request.query)

        # 2. Pre-analysis check — skip LLM only for simple queries with no docs
        #    AND no conversation history (history might contain reference context).
        has_history = bool(history)
        if not has_documents and not has_history and self._is_simple_query(cleaned_query):
            return await self._handle_simple_query(request.query)

        # 3. Full LLM analysis with optional document-awareness and history
        return await self.groq_service.analyze_query(
            cleaned_query,
            has_documents=has_documents,
            history=history
        )

    def _clean_query(self, query: str) -> str:
        """clean and normalize query"""
        # Remove extra white space
        cleaned = re.sub(r'\s+', ' ', query.strip())

        # Remove special characters that might interfere
        cleaned = re.sub(r'[^\w\s\-\?\.\!]', '', cleaned)

        return cleaned

    def _is_simple_query(self, query: str) -> bool:
        """Determine if query is simple enough to skip LLM analysis"""
        simple_patterns = [
            r'^what is \w+\?*$',  # "what is X"
            r'^define \w+$',  # "define X"
            r'^\w+( \w+){0,2} definition$'  # "X definition"
        ]

        query_lower = query.lower()
        return any(re.match(pattern, query_lower) for pattern in simple_patterns)

    async def _handle_simple_query(self, query: str) -> QueryAnalysis:
        """Handle simple queries without full LLM analysis"""
        # Extract main term
        main_term = re.sub(r'^(what is |define )', '', query.lower())
        main_term = re.sub(r'( definition|\?)$', '', main_term).strip()

        return QueryAnalysis(
            query_type="factual",
            search_intent=f"User wants to understand what {main_term} means",
            key_entities=[main_term],
            suggested_searches=[
                f"{main_term} definition",
                f"what is {main_term}",
                f"{main_term} explanation"
            ],
            complexity_score=2,
            requires_real_time=False,
            query_intent=None  # no documents in this path
        )
