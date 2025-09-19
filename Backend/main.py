from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from fastapi.responses import StreamingResponse
from datetime import datetime
import uvicorn
import json
import asyncio
import logging
import uuid

from models.schemas import SearchRequest, SearchResponse, DocumentSearchResult, DocumentUploadResponse, DocumentSearchRequest
from services.query_analyzer import QueryAnalyzer
from services.search_orchestrator import SearchOrchestrator
from services.tavily_service import TavilyService
from config.settings import settings
from logger_config import setup_logger
from services.groq_service import GroqService
from services.document.document_processor import DocumentProcessor
from services.document.document_store import DocumentStore

setup_logger()
logger = logging.getLogger(__name__)

# Initialize services
query_analyzer = QueryAnalyzer()
search_orchestrator = SearchOrchestrator()
groq_service = GroqService() 
document_processor = DocumentProcessor()
document_store = DocumentStore()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle"""
    logger.info("Perplexity MVP Starting Up. :)")
    yield
    logger.info("Perplexity MVP Shutting Down. :(")

# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

@app.get("/chat_stream")
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
            if search_source == 'web' or search_source == 'hybrid':
                web_results = await search_orchestrator._execute_web_search(analysis, message)
                
                # Show web sources
                for i, result in enumerate(web_results.results[:6]):
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
                        await asyncio.sleep(0.3)
                    except Exception as e:
                        logger.warning(f"Error processing web source: {e}")
                        continue
            
            # 🎯 PHASE 5: RESPONSE GENERATION
            yield f"data: {json.dumps({'type': 'writing_start'})}\n\n"
            await asyncio.sleep(0.3)
            
            try:
                if search_source == 'documents':
                    # 🔥 FIXED: Generate document response inline
                    doc_context = ""
                    for i, result in enumerate(doc_results, 1):
                        doc_context += f"\n[Source {i} - {result['metadata']['filename']}, Page {result['metadata']['page_number']}]:\n"
                        doc_context += f"{result['content']}\n"
                    
                    document_prompt = f"""Answer the user's question using ONLY the provided document content.
DOCUMENT EXCERPTS:
{doc_context}

USER QUESTION: {message}

Provide a comprehensive answer with citations [Source X, Page Y]."""
                    
                    response = await groq_service.client.chat.completions.create(
                        model="openai/gpt-oss-20b",
                        messages=[
                            {"role": "system", "content": "You are a precise document analysis assistant. Always cite sources."},
                            {"role": "user", "content": document_prompt}
                        ],
                        temperature=0.1,
                        max_tokens=1500
                    )
                    
                    if response.choices and response.choices[0].message.content:
                        response_text = response.choices[0].message.content
                        sentences = response_text.split('. ')
                        for i, sentence in enumerate(sentences):
                            if sentence.strip():
                                chunk = sentence + ('. ' if i < len(sentences) - 1 else '')
                                yield f"data: {json.dumps({'type': 'content', 'content': chunk})}\n\n"
                                await asyncio.sleep(0.1)
                
                elif search_source == 'web':
                    # 🔥 FIXED: Generate web response inline
                    from services.content_synthesizer import ContentSynthesizer
                    synthesizer = ContentSynthesizer()
                    
                    synthesized = await synthesizer.synthesize_response(
                        query=message,
                        analysis=analysis,
                        web_results=web_results
                    )
                    
                    sentences = synthesized.response.split('. ')
                    for i, sentence in enumerate(sentences):
                        if sentence.strip():
                            chunk = sentence + ('. ' if i < len(sentences) - 1 else '')
                            yield f"data: {json.dumps({'type': 'content', 'content': chunk})}\n\n"
                            await asyncio.sleep(0.1)
                
                else:  # hybrid
                    # 🔥 FIXED: Generate hybrid response inline
                    doc_context = ""
                    if doc_results:
                        for i, result in enumerate(doc_results, 1):
                            doc_context += f"\n[Document Source {i} - {result['metadata']['filename']}, Page {result['metadata']['page_number']}]:\n"
                            doc_context += f"{result['content']}\n"
                    
                    web_context = ""
                    if web_results and web_results.results:
                        for i, result in enumerate(web_results.results[:3], 1):
                            web_context += f"\n[Web Source {i} - {result.url}]:\n"
                            web_context += f"{result.content}\n"
                    
                    hybrid_prompt = f"""Answer the user's question using BOTH document excerpts AND web sources provided below.
IMPORTANT: Combine information from both sources to give a comprehensive answer.

DOCUMENT EXCERPTS:
{doc_context}

WEB SOURCES:
{web_context}

USER QUESTION: {message}

