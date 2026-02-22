import json
import asyncio
import logging
import time
from datetime import datetime
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from models.schemas import SearchRequest, MODEL_DISPLAY_NAMES
from core.dependencies import (
    query_analyzer, tavily_service, groq_service,
    conversation_store, document_store
)
from utils.citation_cleaner import normalized_stream, clean_citation

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Allowed model registry ────────────────────────────────────────────────────
ALLOWED_MODELS = {
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "mixtral-8x7b-32768",
}

# ── Auto-routing thresholds ───────────────────────────────────────────────────
def resolve_model(requested_model: str, complexity_score: int) -> str:
    """
    Resolves the final generation model to use.

    If the user picked a specific model: validate it and use it.
    If 'auto': pick based on the query complexity_score from the analyzer:
      - Score 1-3  → llama-3.1-8b-instant  (simple factual / speed)
      - Score 4-7  → llama-3.3-70b-versatile (balanced)
      - Score 8-10 → openai/gpt-oss-120b   (deep reasoning / code)
    """
    if requested_model and requested_model != "auto":
        if requested_model in ALLOWED_MODELS:
            return requested_model
        logger.warning(f"Model '{requested_model}' not in allow-list, falling back to auto.")

    # Auto routing
    if complexity_score <= 3:
        return "llama-3.1-8b-instant"
    elif complexity_score <= 7:
        return "llama-3.3-70b-versatile"
    else:
        return "openai/gpt-oss-120b"


# ── Web search helper ─────────────────────────────────────────────────────────
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
            search_results.append(SearchResult(
                title=result.get('title', 'No title'),
                url=result.get('url', ''),
                content=result.get('content', ''),
                score=result.get('score', 0.0),
                calculated_score=result.get('calculated_score'),
                published_date=result.get('published_date')
            ))
        except Exception:
            continue

    return WebSearchResults(
        total_results=len(search_results),
        search_terms_used=search_terms,
        results=search_results,
        search_duration=time.time() - search_start
    )


# ── LLM Evaluation Gate for RAG Fallback ─────────────────────────────────────
async def _pdf_can_answer(query: str, doc_chunks: list) -> bool:
    """
    Uses a fast, cheap LLM call (llama-3.1-8b-instant) to evaluate whether
    the retrieved PDF chunks actually contain enough information to answer
    the user's query. Returns True if yes, False if we should fall back to web.
    """
    if not doc_chunks:
        return False

    doc_context = "\n\n".join([
        f"[{i+1}] {c['content'][:600]}"
        for i, c in enumerate(doc_chunks[:4])
    ])

    evaluation_prompt = (
        f"You are a strict factual evaluator. Read the document excerpts below and "
        f"determine ONLY whether they contain enough information to answer the question.\n\n"
        f"DOCUMENT EXCERPTS:\n{doc_context}\n\n"
        f"QUESTION: {query}\n\n"
        f"Reply with ONLY one word: YES if the excerpts can answer the question, NO if they cannot."
    )

    try:
        response = await groq_service.client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": evaluation_prompt}],
            temperature=0.0,
            max_tokens=5,
            stream=False
        )
        answer = response.choices[0].message.content.strip().upper()
        logger.info(f"🤖 PDF evaluation gate: '{answer}'")
        return answer.startswith("Y")
    except Exception as e:
        logger.error(f"PDF evaluation gate failed: {e}")
        return True   # Default to using docs if evaluation fails


# ── Generation prompt templates ───────────────────────────────────────────────
_CRITICAL_CITATION_RULES = (
    "CRITICAL RULES:\n"
    "1. NEVER refer to the sources by name. "
    "FORBIDDEN PHRASES: 'Source [N] provides...', 'According to source N...', 'Based on the document...'.\n"
    "2. State answers directly as authoritative facts. "
    "Append the source number in square brackets [N] at the very end of each sentence containing the fact.\n"
    "3. Use ONLY plain square bracket citations like [1] or [1][2]. NEVER use \u3010\u3011 or other styles.\n"
    "4. NO References or Sources section at the end.\n"
    "5. Use ## headings, **bold** key terms, and - bullet points.\n"
)

