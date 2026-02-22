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

    async def analyze_query(self, query: str, has_documents: bool = False) -> QueryAnalysis:
        """
        Analyze user query to understand intent and generate date-aware search terms.
        Injects current date so real-time queries include the correct year/month.

        If has_documents=True, the LLM is also asked to produce a `query_intent`
        field that classifies the user's intent relative to the uploaded document:
          - doc_summary : wants a general overview / summary of the uploaded doc
          - doc_qa      : asks a specific question (answer expected from the doc first)
          - general_web : clearly unrelated to any uploaded document
        """
        today = datetime.now().strftime("%A, %B %d, %Y")
        current_year = datetime.now().year
        current_month = datetime.now().strftime("%B %Y")

        # ── Build the dynamic parts of the prompt based on document presence ──
        if has_documents:
            intent_schema = '"query_intent": "doc_summary|doc_qa|general_web",'
            intent_rules = """
Rules for query_intent (ONLY applicable when a document is uploaded):
- "doc_summary": Use this if the user is asking for a general overview of the document.
  Trigger phrases: "what is this about", "what is this doc/pdf about", "summarize this",
  "what does this contain", "explain this document", "overview of this pdf",
  "what type of information", "tell me about this file", "what is in this pdf".
- "doc_qa": Use this if the user asks a specific question that should logically be
  answered from an uploaded document first (e.g. "what is the revenue?", "what
  technologies are mentioned?", "what is the candidate's experience?"). This is the
  DEFAULT when documents are present and the query is not clearly doc_summary or general_web.
- "general_web": Use this ONLY if the query is blatantly unrelated to the user's
  uploaded document — such as current events, sports scores, or general trivia that
  could not possibly be in a private PDF (e.g. "who won the World Cup 2026",
  "what is the capital of France")."""
        else:
            intent_schema = ""
            intent_rules = ""

        # Must pre-compute outside the f-string (backslashes not allowed inside f-string expressions)
        intent_schema_line = (",\n    " + intent_schema) if has_documents else ""

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
    "complexity_score": 5{intent_schema_line}
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
- 7–10: multi-part, comparative, or research-heavy{intent_rules}"""

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

            # Validate / normalise query_intent
            valid_intents = {"doc_summary", "doc_qa", "general_web"}
            raw_intent = analysis_data.get("query_intent")
            if has_documents:
                if raw_intent not in valid_intents:
                    # Default to doc_qa when documents are present and intent is unclear
                    analysis_data["query_intent"] = "doc_qa"
                    logger.warning(f"⚠️ LLM returned invalid query_intent '{raw_intent}', defaulting to 'doc_qa'")
            else:
                # No documents — intent field is irrelevant
                analysis_data["query_intent"] = None

            logger.info(
                f"✅ Query analyzed: type={analysis_data.get('query_type')}, "
                f"intent={analysis_data.get('query_intent')}, "
                f"real_time={analysis_data.get('requires_real_time')}, "
                f"searches={analysis_data.get('suggested_searches')}"
            )

            return QueryAnalysis(**analysis_data)

        except json.JSONDecodeError as e:
            logger.error(f"❌ JSON parse error in analyze_query: {e} | Raw: {raw[:200]}")
            return self._create_fallback_analysis(query, has_documents)

        except Exception as e:
            logger.error(f"❌ Groq API error in analyze_query: {e}")
            return self._create_fallback_analysis(query, has_documents)

    def _create_fallback_analysis(self, query: str, has_documents: bool = False) -> QueryAnalysis:
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

        # Heuristic intent detection when documents are present
        query_intent = None
        if has_documents:
            summary_phrases = [
                "what is this", "what's this", "what does this", "tell me about",
                "summarize", "summarise", "overview", "what type",
                "what kind", "explain this", "what is in", "about this pdf",
                "about this doc", "about the pdf", "about the document",
                "what this pdf", "what this doc"
            ]
            general_web_keywords = [
                "capital of", "who won", "world cup", "prime minister",
                "president of", "weather in", "population of"
            ]
            if any(phrase in query_lower for phrase in summary_phrases):
                query_intent = "doc_summary"
            elif any(kw in query_lower for kw in general_web_keywords):
                query_intent = "general_web"
            else:
                query_intent = "doc_qa"  # default when docs are present

        return QueryAnalysis(
            query_type="current_events" if is_real_time else "factual",
            search_intent=f"User wants information about: {query}",
            key_entities=[query[:50]],
            suggested_searches=suggested,
            complexity_score=5,
            requires_real_time=is_real_time,
            query_intent=query_intent
        )


