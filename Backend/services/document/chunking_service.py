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
    """
    Semantic-aware chunking service.

    Improvements over the original fixed-size splitter:
    - Respects natural semantic boundaries (section headers, paragraphs) instead
      of blindly counting tokens and hard-splitting on page markers.
    - Page numbers are tracked as approximations rather than hard splits, so
      cross-page sentences are never cut at the page boundary.
    - Maintains the proven 20 % overlap (200 / 1000 tokens) to avoid context
      loss between adjacent chunks.
    """

    def __init__(self):
        # Use cl100k_base to stay compatible with OpenAI/Groq token counts
        self.tokenizer = tiktoken.get_encoding("cl100k_base")
        self.max_chunk_tokens = 1000
        self.overlap_tokens = 200
        self.min_chunk_tokens = 150

        # Patterns for recognising semantic section boundaries
        self._HEADER_RE = re.compile(
            r'^(?:#{1,6} .+|[A-Z][A-Z\d\s,\-:]{3,60}:?\s*)$', re.MULTILINE
        )
        self._PAGE_MARKER_RE = re.compile(r'\n---\s*Page\s*\d+\s*---\n', re.IGNORECASE)

    # ── Public API ─────────────────────────────────────────────────────────────

    def chunk_document(self, text: str, document_id: str) -> List[DocumentChunk]:
        """
        Split a document into semantically coherent chunks.
        Strips page markers but preserves approximate page numbers as metadata.
        """
        logger.info(f"Chunking document '{document_id}' ({len(text)} chars)")

        # Build a list of (page_number, paragraph_text) tuples, honouring page
        # markers purely for metadata — no hard splits at page boundaries.
        page_paragraphs = self._extract_paragraphs_with_pages(text)

        all_chunks: List[DocumentChunk] = []
        current_content = ""
        current_tokens = 0
        current_page = 1

        for page_num, para in page_paragraphs:
            if para.strip():
                current_page = page_num

            para_tokens = self._count_tokens(para)

            # Paragraph alone is larger than the limit → split it further
            if para_tokens > self.max_chunk_tokens:
                if current_content:
                    all_chunks.append(self._make_chunk(document_id, current_content, current_page, len(all_chunks)))
                    current_content, current_tokens = "", 0

                for sub_chunk, sub_page in self._split_long_paragraph(para, page_num, document_id):
                    all_chunks.append(self._make_chunk(document_id, sub_chunk, sub_page, len(all_chunks)))
                continue

            # Adding this paragraph would exceed the limit
            if current_tokens + para_tokens > self.max_chunk_tokens:
                if current_tokens >= self.min_chunk_tokens:
                    all_chunks.append(self._make_chunk(document_id, current_content, current_page, len(all_chunks)))
                    current_content = self._overlap_text(current_content) + "\n\n" + para
                    current_tokens = self._count_tokens(current_content)
                else:
                    # Chunk is too small, keep accumulating
                    current_content += "\n\n" + para if current_content else para
                    current_tokens += para_tokens
            else:
                current_content += "\n\n" + para if current_content else para
                current_tokens += para_tokens

        # Flush remaining content
        if current_tokens >= self.min_chunk_tokens:
            all_chunks.append(self._make_chunk(document_id, current_content, current_page, len(all_chunks)))

        logger.info(f"Document '{document_id}' → {len(all_chunks)} semantic chunks")
        return all_chunks

    # ── Private Helpers ────────────────────────────────────────────────────────

    def _extract_paragraphs_with_pages(self, text: str) -> List[tuple]:
        """
        Strip page markers and return (page_number, paragraph_text) tuples.
        Paragraphs are separated by blank lines or section headers.
        """
        # Replace page markers with a special tag so we can track page numbers
        page_tagged = self._PAGE_MARKER_RE.sub(lambda m: "\n__PAGE__\n", text)

        current_page = 1
        result = []
        for block in page_tagged.split("\n\n"):
            block = block.strip()
            if not block:
                continue
            if block == "__PAGE__":
                current_page += 1
                continue
            # If the block contains inline page markers, count them
            tags = block.count("__PAGE__")
            block_clean = block.replace("__PAGE__", "").strip()
            if block_clean:
                result.append((current_page, block_clean))
            current_page += tags

        return result

    def _split_long_paragraph(self, text: str, page_num: int, document_id: str):
        """Split a single oversized paragraph on sentence boundaries."""
        sentences = re.split(r'(?<=[.!?])\s+', text)
        current = ""
        current_tokens = 0

        for sent in sentences:
            sent_tokens = self._count_tokens(sent)
            if current_tokens + sent_tokens > self.max_chunk_tokens and current:
                yield current.strip(), page_num
                current = self._overlap_text(current) + " " + sent
                current_tokens = self._count_tokens(current)
            else:
                current += " " + sent if current else sent
                current_tokens += sent_tokens

        if self._count_tokens(current) >= self.min_chunk_tokens:
            yield current.strip(), page_num

    def _overlap_text(self, text: str) -> str:
        """Return the last ~overlap_tokens worth of text for context preservation."""
        sentences = re.split(r'(?<=[.!?])\s+', text)
        overlap = ""
        for sent in reversed(sentences):
            candidate = sent + " " + overlap if overlap else sent
            if self._count_tokens(candidate) > self.overlap_tokens:
                break
            overlap = candidate
        return overlap.strip()

    def _make_chunk(self, document_id: str, content: str, page_number: int, index: int) -> DocumentChunk:
        content = content.strip()
        return DocumentChunk(
            chunk_id=f"{document_id}_chunk_{index}",
            document_id=document_id,
            content=content,
            page_number=page_number,
            chunk_index=index,
            token_count=self._count_tokens(content),
        )

    def _count_tokens(self, text: str) -> int:
        return len(self.tokenizer.encode(text))
