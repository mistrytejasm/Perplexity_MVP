import json
from datetime import datetime
from groq import AsyncGroq

from config.settings import settings
from models.schemas import QueryAnalysis, QueryType
import logging

logger = logging.getLogger(__name__)


class GroqService:
    """Groq LLM client — handles query analysis and answer generation."""

    # Fast, instruction-following model — outputs clean JSON and [N] citations reliably
    ANALYSIS_MODEL = "llama-3.3-70b-versatile"

    def __init__(self):
        self.client = AsyncGroq(api_key=settings.GROQ_API_KEY)

    async def analyze_query(self, query: str) -> QueryAnalysis:
        """
        Analyze user query to understand intent and generate date-aware search terms.
        Injects current date so real-time queries include the correct year/month.
        """
        today = datetime.now().strftime("%A, %B %d, %Y")
        current_year = datetime.now().year
        current_month = datetime.now().strftime("%B %Y")

        prompt = f"""Today is {today}.

You are an expert query analyzer for a real-time search engine. Analyze the user query below and return a JSON object.

Query: "{query}"

Return ONLY valid JSON in this EXACT format (no markdown, no explanation):
{{
    "query_type": "factual|comparison|how_to|current_events|opinion|calculation",
    "search_intent": "Clear 1-sentence description of what the user wants",
    "key_entities": ["entity1", "entity2"],
    "suggested_searches": ["search_term_1", "search_term_2", "search_term_3"],
    "requires_real_time": true or false,
    "complexity_score": 5
}}

Rules for suggested_searches:
- Generate exactly 3 highly specific search terms optimized for web search
- For real-time queries (scores, next match, current price, latest news):
  * ALWAYS include the current date or month/year: "{current_month}"
  * Example for "next IPL match": ["IPL 2026 next match schedule {current_month}", "IPL {current_year} upcoming fixture", "IPL live schedule today"]
- For factual/historical queries: use precise terminology
- For how-to queries: include "guide", "tutorial", "step by step"

Rules for requires_real_time:
- true: sports scores, live events, stock prices, today's weather, latest news, current standings, "next match", "upcoming"
- false: historical facts, definitions, how-to guides, biographies

Rules for complexity_score (integer 1–10):
- 1–3: simple fact, single answer
- 4–6: moderate research needed  
- 7–10: multi-part, comparative, or research-heavy"""

        try:
            response = await self.client.chat.completions.create(
                model=self.ANALYSIS_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a query analysis expert for a search engine. "
                            "Always respond with valid JSON only. No markdown fences, no extra text."
                        )
                    },
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=600
            )

            raw = response.choices[0].message.content.strip()

            # Strip any accidental markdown fences
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            raw = raw.strip().rstrip("```").strip()

            analysis_data = json.loads(raw)

            # Ensure complexity_score is an int in [1, 10]
            score = int(analysis_data.get("complexity_score", 5))
            analysis_data["complexity_score"] = max(1, min(10, score))

            logger.info(
                f"✅ Query analyzed: type={analysis_data.get('query_type')}, "
                f"real_time={analysis_data.get('requires_real_time')}, "
                f"searches={analysis_data.get('suggested_searches')}"
            )

            return QueryAnalysis(**analysis_data)

        except json.JSONDecodeError as e:
            logger.error(f"❌ JSON parse error in analyze_query: {e} | Raw: {raw[:200]}")
            return self._create_fallback_analysis(query)

        except Exception as e:
            logger.error(f"❌ Groq API error in analyze_query: {e}")
            return self._create_fallback_analysis(query)

    def _create_fallback_analysis(self, query: str) -> QueryAnalysis:
        """Fallback when Groq fails — uses heuristics instead of LLM."""
        query_lower = query.lower()
        today_str = datetime.now().strftime("%B %Y")

        # Detect real-time intent from keywords
        real_time_keywords = [
            "today", "now", "live", "current", "latest", "score", "next match",
            "upcoming", "schedule", "standings", "result", "winner", "tonight"
        ]
        is_real_time = any(kw in query_lower for kw in real_time_keywords)

        if is_real_time:
            suggested = [
                f"{query} {today_str}",
                f"{query} latest update",
                f"{query} today live"
            ]
        else:
            suggested = [
                query,
                f"{query} explained",
                f"{query} guide"
            ]

        return QueryAnalysis(
            query_type="current_events" if is_real_time else "factual",
            search_intent=f"User wants information about: {query}",
            key_entities=[query[:50]],
            suggested_searches=suggested,
            complexity_score=5,
            requires_real_time=is_real_time
        )
