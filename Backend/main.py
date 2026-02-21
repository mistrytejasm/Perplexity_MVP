import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from datetime import datetime
import uvicorn
import logging

from config.settings import settings
from logger_config import setup_logger

# Import routers
from api import chat, documents

# Setup logging
setup_logger()
logger = logging.getLogger(__name__)

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

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# Include Routers
app.include_router(chat.router)
app.include_router(documents.router)

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

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=False,
        log_level="info"
    )
