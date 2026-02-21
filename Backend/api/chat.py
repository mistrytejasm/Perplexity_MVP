import json
import asyncio
import logging
import time
from datetime import datetime
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from models.schemas import SearchRequest
from core.dependencies import (
    query_analyzer, tavily_service, groq_service,
    conversation_store, document_store
)
from utils.citation_cleaner import normalized_stream, clean_citation

logger = logging.getLogger(__name__)

router = APIRouter()

async def _execute_web_search(analysis, original_query: str, is_real_time: bool):
    search_start = time.time()
    search_terms = analysis.suggested_searches
    if original_query not in search_terms:
        search_terms = [original_query] + search_terms
    max_searches = min(len(search_terms), 4 if is_real_time else 3)
    search_terms = search_terms[:max_searches]
    
    raw_results = await tavily_service.search_multiple(
        search_terms=search_terms,
        is_real_time=is_real_time
    )
    
    from models.schemas import SearchResult, WebSearchResults
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
            continue
            
    return WebSearchResults(
        total_results=len(search_results),
        search_terms_used=search_terms,
        results=search_results,
        search_duration=time.time() - search_start
    )

@router.get("/chat_stream")
async def chat_stream(message: str, checkpoint_id: str = None, session_id: str = None):
    async def generate_stream():
        try:
            logger.info(f"🚀 Chat stream started - Session: {session_id}, Query: {message}")
            
            # 🎯 PHASE 1: ANALYZE QUERY COMPLEXITY
            analysis = await query_analyzer.process_query(SearchRequest(query=message))
            is_multi_part_query = len(analysis.suggested_searches) > 1 or " and " in message.lower() or "?" in message[:-1]
            
            # 🎯 PHASE 2: DOCUMENT RELEVANCE CHECK
            doc_results = []
            has_relevant_docs = False
            
            if session_id:
                relevance_eval = document_store.evaluate_document_relevance(
                    query=message,
                    session_id=session_id,
                    relevance_threshold=0.10
                )
                
                logger.info(f"🎯 Relevance evaluation: {relevance_eval['reason']} (score: {relevance_eval['relevance_score']:.3f})")
                
                if relevance_eval["should_use_documents"]:
                    has_relevant_docs = True
                    doc_results = relevance_eval["relevant_chunks"]
            
            # 🎯 PHASE 3: HYBRID DECISION LOGIC
            use_hybrid = is_multi_part_query and has_relevant_docs  # Fixed logic
            
            if use_hybrid:
                logger.info("🔄 Using HYBRID SEARCH path (documents + web)")
                search_source = 'hybrid'
            elif has_relevant_docs:
                logger.info("📄 Using DOCUMENT SEARCH path")
                search_source = 'documents'
            else:
                logger.info("🌐 Using WEB SEARCH path")
                search_source = 'web'
            
            # 🎯 PHASE 4: SEARCH EXECUTION
            yield f"data: {json.dumps({'type': 'search_start', 'query': message, 'source': search_source})}\n\n"
            await asyncio.sleep(0.3)
            
            # 🔥 FIXED: Show original query first
            yield f"data: {json.dumps({'type': 'query_generated', 'query': message, 'query_type': 'original'})}\n\n"
            await asyncio.sleep(0.4)
            
            # 🔥 ENHANCED: Show ALL sub-queries without limit
            # Send each sub-query progressively
            if analysis.suggested_searches:
                for i, sub_query in enumerate(analysis.suggested_searches):
                    sub_query_data = {
                        'type': 'query_generated',
                        'query': sub_query,
                        'query_type': 'sub_query',
                        'index': i + 2  # Start from 2 (Original is 1)
                    }
                    yield f"data: {json.dumps(sub_query_data)}\n\n"
                    await asyncio.sleep(0.4)  # Delay between each query

            # Show reading phase
            yield f"data: {json.dumps({'type': 'reading_start'})}\n\n"
            await asyncio.sleep(0.3)
            
            # 🔥 HYBRID SOURCES: Show both document and web sources
            web_results = None
            
            # Show document sources (if any)
            if doc_results:
                for i, result in enumerate(doc_results):
                    try:
                        filename = result['metadata']['filename']
                        page_num = result['metadata']['page_number']
                        
                        source_data = {
                            'type': 'source_found',
                            'source': {
                                'url': f"document://{filename}#page{page_num}",
                                'domain': f"📄 {filename}",
                                'title': f"{filename} - Page {page_num}",
                                'score': abs(result.get('similarity_score', 0.8))
                            }
                        }
                        yield f"data: {json.dumps(source_data)}\n\n"
                        await asyncio.sleep(0.3)
                    except Exception as e:
                        logger.warning(f"Error processing document source: {e}")
                        continue
            
            # Get web results (always, for hybrid or web-only)
            if search_source in ('web', 'hybrid'):
                # ✅ Pass is_real_time so Tavily uses news/advanced mode for live queries
                web_results = await _execute_web_search(
                    analysis=analysis,
                    original_query=message,
                    is_real_time=analysis.requires_real_time
                )

                # Show web sources (up to 5)
                for result in web_results.results[:5]:
                    try:
                        domain = result.url.split('/')[2].replace('www.', '') if result.url else 'unknown'
                        source_data = {
                            'type': 'source_found',
                            'source': {
                                'url': result.url,
                                'domain': domain,
                                'title': result.title,
                                'score': result.score
                            }
                        }
                        yield f"data: {json.dumps(source_data)}\n\n"
                        await asyncio.sleep(0.25)
                    except Exception as e:
                        logger.warning(f"Error processing web source: {e}")
                        continue
            
            # 🎯 PHASE 5: RESPONSE GENERATION
            yield f"data: {json.dumps({'type': 'writing_start'})}\n\n"
            await asyncio.sleep(0.3)

            # ── Inject date + conversation context ───────────────────────────────
            today = datetime.now().strftime("%A, %B %d, %Y")
            history = conversation_store.get_context_for_llm(session_id) if session_id else []
            streamed_text = ""
            
            # Clean tokens using the centralized citation_cleaner module

            # Model to use for all generation paths
            GENERATION_MODEL = "llama-3.3-70b-versatile"

            try:
                if search_source == 'documents':
                    # ─ Build document context (1200 chars per source) ──────────────
                    doc_context = ""
                    for i, result in enumerate(doc_results[:5], 1):
                        doc_context += (
                            f"[{i}] {result['metadata']['filename']} "
                            f"(page {result['metadata']['page_number']}):\n"
                            f"{result['content'][:1200]}\n\n"
                        )

                    doc_prompt = (
                        f"Today is {today}.\n\n"
                        f"Answer the question using ONLY the numbered document excerpts below.\n\n"
                        f"{doc_context}\n"
                        f"QUESTION: {message}\n\n"
                        f"RULES:\n"
                        f"- Answer naturally in your own words. NEVER say 'Based on source [N]' or 'According to document [N]'.\n"
                        f"- Cite every fact by simply appending [N] directly at the end of the relevant sentence. Example: \"Revenue grew 20% [1].\"\n"
                        f"- Multiple sources: [1][2]\n"
                        f"- For time-sensitive facts, add 'as of [date from source]'.\n"
                        f"- Use ONLY plain square brackets. NEVER use 【】 or any other style.\n"
                        f"- Use ## headings, **bold**, - bullets.\n"
                        f"- NO References section at the end."
                    )
                    system_doc = (
                        f"You are a precise document analyst. Today is {today}. "
                        "Write naturally and append [N] at the end of sentences for citations. "
                        "NEVER refer to sources by name or number in the text (e.g. do not say 'Source 1 says'). "
                        "Use ONLY square bracket citations like [1] or [1][2]. "
                        "If sources conflict on dates, prefer the most recent one."
                    )
                    stream = await groq_service.client.chat.completions.create(
                        model=GENERATION_MODEL,
                        messages=[
                            {"role": "system", "content": system_doc},
                            *history,
                            {"role": "user", "content": doc_prompt}
                        ],
                        temperature=0.1,
                        max_tokens=1500,
                        stream=True
                    )
                    async for clean_token in normalized_stream(stream):
                        clean_token = clean_citation(clean_token)
                        if clean_token:
                            yield f"data: {json.dumps({'type': 'content', 'content': clean_token})}\n\n"
                            streamed_text += clean_token

                elif search_source == 'web':
                    # ─ Build web context (1200 chars per source, cap at 5) ────────
                    web_context = ""
                    if web_results and web_results.results:
                        for i, result in enumerate(web_results.results[:5], 1):
                            pub = getattr(result, 'published_date', '') or ''
                            date_line = f"Published: {pub}\n" if pub else ""
                            web_context += (
                                f"[{i}] {result.title}\n"
                                f"URL: {result.url}\n"
                                f"{date_line}"
                                f"{result.content[:1200]}\n\n"
                            )

                    web_prompt = (
                        f"Today is {today}.\n\n"
                        f"Answer the question using the numbered web sources below.\n\n"
                        f"{web_context}\n"
                        f"QUESTION: {message}\n\n"
                        f"RULES:\n"
                        f"- Answer naturally in your own words. NEVER say 'Based on source [N]' or 'According to source [N]'.\n"
                        f"- Append the source number in square brackets [N] directly at the end of the sentence containing the fact.\n"
                        f"- Example: \"India plays Netherlands on 18 Feb 2026 [1].\"\n"
                        f"- For time-sensitive data (scores, schedules), ALWAYS state the date from the source.\n"
                        f"- If sources conflict, prefer the most recently published one and say so.\n"
                        f"- Use ONLY plain square bracket citations. NEVER use 【】 or other formats.\n"
                        f"- Use ## headings, **bold** key terms, - bullet points.\n"
                        f"- NO References or Sources section at the end."
                    )
                    system_web = (
                        f"You are a research assistant. Today is {today}. "
                        "Write naturally and append [N] at the end of sentences for citations. "
                        "NEVER refer to sources by name or number in the text (e.g. do not say 'Source 1 says'). "
                        "For real-time facts (scores, match results, prices), always add 'as of [date from source]'. "
                        "Use ONLY plain square bracket format."
                    )
                    stream = await groq_service.client.chat.completions.create(
                        model=GENERATION_MODEL,
                        messages=[
                            {"role": "system", "content": system_web},
                            *history,
                            {"role": "user", "content": web_prompt}
                        ],
                        temperature=0.1,
                        max_tokens=2000,
                        stream=True
                    )
                    async for clean_token in normalized_stream(stream):
                        clean_token = clean_citation(clean_token)
                        if clean_token:
                            yield f"data: {json.dumps({'type': 'content', 'content': clean_token})}\n\n"
                            streamed_text += clean_token

                else:  # hybrid
                    hybrid_context = ""
                    ctx_idx = 1
                    
                    if doc_results:
                        for result in doc_results[:3]:
                            hybrid_context += (
                                f"[{ctx_idx}] DOC: {result['metadata']['filename']} pg "
                                f"{result['metadata']['page_number']}:\n"
                                f"{result['content'][:500]}\n\n"
                            )
                            ctx_idx += 1
                    if web_results and web_results.results:
                        for result in web_results.results[:4]:
                            hybrid_context += (
                                f"[{ctx_idx}] WEB: {result.title}\n"
                                f"URL: {result.url}\n"
                                f"{result.content[:500]}\n\n"
                            )
                            ctx_idx += 1

                    hybrid_prompt = (
                        f"Answer using both document excerpts and web sources below.\n\n"
                        f"{hybrid_context}\n"
                        f"QUESTION: {message}\n\n"
                        f"RULES:\n"
                        f"- Answer naturally in your own words. NEVER say 'Based on source [N]' or 'According to [N]'.\n"
                        f"- Cite every fact immediately by appending [N] directly at the end of the sentence.\n"
                        f"- Use ONLY plain square bracket format: [1], [2], [1][2].\n"
                        f"- NEVER use 【】 or other bracket styles.\n"
                        f"- Use ## headings, **bold**, - bullets.\n"
                        f"- NO References section at end."
                    )
                    stream = await groq_service.client.chat.completions.create(
                        model=GENERATION_MODEL,
                        messages=[
                            {"role": "system", "content": (
                                "You are a research assistant for hybrid document+web search. "
                                "Write naturally and append [N] at the end of sentences for citations. "
                                "NEVER refer to sources by name or number in the text (e.g. do not say 'Source 1 says'). "
                                "Use ONLY plain square brackets. Never use other citation formats."
                            )},
                            {"role": "user", "content": hybrid_prompt}
                        ],
                        temperature=0.1,
                        max_tokens=2000,
                        stream=True
                    )
                    async for clean_token in normalized_stream(stream):
                        clean_token = clean_citation(clean_token)
                        if clean_token:
                            yield f"data: {json.dumps({'type': 'content', 'content': clean_token})}\n\n"
                            streamed_text += clean_token

            except Exception as e:
                logger.error(f"❌ Response generation failed: {e}")
                yield f"data: {json.dumps({'type': 'content', 'content': f'Error generating response: {str(e)}'})}\n\n"


            if session_id and streamed_text:
                conversation_store.add_user_message(session_id, message)
                conversation_store.add_assistant_message(session_id, streamed_text)
            yield f"data: {json.dumps({'type': 'end'})}\n\n"
            
        except Exception as e:
            logger.error(f"Stream error: {e}")
            yield f"data: {json.dumps({'type': 'search_error', 'error': str(e)})}\n\n"

            if session_id and streamed_text:
                conversation_store.add_user_message(session_id, message)
                conversation_store.add_assistant_message(session_id, streamed_text)
            yield f"data: {json.dumps({'type': 'end'})}\n\n"
    
    return StreamingResponse(generate_stream(), media_type="text/event-stream")
