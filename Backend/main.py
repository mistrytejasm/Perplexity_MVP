from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from fastapi.responses import StreamingResponse
from datetime import datetime
from urllib.parse import urlparse
import uvicorn
import json
import asyncio
import logging

from models.schemas import SearchRequest, SearchResponse, DocumentSearchResult
from services.query_analyzer import QueryAnalyzer
from services.search_orchestrator import SearchOrchestrator
from services.tavily_service import TavilyService
from config.settings import settings
from logger_config import setup_logger
from services.groq_service import GroqService

from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form
from models.schemas import DocumentUploadResponse, DocumentSearchRequest
from services.document.document_processor import DocumentProcessor
from services.document.document_store import DocumentStore
import uuid

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
            
            # ✅ CRITICAL: Check documents FIRST
            has_docs = False
            if session_id:
                has_docs = document_store.has_documents(session_id)
                logger.info(f"📋 Session {session_id} has documents: {has_docs}")
            
            # ✅ DOCUMENT SEARCH PATH
            if has_docs and session_id:
                logger.info("📄 Using DOCUMENT SEARCH path")
                
                # Search documents
                doc_results = document_store.search_documents(
                    query=message,
                    session_id=session_id,
                    max_results=5
                )
                
                logger.info(f"🔍 Found {len(doc_results)} document chunks")
                
                if doc_results:
                    # Show search phase
                    yield f"data: {json.dumps({'type': 'search_start', 'query': message})}\n\n"
                    await asyncio.sleep(0.3)
                    
                    # Show original query
                    yield f"data: {json.dumps({'type': 'query_generated', 'query': message, 'query_type': 'original'})}\n\n"
                    await asyncio.sleep(0.4)
                    
                    # Show reading sources phase
                    yield f"data: {json.dumps({'type': 'reading_start'})}\n\n"
                    await asyncio.sleep(0.3)
                    
                    # Show document sources
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
                            await asyncio.sleep(0.4)
                        except Exception as e:
                            logger.warning(f"Error processing document source: {e}")
                            continue
                    
                    # Build context and generate response
                    doc_context = ""
                    for i, result in enumerate(doc_results, 1):
                        doc_context += f"\n[Source {i} - {result['metadata']['filename']}, Page {result['metadata']['page_number']}]:\n"
                        doc_context += f"{result['content']}\n"
                    
                    document_prompt = f"""You are an expert assistant. Answer the user's question using ONLY the document content provided below.

IMPORTANT INSTRUCTIONS:
- Base your answer strictly on the provided document excerpts
- Do NOT use external knowledge or make assumptions  
- Include citations like [Source 1, Page X] when referencing content
- If the document doesn't contain enough information, say so clearly
- Provide a comprehensive, well-structured answer

DOCUMENT EXCERPTS:
{doc_context}

USER QUESTION: {message}

Provide a comprehensive answer based strictly on the document content above."""
                    
                    # Generate response
                    logger.info("📝 Generating response from documents...")
                    
                    yield f"data: {json.dumps({'type': 'writing_start'})}\n\n"
                    await asyncio.sleep(0.3)
                    
                    try:
                        response = await groq_service.client.chat.completions.create(
                            model="openai/gpt-oss-120b",
                            messages=[
                                {"role": "system", "content": "You are a precise document analysis assistant. Answer questions using only the provided document content. Always cite sources clearly with [Source X, Page Y] format."},
                                {"role": "user", "content": document_prompt}
                            ],
                            temperature=0.1,
                            max_tokens=1500
                        )
                        
                        if response.choices and response.choices[0].message.content:
                            response_text = response.choices[0].message.content
                            
                            # Stream response
                            sentences = response_text.split('. ')
                            for i, sentence in enumerate(sentences):
                                if sentence.strip():
                                    chunk = sentence + ('. ' if i < len(sentences) - 1 else '')
                                    yield f"data: {json.dumps({'type': 'content', 'content': chunk})}\n\n"
                                    await asyncio.sleep(0.1)
                        else:
                            yield f"data: {json.dumps({'type': 'content', 'content': 'Could not generate response from documents.'})}\n\n"
                            
                    except Exception as e:
                        logger.error(f"❌ Document response generation failed: {e}")
                        yield f"data: {json.dumps({'type': 'content', 'content': f'Error: {str(e)}'})}\n\n"
                    
                    yield f"data: {json.dumps({'type': 'end'})}\n\n"
                    return  # ✅ CRITICAL: Exit here to prevent web search
            
            # ✅ WEB SEARCH FALLBACK (your existing code)
            logger.info("🌐 Using WEB SEARCH path")
            
            # ... rest of your existing web search code ...
            # (Keep your existing web search implementation)
            
        except Exception as e:
            logger.error(f"Stream error: {e}")
            yield f"data: {json.dumps({'type': 'search_error', 'error': str(e)})}\n\n"
            yield f"data: {json.dumps({'type': 'end'})}\n\n"
    
    return StreamingResponse(generate_stream(), media_type="text/event-stream")

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


@app.post("/documents/search")
async def search_documents(request: DocumentSearchRequest):
    """Search within uploaded documents"""
    try:
        results = document_store.search_documents(
            query=request.query,
            session_id=request.session_id,
            max_results=request.max_results
        )
        
        # Format results with CORRECT model
        formatted_results = []
        for result in results:
            formatted_results.append(DocumentSearchResult(  # ✅ FIXED!
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

@app.get("/debug/document-chunks/{session_id}")
async def debug_document_chunks(session_id: str, query: str):
    """Debug endpoint to see raw document chunks"""
    results = document_store.search_documents(
        query=query,
        session_id=session_id,
        max_results=5
    )
    
    return {
        "query": query,
        "raw_chunks": [
            {
                "content": result["content"][:200] + "...",
                "page": result["metadata"]["page_number"],
                "similarity": result["similarity_score"],
                "filename": result["metadata"]["filename"]
            }
            for result in results
        ]
    }
@app.get("/debug/sessions")
async def debug_all_sessions():
    """List all sessions and their documents"""
    all_sessions = document_store.session_documents
    return {
        "total_sessions": len(all_sessions),
        "sessions": {
            session_id: {
                "document_count": len(docs),
                "documents": [doc.get("filename", "unknown") for doc in docs]
            }
            for session_id, docs in all_sessions.items()
        }
    }


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
            "groq": "connected",  # Add actual health checks later
            "tavily": "connected"
        },
        "timestamp": datetime.now().isoformat()
    }

# Add a test endpoint to verify Tavily connection
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

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        port=8000,
        reload=settings.debug,
        log_level="info"
    )