from services.query_analyzer import QueryAnalyzer
from services.tavily_service import TavilyService
from services.groq_service import GroqService
from core.conversation_store import ConversationStore
from services.document.document_processor import DocumentProcessor
from services.document.document_store import DocumentStore

query_analyzer = QueryAnalyzer()
tavily_service = TavilyService()
groq_service = GroqService()
conversation_store = ConversationStore(max_turns=5)

# ── Shared DocumentStore singleton ────────────────────────────────────────────
# IMPORTANT: Create DocumentStore FIRST, then inject it into DocumentProcessor.
# Both the upload path (document_processor) and the chat path (document_store)
# must share the SAME in-memory instance — otherwise sessions uploaded via
# document_processor are invisible to the chat endpoint's has_documents() call.
document_store = DocumentStore()
document_processor = DocumentProcessor(document_store=document_store)
