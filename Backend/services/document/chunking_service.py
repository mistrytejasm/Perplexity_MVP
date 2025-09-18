import tiktoken
import re
from typing import List
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)

@dataclass
class DocumentChunk:
    chunk_id: str
    document_id: str
    content: str
    page_number: int
    chunk_index: int
    token_count: int

class DocumentChunkingService:
    def __init__(self):
        self.tokenizer = tiktoken.get_encoding("cl100k_base")
        self.max_chunk_size = 1000  # tokens
        self.overlap_size = 200    # tokens
        self.min_chunk_size = 200  # tokens
    
    def chunk_document(self, text: str, document_id: str) -> List[DocumentChunk]:
        """Split document text into semantic chunks"""
        
        logger.info(f"Chunking document {document_id}")
        
        # Split text by pages first
        pages = self._split_by_pages(text)
        all_chunks = []
        
        for page_num, page_text in enumerate(pages, 1):
            if not page_text.strip():
                continue
                
            page_chunks = self._chunk_page_text(
                text=page_text,
                page_number=page_num,
                document_id=document_id,
                start_index=len(all_chunks)
            )
            all_chunks.extend(page_chunks)
        
        logger.info(f"Document {document_id} split into {len(all_chunks)} chunks")
        return all_chunks
    
    def _split_by_pages(self, text: str) -> List[str]:
        """Split text by page markers"""
        
        # Look for page markers like "--- Page 1 ---"
        page_pattern = r'\n--- Page \d+ ---\n'
        pages = re.split(page_pattern, text)
        
        # Remove empty first element if exists
        if pages and not pages[0].strip():
            pages = pages[1:]
        
        # If no page markers found, treat as single page
        if len(pages) <= 1:
            return [text]
        
        return pages
    
    def _chunk_page_text(self, text: str, page_number: int, document_id: str, start_index: int) -> List[DocumentChunk]:
        """Chunk text from a single page"""
        
        chunks = []
        
        # Split by paragraphs
        paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
        
        current_chunk = ""
        current_tokens = 0
        
        for paragraph in paragraphs:
            paragraph_tokens = len(self.tokenizer.encode(paragraph))
            
            # If adding this paragraph exceeds max size
            if current_tokens + paragraph_tokens > self.max_chunk_size:
                if current_tokens > self.min_chunk_size:
                    # Save current chunk
                    chunk = DocumentChunk(
                        chunk_id=f"{document_id}_chunk_{start_index + len(chunks)}",
                        document_id=document_id,
                        content=current_chunk.strip(),
                        page_number=page_number,
                        chunk_index=start_index + len(chunks),
                        token_count=current_tokens
                    )
                    chunks.append(chunk)
                    
                    # Start new chunk with overlap
                    overlap_text = self._get_overlap_text(current_chunk)
                    current_chunk = overlap_text + "\n\n" + paragraph if overlap_text else paragraph
                    current_tokens = len(self.tokenizer.encode(current_chunk))
                else:
                    # Current chunk too small, add paragraph
                    current_chunk += "\n\n" + paragraph if current_chunk else paragraph
                    current_tokens += paragraph_tokens
            else:
                # Add paragraph to current chunk
                current_chunk += "\n\n" + paragraph if current_chunk else paragraph
                current_tokens += paragraph_tokens
        
        # Add final chunk if it meets minimum size
        if current_tokens > self.min_chunk_size:
            chunk = DocumentChunk(
                chunk_id=f"{document_id}_chunk_{start_index + len(chunks)}",
                document_id=document_id,
                content=current_chunk.strip(),
                page_number=page_number,
                chunk_index=start_index + len(chunks),
                token_count=current_tokens
            )
            chunks.append(chunk)
        
        return chunks
    
    def _get_overlap_text(self, text: str) -> str:
        """Get overlap text for context preservation"""
        
        sentences = text.split('. ')
        
        if len(sentences) >= 2:
            overlap = '. '.join(sentences[-2:])
        elif sentences:
            overlap = sentences[-1]
        else:
            overlap = ""
        
        # Limit overlap size
        overlap_tokens = len(self.tokenizer.encode(overlap))
        if overlap_tokens > self.overlap_size:
            # Truncate to fit overlap size
            words = overlap.split()
            while len(self.tokenizer.encode(' '.join(words))) > self.overlap_size and words:
                words.pop(0)
            overlap = ' '.join(words)
        
        return overlap
