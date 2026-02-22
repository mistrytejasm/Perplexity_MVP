from pydantic import BaseModel, Field, HttpUrl
from typing import List, Optional, Dict, Any
from enum import Enum
from datetime import datetime


class QueryType(str, Enum):
    FACTUAL = "factual"
    COMPARISON = "comparison"
    HOW_TO = "how_to"
    CURRENT_EVENTS = "current_events"
    OPINION = "opinion"
    CALCULATION = "calculation"


class AllowedModel(str, Enum):
    AUTO = "auto"
    GPT_OSS_120B = "openai/gpt-oss-120b"
    GPT_OSS_20B = "openai/gpt-oss-20b"
    LLAMA_70B = "llama-3.3-70b-versatile"
    LLAMA_8B = "llama-3.1-8b-instant"
    MIXTRAL = "mixtral-8x7b-32768"


# Human-readable display names for each model
MODEL_DISPLAY_NAMES: Dict[str, str] = {
    "auto": "Auto",
    "openai/gpt-oss-120b": "GPT-OSS 120B",
    "openai/gpt-oss-20b": "GPT-OSS 20B",
    "llama-3.3-70b-versatile": "Llama 3.3 70B",
    "llama-3.1-8b-instant": "Llama 3.1 8B",
    "mixtral-8x7b-32768": "Mixtral 8x7B",
}


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=500)
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    model: str = "auto"  # AllowedModel value or "auto"

class QueryIntent(str, Enum):
    """
    The fine-grained intent of a query when documents are present in the session.

    doc_summary  — User wants a general overview/summary of the uploaded document
                   (e.g. "what is this about", "summarise this pdf")
    doc_qa       — User asks a specific question and implicitly expects the answer
                   to come from the uploaded document first
    general_web  — User's question is clearly unrelated to any uploaded document
                   (e.g. "what is the capital of France", "who won the World Cup")
    """
    DOC_SUMMARY = "doc_summary"
    DOC_QA = "doc_qa"
    GENERAL_WEB = "general_web"


class QueryAnalysis(BaseModel):
    query_type: str
    search_intent: str
    key_entities: List[str]
    suggested_searches: List[str]
    complexity_score: int = Field(..., ge=1, le=10)
    requires_real_time: bool = False
    # Intent relative to uploaded documents (None when no docs are in the session)
    query_intent: Optional[str] = None

class SearchResult(BaseModel):
    title: str
    url: str
    content: str
    score: float
    calculated_score: Optional[float] = None
    published_date: Optional[str] = None

class WebSearchResults(BaseModel):
    total_results: int
    search_terms_used: List[str]
    results: List[SearchResult]
    search_duration: float  # in seconds

class SourceReference(BaseModel):
    id: int
    title: str
    url: str

class SynthesizedResponse(BaseModel):
    query: str
    response: str  # The main synthesized content
    sources_used: List[SourceReference]
    total_sources: int
    word_count: int
    citation_count: int
    synthesis_quality_score: float

class SearchResponse(BaseModel):
    original_query: str
    analysis: Optional[QueryAnalysis] = None
    web_results: Optional[WebSearchResults] = None
    synthesized_response: Optional[SynthesizedResponse] = None
    status: str = "analyzed"
    timestamp: str

class DocumentUploadRequest(BaseModel):
    session_id: Optional[str] = None

class DocumentUploadResponse(BaseModel):
    document_id: str
    filename: str
    status: str  # "completed" or "failed"
    message: str
    total_chunks: Optional[int] = None
    processing_time: Optional[float] = None

class SessionDocument(BaseModel):
    document_id: str
    filename: str
    upload_time: str
    total_chunks: int
    file_size: int

class DocumentSearchRequest(BaseModel):
    query: str
    session_id: str
    max_results: int = 5

class DocumentSearchResult(BaseModel):
    content: str
    page_number: int
    similarity_score: float
    document_filename: str
    document_id: str