import json
from groq import AsyncGroq
from langchain_community.callbacks.flyte_callback import analyze_text

from config.settings import settings
from models.schemas import QueryAnalysis, QueryType
import logging

logger = logging.getLogger(__name__)

class GroqService:
    def __init__(self):
        self.client = AsyncGroq(api_key=settings.GROQ_API_KEY)
        self.model = "openai/gpt-oss-120b"

    async def analyze_query(self, query: str) -> QueryAnalysis:
        """Analyze user query to understand intent and generate search strategy"""

        prompt = f"""
                You are an expert query analyzer for a search engine. Analyze the following user query and provide a structured response.

                Query: "{query}"

                Provide analysis in this EXACT JSON format:
                {{
                    "query_type": "factual|comparison|how_to|current_events|opinion|calculation",
                    "search_intent": "Clear description of what user wants to know",
                    "key_entities": ["entity1", "entity2", "entity3"],
                    "suggested_searches": ["search_term_1", "search_term_2", "search_term_3"],
                    "complexity_score": 1-10,
                    "requires_real_time": true/false
                }}

                Rules:
                - complexity_score: 1-3 (simple facts), 4-6 (moderate research), 7-10 (complex multi-step)
                - requires_real_time: true if query needs current/recent information
                - suggested_searches: 3 optimized search terms for web search
                - key_entities: important nouns, concepts, or topics from the query
                """
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {'role': "system", 'content': "You are a query analysis expert. Always respond with valid JSON only."},
                    {'role': 'user', 'content': prompt}
                ],
                temperature=0.1, # Low temperature for consistent analysis
                max_tokens=500
            )

            analysis_text = response.choices[0].message.content.strip()

            # Parse JSON response
            analysis_data = json.loads(analysis_text)

            # Validate and create QueryAnalysis object
            return QueryAnalysis(**analysis_data)

        except json.JSONDecodeError as e:
            logger.error(f"Error parsing query: {e}")
            return self._create_fall_back_analysis(query)

        except Exception as e:
            logger.error(f"Grok API error: {e}")
            return self._create_fall_back_analysis(query)

    def _create_fall_back_analysis(self, query: str) -> QueryAnalysis:
        """Create basic analysis when Groq fails"""
        return QueryAnalysis(
            query_type=QueryType.FACTUAL,
            search_intent=f"User wants information about: {query}",
            key_entities=[query[:50]],  # Truncate long queries
            suggested_searches=[query, f"{query} explanation", f"{query} definition"],
            complexity_score=5,
            requires_real_time=False
        )