Provide a comprehensive answer that integrates information from both documents and web sources. Use citations like [Document Source X] and [Web Source Y]."""
                    
                    response = await groq_service.client.chat.completions.create(
                        model="openai/gpt-oss-20b",
                        messages=[
                            {"role": "system", "content": "You are an expert research assistant. Combine information from multiple sources effectively."},
                            {"role": "user", "content": hybrid_prompt}
                        ],
                        temperature=0.1,
                        max_tokens=2000
                    )
                    
                    if response.choices and response.choices[0].message.content:
                        response_text = response.choices[0].message.content
                        sentences = response_text.split('. ')
                        for i, sentence in enumerate(sentences):
                            if sentence.strip():
                                chunk = sentence + ('. ' if i < len(sentences) - 1 else '')
                                yield f"data: {json.dumps({'type': 'content', 'content': chunk})}\n\n"
                                await asyncio.sleep(0.1)
                        
            except Exception as e:
                logger.error(f"❌ Response generation failed: {e}")
                yield f"data: {json.dumps({'type': 'content', 'content': f'Error generating response: {str(e)}'})}\n\n"
            
            yield f"data: {json.dumps({'type': 'end'})}\n\n"
            
        except Exception as e:
            logger.error(f"Stream error: {e}")
            yield f"data: {json.dumps({'type': 'search_error', 'error': str(e)})}\n\n"
            yield f"data: {json.dumps({'type': 'end'})}\n\n"
    
    return StreamingResponse(generate_stream(), media_type="text/event-stream")


@app.post("/documents/upload", response_model=DocumentUploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    session_id: str = Form(None)
):
    """Upload and process a document"""
    try:
        # Generate session_id if not provided
        if not session_id:
            session_id = str(uuid.uuid4())
        
        # Process the document
        result = await document_processor.process_upload(file, session_id)
        
        return DocumentUploadResponse(
            document_id=result["document_id"],
            filename=result["filename"],
            status=result["status"],
            message=result["message"],
            total_chunks=result.get("total_chunks"),
            processing_time=result.get("processing_time")
        )
        
    except Exception as e:
        logger.error(f"Document upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@app.get("/documents/session/{session_id}")
async def get_session_documents(session_id: str):
    """Get all documents for a session"""
    try:
        documents = document_store.get_session_documents(session_id)
        return {
            "session_id": session_id,
            "documents": documents,
            "total_documents": len(documents)
        }
    except Exception as e:
        logger.error(f"Error getting session documents: {e}")
        raise HTTPException(status_code=500, detail="Failed to get documents")
    
@app.get("/debug/session/{session_id}")
async def debug_session(session_id: str):
    """Debug endpoint to check session documents"""
    try:
        has_docs = document_store.has_documents(session_id)
        documents = document_store.get_session_documents(session_id)
        
        return {
            "session_id": session_id,
            "has_documents": has_docs,
            "document_count": len(documents),
            "documents": documents,
            "all_sessions": list(document_store.session_documents.keys())
        }
    except Exception as e:
        return {"error": str(e)}


@app.post("/documents/search")
async def search_documents(request: DocumentSearchRequest):
    """Search within uploaded documents"""
    try:
        results = document_store.search_documents(
            query=request.query,
            session_id=request.session_id,
            max_results=request.max_results
        )
        
        # Format results
        formatted_results = []
        for result in results:
            formatted_results.append(DocumentSearchResult(
                content=result["content"],
                page_number=result["metadata"]["page_number"],
                similarity_score=result["similarity_score"],
                document_filename=result["metadata"]["filename"],
                document_id=result["metadata"]["document_id"]
            ))
        
        return {
            "query": request.query,
            "session_id": request.session_id,
            "results": formatted_results,
            "total_results": len(formatted_results)
        }
        
    except Exception as e:
        logger.error(f"Document search failed: {e}")
        raise HTTPException(status_code=500, detail="Search failed")

@app.delete("/documents/{document_id}")
async def delete_document(document_id: str, session_id: str):
    """Delete a document and all its chunks"""
    try:
        logger.info(f"🗑️ Deleting document {document_id} from session {session_id}")
        
        # Remove from ChromaDB
        document_store.collection.delete(where={"document_id": {"$eq": document_id}})
        
        # Remove from session tracking
        if session_id in document_store.session_documents:
            document_store.session_documents[session_id] = [
                doc for doc in document_store.session_documents[session_id] 
                if doc.get("document_id") != document_id
            ]
            document_store._save_sessions()
        
        return {"message": "Document deleted successfully"}
        
    except Exception as e:
        logger.error(f"Failed to delete document {document_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete: {str(e)}")

@app.get("/")
async def root():
    """Health check point"""
    return {
        "message": "Perplexity MVP API is Running. :)",
        "status": "Healthy",
        "timestamp": datetime.now().isoformat()
    }

@app.get("/health")
async def health_check():
    """Detailed health check"""
    return {
        "status": "healthy",
        "services": {
            "groq": "connected",
            "tavily": "connected"
        },
        "timestamp": datetime.now().isoformat()
    }

@app.get("/test-tavily")
async def test_tavily_endpoint():
    """Test Tavily API connection"""
    try:
        tavily = TavilyService()
        results = await tavily.search_multiple(["test query"], max_results_per_search=1)
        return {
            "status": "success",
            "results_count": len(results),
            "message": "Tavily API is working!"
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Tavily API error: {str(e)}"
        }

@app.post("/search", response_model=SearchResponse)
async def search_endpoint(request: SearchRequest):
    """Complete search endpoint - Steps 1 & 2: Query Analysis + Web Search"""
    
    try:
        logger.info(f"Starting complete search for: {request.query}")
        
        # Execute complete search pipeline
        response = await search_orchestrator.execute_search(request)
        
        # Log Summary
        if response.web_results:
            logger.info(f"Completed search for: {response.web_results.total_results}")
        
        return response
        
    except Exception as e:
        logger.error(f"❌ Search endpoint error: {e}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        port=8000,
        reload=settings.debug,
        log_level="info"
    )
