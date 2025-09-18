import time
import uuid
from typing import Dict, Any
from .upload_handler import DocumentUploadHandler
from .content_extractor import DocumentContentExtractor
from .chunking_service import DocumentChunkingService
from .document_store import DocumentStore
import logging

logger = logging.getLogger(__name__)

class DocumentProcessor:
    def __init__(self):
        self.upload_handler = DocumentUploadHandler()
        self.content_extractor = DocumentContentExtractor()
        self.chunking_service = DocumentChunkingService()
        self.document_store = DocumentStore()
    
    async def process_upload(self, file, session_id: str = None) -> Dict[str, Any]:
        """Complete document processing pipeline"""
        
        start_time = time.time()
        document_id = str(uuid.uuid4())
        
        try:
            logger.info(f"Starting document processing: {file.filename}")
            
            # Step 1: Validate and save file
            file_path, file_id, file_hash = await self.upload_handler.validate_and_save_file(file)
            file_info = self.upload_handler.get_file_info(file_path)
            
            # Step 2: Extract content
            logger.info("Extracting content...")
            extracted_content = self.content_extractor.extract_from_pdf(file_path)
            
            # Step 3: Chunk document
            logger.info("Chunking document...")
            chunks = self.chunking_service.chunk_document(
                text=extracted_content.text,
                document_id=document_id
            )
            
            if not chunks:
                raise Exception("No chunks generated from document")
            
            # Step 4: Store chunks and embeddings
            logger.info("Storing chunks and generating embeddings...")
            document_metadata = {
                "document_id": document_id,
                "filename": file.filename,
                "session_id": session_id,
                "file_path": file_path,
                "file_hash": file_hash,
                "total_pages": extracted_content.total_pages,
                "extraction_method": extracted_content.extraction_method
            }
            
            stored_chunks = self.document_store.store_document_chunks(chunks, document_metadata)
            
            # Step 5: Add to session tracking
            if session_id:
                document_info = {
                    "filename": file.filename,
                    "upload_time": time.strftime("%Y-%m-%d %H:%M:%S"),
                    "total_chunks": stored_chunks,
                    "total_pages": extracted_content.total_pages,
                    "file_size": file_info.get("size", 0),
                    "extraction_method": extracted_content.extraction_method
                }
                self.document_store.add_document_to_session(session_id, document_id, document_info)
            
            processing_time = time.time() - start_time
            
            logger.info(f"Document processing completed in {processing_time:.2f}s")
            
            return {
                "document_id": document_id,
                "filename": file.filename,
                "status": "completed",
                "total_chunks": stored_chunks,
                "total_pages": extracted_content.total_pages,
                "processing_time": processing_time,
                "extraction_method": extracted_content.extraction_method,
                "message": f"Successfully processed {file.filename} into {stored_chunks} chunks"
            }
            
        except Exception as e:
            processing_time = time.time() - start_time
            error_msg = f"Document processing failed: {str(e)}"
            logger.error(error_msg)
            
            return {
                "document_id": document_id,
                "filename": file.filename,
                "status": "failed",
                "processing_time": processing_time,
                "message": error_msg
            }