_SYSTEM_PROMPT = (
    "You are a direct, authoritative AI assistant. "
    "State facts directly and NEVER use conversational filler mentioning sources "
    "(e.g. do not say 'Source 1 says'). Simply append [N] at the end of factual sentences. "
    "Use ONLY plain square bracket format. "
    "For real-time facts (scores, results, prices), always add 'as of [date from source]'."
)


def _build_doc_prompt(today: str, doc_context: str, message: str) -> str:
    return (
        f"Today is {today}.\n\n"
        f"Answer the question using ONLY the numbered document excerpts below.\n\n"
        f"{doc_context}\n"
        f"QUESTION: {message}\n\n"
        f"{_CRITICAL_CITATION_RULES}"
    )


def _build_summary_prompt(today: str, doc_context: str, message: str) -> str:
    """Prompt variant for document-summary queries — uses a lighter citation style."""
    return (
        f"Today is {today}.\n\n"
        f"You are summarizing an uploaded document. The document content is provided below in numbered sections.\n\n"
        f"{doc_context}\n"
        f"USER REQUEST: {message}\n\n"
        f"Provide a comprehensive overview of what this document is about, what information it contains, "
        f"its main topics and purpose. Use ## headings and bullet points. "
        f"Cite sections with [N] where relevant. DO NOT add a References section at the end."
    )


def _build_web_prompt(today: str, web_context: str, message: str) -> str:
    return (
        f"Today is {today}.\n\n"
        f"Answer the question using the numbered web sources below.\n\n"
        f"{web_context}\n"
        f"QUESTION: {message}\n\n"
        f"{_CRITICAL_CITATION_RULES}"
        f"- For time-sensitive data (scores, schedules), ALWAYS state the date from the source.\n"
        f"- If sources conflict, prefer the most recently published one and say so."
    )


def _build_hybrid_prompt(today: str, hybrid_context: str, message: str) -> str:
    return (
        f"Today is {today}.\n\n"
        f"Answer using BOTH document excerpts (labeled [DOC X]) and web sources (labeled [WEB Y]) below.\n\n"
        f"{hybrid_context}\n"
        f"QUESTION: {message}\n\n"
        f"{_CRITICAL_CITATION_RULES}"
        f"- [DOC X] citations come from the uploaded PDF. [WEB Y] citations come from web search.\n"
        f"- Keep PDF and web citations clearly distinct in your answer."
    )


def _build_not_in_doc_prompt(today: str, web_context: str, message: str) -> str:
    """
    Used when the user's question could not be answered from their uploaded document.
    The LLM is explicitly told to acknowledge this and then answer from web sources.
    """
    return (
        f"Today is {today}.\n\n"
        f"CONTEXT: The user uploaded a document, but it does NOT contain the answer to their question.\n"
        f"You must:\n"
        f"  1. Start your response by briefly stating that the uploaded document does not contain this information.\n"
        f"  2. Then answer the question using the web sources provided below.\n\n"
        f"WEB SOURCES:\n{web_context}\n"
        f"QUESTION: {message}\n\n"
        f"{_CRITICAL_CITATION_RULES}"
        f"- All citations refer to the web sources above, NOT the uploaded document.\n"
        f"- For time-sensitive data, ALWAYS state the date from the source."
    )


