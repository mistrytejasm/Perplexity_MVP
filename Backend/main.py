from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from datetime import datetime
import uvicorn
import logging

from models.schemas import SearchRequest, SearchResponse
from services.query_analyzer import QueryAnalyzer
from services.search_orchestrator import SearchOrchestrator
from services.tavily_service import TavilyService
from config.settings import settings
from logger_config import setup_logger

setup_logger()
# configure logging
logger = logging.getLogger(__name__)

# Initialize services
query_analyzer = QueryAnalyzer()

# Initialize orchestrator
search_orchestrator = SearchOrchestrator()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle"""
    logger.info("Perplexity MVP Starting Up. :)")
    yield
    logger.info("Perplexity MVP Shutting Down. :(")

# Create FastAPI app
app = FastAPI(
    title= settings.app_name,
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middelware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
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


