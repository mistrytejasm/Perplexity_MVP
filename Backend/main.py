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

from models.schemas import SearchRequest, SearchResponse
from services.query_analyzer import QueryAnalyzer
from services.search_orchestrator import SearchOrchestrator
from services.tavily_service import TavilyService
from config.settings import settings
from logger_config import setup_logger

setup_logger()
logger = logging.getLogger(__name__)

# Initialize services
query_analyzer = QueryAnalyzer()
search_orchestrator = SearchOrchestrator()

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
async def chat_stream(message: str, checkpoint_id: str = None):
    async def generate_stream():
        try:
            # Send search start event
            search_start_data = {'type': 'search_start', 'query': message}
            yield f"data: {json.dumps(search_start_data)}\n\n"
            await asyncio.sleep(0.2)
            
            # STEP 1: Progressive Query Analysis
            logger.info("Starting query analysis...")
            request = SearchRequest(query=message)
            
            # Analyze query to get sub-queries
            analysis = await search_orchestrator.query_analyzer.process_query(request)
            
            # Send original query first
            original_query_data = {
                'type': 'query_generated',
                'query': message,
                'query_type': 'original'
            }
            yield f"data: {json.dumps(original_query_data)}\n\n"
            await asyncio.sleep(0.3)
            
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
            
            # STEP 2: Progressive Web Search
            logger.info("Starting web searches...")
            
            # Transition to "Reading sources" phase
            reading_start_data = {'type': 'reading_start'}
            yield f"data: {json.dumps(reading_start_data)}\n\n"
            await asyncio.sleep(0.2)
            
            # Execute searches and send sources progressively
            search_terms = [message] + analysis.suggested_searches
            max_searches = min(len(search_terms), 4)
            search_terms = search_terms[:max_searches]
            
            all_results = []
            
            # Process each search term and send sources as they come
            for i, search_term in enumerate(search_terms):
                logger.info(f"Searching for: {search_term}")
                
                # Execute single search
                search_results = await search_orchestrator.tavily_service._single_search(search_term, 2)
                
                if search_results.get('results'):
                    for result in search_results['results']:
                        try:
                            parsed_url = urlparse(result['url'])
                            domain = parsed_url.netloc.replace('www.', '')
                            
                            # Send each source immediately as it's found
                            source_data = {
                                'type': 'source_found',
                                'source': {
                                    'url': result['url'],
                                    'domain': domain,
                                    'title': result['title'],
                                    'score': result.get('score', 0.8)
                                }
                            }
                            yield f"data: {json.dumps(source_data)}\n\n"
                            await asyncio.sleep(0.3)  # Delay between each source
                            
                            all_results.append(result)
                        except Exception as e:
                            logger.warning(f"Error processing source: {e}")
                            continue
            
            # STEP 3: Generate Response
            logger.info("Starting response generation...")
            
            # Send writing phase start
            writing_start_data = {'type': 'writing_start'}
            yield f"data: {json.dumps(writing_start_data)}\n\n"
            await asyncio.sleep(0.3)
            
            # Convert results to proper format for synthesis
            search_results_obj = []
            for result in all_results[:8]:  # Limit to top 8
                try:
                    from models.schemas import SearchResult
                    search_result = SearchResult(
                        title=result.get('title', 'No title'),
                        url=result.get('url', ''),
                        content=result.get('content', ''),
                        score=result.get('score', 0.0),
                        calculated_score=result.get('calculated_score'),
                        published_date=result.get('published_date')
                    )
                    search_results_obj.append(search_result)
                except Exception as e:
                    logger.warning(f"Failed to parse result: {e}")
                    continue
            
            # Create web results object
            from models.schemas import WebSearchResults
            web_results = WebSearchResults(
                total_results=len(search_results_obj),
                search_terms_used=search_terms,
                results=search_results_obj,
                search_duration=2.0
            )
            
            # Synthesize response
            synthesized_response = await search_orchestrator.content_synthesizer.synthesize_response(
                query=message,
                analysis=analysis,
                web_results=web_results
            )
            
            # Stream the content
            if synthesized_response and synthesized_response.response:
                response_text = synthesized_response.response
                sentences = response_text.split('. ')
                
                for i, sentence in enumerate(sentences):
                    if sentence.strip():
                        chunk = sentence + ('. ' if i < len(sentences) - 1 else '')
                        content_data = {'type': 'content', 'content': chunk}
                        yield f"data: {json.dumps(content_data)}\n\n"
                        await asyncio.sleep(0.15)
            
            # Send end event
            end_data = {'type': 'end'}
            yield f"data: {json.dumps(end_data)}\n\n"
            
        except Exception as e:
            logger.error(f"Stream error: {e}")
            error_data = {'type': 'search_error', 'error': f'Search failed: {str(e)}'}
            yield f"data: {json.dumps(error_data)}\n\n"
            end_data = {'type': 'end'}
            yield f"data: {json.dumps(end_data)}\n\n"
    
    return StreamingResponse(
        generate_stream(), 
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive", 
            "Access-Control-Allow-Origin": "*",
        }
    )

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

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        port=8000,
        reload=settings.debug,
        log_level="info"
    )