# ── Main SSE endpoint ─────────────────────────────────────────────────────────
@router.get("/chat_stream")
async def chat_stream(
    message: str,
    checkpoint_id: str = None,
    session_id: str = None,
    model: str = "auto"
):
    async def generate_stream():
        streamed_text = ""
        try:
            logger.info(f"🚀 Chat stream — Session: {session_id}, Model: {model}, Query: {message}")

            today = datetime.now().strftime("%A, %B %d, %Y")
            history = conversation_store.get_context_for_llm(session_id) if session_id else []

            # ── PHASE 1: QUERY ANALYSIS ───────────────────────────────────────
            # Check document presence BEFORE analysis so we can ask the LLM
            # to classify query_intent (doc_summary / doc_qa / general_web)
            session_has_docs = bool(session_id and document_store.has_documents(session_id))
            logger.info(f"📂 session_has_docs={session_has_docs}  session_id={session_id}")
            analysis = await query_analyzer.process_query(
                SearchRequest(query=message),
                has_documents=session_has_docs
            )
            query_intent = analysis.query_intent  # None when no docs
            is_multi_part = len(analysis.suggested_searches) > 1 or " and " in message.lower() or "?" in message[:-1]

            # ── PHASE 1c: HEURISTIC OVERRIDE for doc_summary ─────────────────
            # The LLM sometimes misclassifies short phrases like "what this pdf
            # is about?" as general_web. We guard against that here with an
            # exhaustive keyword list that runs whenever docs are present.
            SUMMARY_PHRASES = [
                "what is this", "what's this", "what this",
                "what is the pdf", "what this pdf", "what the pdf",
                "what is this pdf", "what is this doc", "what this doc",
                "what is this document", "what this document",
                "about this pdf", "about this doc", "about the pdf",
                "about the document", "about this file",
                "summarize", "summarise", "give me a summary",
                "give me an overview", "overview of", "overview of this",
                "explain this pdf", "explain this doc", "explain this document",
                "explain the pdf", "explain the document",
                "tell me about this", "tell me about the pdf",
                "what does this contain", "what does it contain",
                "what type of information", "what kind of information",
                "what information does", "what is in this", "what is in the",
                "describe this", "describe the pdf", "describe the document",
                "contents of", "content of this", "topics in this",
            ]
            if session_has_docs:
                msg_lower = message.lower().strip()
                if any(phrase in msg_lower for phrase in SUMMARY_PHRASES):
                    if query_intent != "doc_summary":
                        logger.info(f"🔁 Heuristic override: '{query_intent}' → 'doc_summary' (matched summary phrase)")
                        query_intent = "doc_summary"

            logger.info(f"🧩 final query_intent={query_intent}  session_has_docs={session_has_docs}")

            # ── PHASE 1b: AUTO-ROUTING — resolve the generation model ─────────
            generation_model = resolve_model(model, analysis.complexity_score)
            display_name = MODEL_DISPLAY_NAMES.get(generation_model, generation_model)
            logger.info(f"🤖 Model resolved: {generation_model} (complexity={analysis.complexity_score})")

            # ── PHASE 2: DOCUMENT INTENT ROUTING ─────────────────────────────
            doc_results = []
            has_relevant_docs = False
            rag_fallback_used = False       # PDF failed strict gate → fell back to web
            doc_not_in_doc = False          # search ran but PDF didn't contain the answer

            if session_has_docs:

                if query_intent == "doc_summary":
                    # ── PATH A: SUMMARY — bypass semantic search entirely ──────
                    # Just grab the first 8 chunks in reading order.
                    logger.info("📄 doc_summary intent — fetching document preview (bypass strict RAG)")
                    preview_chunks = document_store.get_document_preview(session_id, max_chunks=8)
                    if preview_chunks:
                        doc_results = preview_chunks
                        has_relevant_docs = True
                    else:
                        # No chunks at all (edge case) → fall back to web
                        rag_fallback_used = True

                elif query_intent == "general_web":
                    # ── PATH B: GENERAL WEB — question clearly unrelated to PDF ─
                    logger.info("🌐 general_web intent — skipping document search entirely")
                    # has_relevant_docs stays False → will use web search

                else:
                    # ── PATH C: DOC_QA — semantic search + LLM evaluation gate ─
                    # This is also the default when has_documents=True and intent
                    # couldn't be determined (None → treated as doc_qa).
                    logger.info("🔍 doc_qa intent — running strict RAG pipeline")
                    relevance_eval = document_store.evaluate_document_relevance(
                        query=message,
                        session_id=session_id,
                        relevance_threshold=0.10
                    )
                    logger.info(f"🎯 Relevance eval: {relevance_eval['reason']} (score: {relevance_eval.get('rerank_score', 0):.3f})")

                    if relevance_eval["should_use_documents"]:
                        chunks = relevance_eval["relevant_chunks"]
                        pdf_has_answer = await _pdf_can_answer(message, chunks)

                        if pdf_has_answer:
                            has_relevant_docs = True
                            doc_results = chunks
                        else:
                            # Semantic search found chunks but they don't answer the question
                            logger.info("🔀 LLM gate: NO — document doesn't contain the answer")
                            doc_not_in_doc = True
                    else:
                        # Re-ranker score too low — document is probably unrelated
                        logger.info("⚠️ Re-ranker threshold not met — treating as not-in-doc")
                        doc_not_in_doc = True

            # ── PHASE 3: SEARCH SOURCE DECISION ──────────────────────────────
            if has_relevant_docs:
                # doc_summary: NEVER go hybrid — the user asked about their
                # document, not the web. Always answer from the PDF only.
                if query_intent == "doc_summary":
                    search_source = 'documents'
                elif is_multi_part:
                    search_source = 'hybrid'
                else:
                    search_source = 'documents'
            elif doc_not_in_doc:
                # User has a doc but it doesn't answer this question — search web
                # BUT tell the LLM to acknowledge this honestly
                search_source = 'not_in_doc'
            else:
                search_source = 'web'

            # ── PHASE 4: SEARCH EXECUTION ─────────────────────────────────────
            yield f"data: {json.dumps({'type': 'search_start', 'query': message, 'source': search_source})}\n\n"
            await asyncio.sleep(0.3)

            # Notify UI of fallback reasons
            if rag_fallback_used:
                yield f"data: {json.dumps({'type': 'rag_fallback', 'reason': 'Answer not found in document. Searching the web...'})}\n\n"
                await asyncio.sleep(0.3)
            elif doc_not_in_doc:
                yield f"data: {json.dumps({'type': 'rag_fallback', 'reason': 'Your document does not contain this information. Searching the web instead...'})}\n\n"
                await asyncio.sleep(0.3)

            # Show original query
            yield f"data: {json.dumps({'type': 'query_generated', 'query': message, 'query_type': 'original'})}\n\n"
            await asyncio.sleep(0.4)

            # Show sub-queries (skip for doc_summary — no sub-queries needed)
            if query_intent != "doc_summary":
                for i, sub_q in enumerate(analysis.suggested_searches):
                    yield f"data: {json.dumps({'type': 'query_generated', 'query': sub_q, 'query_type': 'sub_query', 'index': i + 2})}\n\n"
                    await asyncio.sleep(0.4)

            yield f"data: {json.dumps({'type': 'reading_start'})}\n\n"
            await asyncio.sleep(0.3)

            # Show document sources
            if doc_results:
                for result in doc_results:
                    try:
                        filename = result['metadata']['filename']
                        page_num  = result['metadata'].get('page_number', 1)
                        yield f"data: {json.dumps({'type': 'source_found', 'source': {'url': f'document://{filename}#page{page_num}', 'domain': f'📄 {filename}', 'title': f'{filename} — Page {page_num}', 'score': abs(result.get('similarity_score', 0.8))}})}\n\n"
                        await asyncio.sleep(0.3)
                    except Exception as e:
                        logger.warning(f"Error streaming doc source: {e}")

            # Get web results when needed
            web_results = None
            if search_source in ('web', 'hybrid', 'not_in_doc'):
                web_results = await _execute_web_search(
                    analysis=analysis,
                    original_query=message,
                    is_real_time=analysis.requires_real_time
                )
                for result in web_results.results[:5]:
                    try:
                        domain = result.url.split('/')[2].replace('www.', '') if result.url else 'unknown'
                        yield f"data: {json.dumps({'type': 'source_found', 'source': {'url': result.url, 'domain': domain, 'title': result.title, 'score': result.score}})}\n\n"
                        await asyncio.sleep(0.25)
                    except Exception as e:
                        logger.warning(f"Error streaming web source: {e}")

            # ── PHASE 5: EMIT MODEL SELECTED ─────────────────────────────────
            yield f"data: {json.dumps({'type': 'model_selected', 'model': generation_model, 'display_name': display_name})}\n\n"
            await asyncio.sleep(0.1)

            yield f"data: {json.dumps({'type': 'writing_start'})}\n\n"
            await asyncio.sleep(0.3)

            # ── PHASE 5b: RESPONSE GENERATION ────────────────────────────────
            try:
                if search_source == 'documents':
                    if query_intent == 'doc_summary':
                        # Summary: use the lightweight summary prompt
                        doc_context = ""
                        for i, r in enumerate(doc_results[:8], 1):
                            pg = r['metadata'].get('page_number', '?')
                            doc_context += f"[{i}] Page {pg}:\n{r['content'][:1000]}\n\n"
                        prompt = _build_summary_prompt(today, doc_context, message)
                    else:
                        # doc_qa: strict citation prompt
                        doc_context = ""
                        for i, r in enumerate(doc_results[:5], 1):
                            doc_context += (
                                f"[{i}] {r['metadata']['filename']} "
                                f"(page {r['metadata'].get('page_number', '?')}) "
                                f"[re-rank: {r.get('rerank_score', 0):.1f}]:\n"
                                f"{r['content'][:1200]}\n\n"
                            )
                        prompt = _build_doc_prompt(today, doc_context, message)

                elif search_source == 'not_in_doc':
                    # PDF didn't have the answer → web search with transparency
                    web_context = ""
                    if web_results and web_results.results:
                        for i, r in enumerate(web_results.results[:5], 1):
                            pub = getattr(r, 'published_date', '') or ''
                            date_line = f"Published: {pub}\n" if pub else ""
                            web_context += f"[{i}] {r.title}\nURL: {r.url}\n{date_line}{r.content[:1200]}\n\n"
                    prompt = _build_not_in_doc_prompt(today, web_context, message)

                elif search_source == 'web':
                    web_context = ""
                    if web_results and web_results.results:
                        for i, r in enumerate(web_results.results[:5], 1):
                            pub = getattr(r, 'published_date', '') or ''
                            date_line = f"Published: {pub}\n" if pub else ""
                            web_context += f"[{i}] {r.title}\nURL: {r.url}\n{date_line}{r.content[:1200]}\n\n"
                    prompt = _build_web_prompt(today, web_context, message)

                else:  # hybrid — label DOC vs WEB distinctly
                    hybrid_context = ""
                    ctx_idx = 1
                    if doc_results:
                        for r in doc_results[:3]:
                            hybrid_context += (
                                f"[DOC {ctx_idx}] {r['metadata']['filename']} "
                                f"pg {r['metadata'].get('page_number', '?')}:\n"
                                f"{r['content'][:600]}\n\n"
                            )
                            ctx_idx += 1
                    if web_results and web_results.results:
                        web_idx = 1
                        for r in web_results.results[:4]:
                            hybrid_context += (
                                f"[WEB {web_idx}] {r.title}\n"
                                f"URL: {r.url}\n{r.content[:600]}\n\n"
                            )
                            web_idx += 1
                    prompt = _build_hybrid_prompt(today, hybrid_context, message)

                stream = await groq_service.client.chat.completions.create(
                    model=generation_model,
                    messages=[
                        {"role": "system", "content": _SYSTEM_PROMPT},
                        *history,
                        {"role": "user", "content": prompt}
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
                logger.error(f"❌ Generation failed: {e}")
                yield f"data: {json.dumps({'type': 'content', 'content': f'Error generating response: {str(e)}'})}\n\n"

            # Save conversation turn
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


@router.get("/models")
async def list_models():
    """Returns the list of available models for the frontend selector"""
    return {
        "models": [
            {"id": "auto", "display_name": "Auto (Recommended)", "description": "Automatically selects the best model based on query complexity"},
            {"id": "openai/gpt-oss-120b", "display_name": "GPT-OSS 120B", "description": "Premium reasoning engine — best for complex logic and coding"},
            {"id": "openai/gpt-oss-20b", "display_name": "GPT-OSS 20B", "description": "Balanced engine — great speed-to-intelligence ratio"},
            {"id": "llama-3.3-70b-versatile", "display_name": "Llama 3.3 70B", "description": "Powerful engine — excellent at following citation rules"},
            {"id": "llama-3.1-8b-instant", "display_name": "Llama 3.1 8B", "description": "Speed engine — lightning fast for simple queries"},
            {"id": "mixtral-8x7b-32768", "display_name": "Mixtral 8x7B", "description": "Alternative MoE architecture — high context window"},
        ],
        "default": "auto"
    }
