import json
from typing import List, Dict, Any, Optional
from groq import AsyncGroq
from models.schemas import WebSearchResults, SearchResult, QueryAnalysis, SynthesizedResponse
from config.settings import settings
import logging
import re

logger = logging.getLogger(__name__)

class ContentSynthesizer:
    """Synthesizes search results into comprehensive, cited responses"""

    def __init__(self):
        self.client = AsyncGroq(api_key=settings.GROQ_API_KEY)
        self.model = "openai/gpt-oss-20b"
        self.max_content_length = 2000   # Limit content per source

    async def synthesize_response(self, 
                                  query: str, 
                                  analysis: QueryAnalysis, 
                                  web_results: WebSearchResults,
                                  ) -> SynthesizedResponse:
        """Generate comprehensive response from search results"""

        logger.info(f"Synthesizing Response from {web_results.total_results} sources")

        # Step 1: Prepare and clean search Content
        processed_sources = self._process_search_results(web_results.results)

        if not processed_sources:
            logger.warning("No Valid Sources to synthesis from")
            return self._create_fallback_response(query)
        
        # Step 2: Create synthesis prompt
        synthesis_prompt = self._create_synthesis_prompt(
            query=query,
            analysis=analysis,
            sources=processed_sources
        )

        # Step 3: Generate response using Groq
        try: 
            synthesized_content = await self._generate_with_groq(synthesis_prompt)

            # Step 4: Process and validate response
            response = self._process_synthesized_response(
                content=synthesized_content,
                sources=processed_sources,
                query=query
            )

            logger.info(f"Response synthesized successfully")
            return response
        
        except Exception as e:
            logger.error(f"Synthesis failed: {e}")
            return self._create_fallback_response(query, str(e))
        
    def _process_search_results(self, results: List[SearchResult]) -> List[Dict[str, Any]]:
        """Clean and prepare search results for synthesis"""

        processed = []

        for i, result in enumerate(results[:6]):  # MUST match the 6 results streamed in main.py
            try:
                # Clean and truncate content
                content = self._clean_content(result.content)

                # Truncate if too long
                if len(content) > self.max_content_length:
                    content = content[:self.max_content_length] + "..."

                source = {
                    "id": i + 1,  # Strictly align with frontend index (i)
                    "title": result.title,
                    "url": result.url,
                    "content": content if len(content) >= 10 else "Content unavailable or too short.",
                    "score": result.score
                }

                processed.append(source)

            except Exception as e:
                logger.warning(f"Failed to process result {i}: {e}")
                continue

        logger.info(f"Processed {len(processed)} valid sources")
        return processed
    
    def _clean_content(self, content: str) -> str:
        """Clean and normalize content text"""
        
        # Remove extra whitespace and newlines
        content = re.sub(r'\s+', ' ', content)
        
        # Remove common web artifacts
        content = re.sub(r'(Cookie|Privacy Policy|Terms of Service).*', '', content)
        content = re.sub(r'Advertisement\s*', '', content, flags=re.IGNORECASE)
        
        # Remove HTML-like tags if any
        content = re.sub(r'<[^>]+>', '', content)
        
        return content.strip()
    
    def _create_synthesis_prompt(
        self, 
        query: str, 
        analysis: QueryAnalysis, 
        sources: List[Dict[str, Any]]
    ) -> str:
        """Create comprehensive prompt for content synthesis"""
        
        # Build sources context
        sources_text = ""
        for source in sources:
            sources_text += f"Source [{source['id']}]: {source['title']}\nURL: {source['url']}\nContent: {source['content']}\n---\n"
            
        prompt = f"""
You are an expert, highly analytical research assistant. Your task is to synthesize information from multiple sources to answer the user's query comprehensively and accurately.

**User Query**: "{query}"

**Query Analysis**:
- Type: {analysis.query_type}
- Intent: {analysis.search_intent}
- Complexity: {analysis.complexity_score}/10

**Available Sources**:
{sources_text}

**Instructions**:
1. **Synthesize** information from the sources to create a comprehensive, continuous answer.
2. **Use proper citations** - You MUST reference sources using bracketed numbers, specifically [1], [2], etc., corresponding to the Source ID.
3. **Be accurate** - Only use information that's clearly supported by the sources. Do not hallucinate.
4. **Structure well** - Use headers, bullet points, and clear organization.
5. **Be comprehensive** - Cover all relevant aspects of the query.

**Response Format**:
- Start with a clear, direct answer to the main question.
- Provide detailed explanation with proper citations.
- Use markdown formatting for better readability.
- DO NOT add a "References" or "Sources" section at the end. Your only citations must be inline bracketed numbers.

**STRICT Citation Rules (CRITICAL)**:
- You MUST cite EVERY source provided in the "Available Sources" section if you use it. Do not leave sources uncited.
- Cite sources immediately after relevant statements: "Quantum computers use qubits [1]."
- DO NOT use markdown links for citations. Just use the raw bracket: [1]
- Use multiple citations when information comes from multiple sources: "Apple and Google are tech companies [1][2]."
- Never make claims without citing sources.
- Ensure every major fact or claim has at least one proper citation.

Generate a comprehensive, well-cited response now:
"""
        
        return prompt
    
    async def _generate_with_groq(self, prompt: str) -> str:
        """Generate response using Groq LLM"""
        
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system", 
                        "content": "You are an expert research assistant that creates comprehensive, well-cited responses. Always use proper citations and maintain accuracy."
                    },
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,  # Low temperature for accuracy
                max_tokens=2000,  # Comprehensive responses
                top_p=0.9
            )
            
            return response.choices[0].message.content.strip()
            
        except Exception as e:
            logger.error(f"❌ Groq generation failed: {e}")
            raise
    
    def _process_synthesized_response(
        self, 
        content: str, 
        sources: List[Dict[str, Any]], 
        query: str
    ) -> SynthesizedResponse:
        """Process and validate synthesized response"""
        
        # Extract citations from content
        citation_pattern = r'\[(\d+)\]'
        citations_used = set(re.findall(citation_pattern, content))
        
        # Create source mapping for citations
        cited_sources = []
        for source in sources:
            if str(source['id']) in citations_used:
                cited_sources.append({
                    "id": source['id'],
                    "title": source['title'],
                    "url": source['url']
                })
        
        # Calculate response metrics
        word_count = len(content.split())
        citation_count = len(citations_used)
        
        return SynthesizedResponse(
            query=query,
            response=content,
            sources_used=cited_sources,
            total_sources=len(sources),
            word_count=word_count,
            citation_count=citation_count,
            synthesis_quality_score=self._calculate_quality_score(
                content, citation_count, word_count
            )
        )
    
    def _calculate_quality_score(self, content: str, citations: int, words: int) -> float:
        """Calculate quality score for the synthesized response"""
        
        score = 0.0
        
        # Citation density (good: 1 citation per 50-100 words)
        if words > 0:
            citation_density = citations / (words / 50)
            if 0.5 <= citation_density <= 2.0:
                score += 0.3
            elif citation_density > 0:
                score += 0.1
        
        # Content length (good: 200-800 words for most queries)
        if 200 <= words <= 800:
            score += 0.3
        elif words >= 100:
            score += 0.2
        
        # Structure indicators
        if '##' in content or '###' in content:  # Headers
            score += 0.1
        if '- ' in content or '* ' in content:  # Lists
            score += 0.1
        if citations > 2:  # Multiple sources
            score += 0.2
        
        return min(score, 1.0)  # Cap at 1.0
    
    def _create_fallback_response(self, query: str, error: str = None) -> SynthesizedResponse:
        """Create fallback response when synthesis fails"""
        
        fallback_content = f"""
            I apologize, but I encountered difficulty synthesizing a comprehensive response for your query: "{query}".

            {f"Error details: {error}" if error else "This may be due to limited search results or processing issues."}

            Please try rephrasing your question or asking about a different topic.
            """
        
        return SynthesizedResponse(
            query=query,
            response=fallback_content,
            sources_used=[],
            total_sources=0,
            word_count=len(fallback_content.split()),
            citation_count=0,
            synthesis_quality_score=0.1
        )