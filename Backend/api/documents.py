import logging
import uuid
import os
from fastapi import APIRouter, HTTPException, UploadFile, File, Form

from models.schemas import (
    DocumentUploadResponse, DocumentSearchRequest, DocumentSearchResult
)
from core.dependencies import document_processor, document_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])

@router.post("/upload", response_model=DocumentUploadResponse)
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

@router.get("/session/{session_id}")
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
    
@router.get("/debug/session/{session_id}")
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

@router.post("/search")
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

@router.delete("/{document_id}")
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
