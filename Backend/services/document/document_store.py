import chromadb
from sentence_transformers import SentenceTransformer, CrossEncoder
from typing import List, Dict, Any
import json
import logging
import time
import os
import pickle

logger = logging.getLogger(__name__)

# ── Model Constants ───────────────────────────────────────────────────────────
# Upgraded from all-MiniLM-L6-v2 (22M params, 384d) to BAAI/bge-large-en-v1.5
# (335M params, 1024d) — massive boost in semantic depth & domain understanding.
EMBEDDING_MODEL_ID = "BAAI/bge-large-en-v1.5"

# Cross-encoder re-ranker: takes (query, chunk) pairs and produces a precise
# relevance score. Used in two-stage retrieval for much better accuracy.
RERANKER_MODEL_ID = "cross-encoder/ms-marco-MiniLM-L-6-v2"

# Two-stage retrieval parameters
RETRIEVAL_TOP_K = 20        # How many chunks to pull from ChromaDB (Stage 1)
RERANKER_FINAL_K = 5        # How many chunks to keep after re-ranking (Stage 2)
RERANKER_SCORE_THRESHOLD = -3.5   # Min reranker score to consider chunk relevant


class DocumentStore:
    def __init__(self):
        # Initialize ChromaDB client
        self.chroma_client = chromadb.PersistentClient(path="./chroma_db")

        # ── Stage 1: Dense Retrieval Embedding Model ─────────────────────────
        logger.info(f"Loading embedding model: {EMBEDDING_MODEL_ID}")
        self.embedding_model = SentenceTransformer(EMBEDDING_MODEL_ID)

        # ── Stage 2: Cross-Encoder Re-Ranker ─────────────────────────────────
        logger.info(f"Loading re-ranker model: {RERANKER_MODEL_ID}")
        self.reranker = CrossEncoder(RERANKER_MODEL_ID)

        # Get or create collection
        self.collection = self.chroma_client.get_or_create_collection(
            name="document_chunks_v2",   # v2 because embedding dim changed (1024)
            metadata={"description": "Document chunks with BGE-large embeddings"}
        )

        # Persistent session tracking
        self.session_file = "chroma_db/session_documents.pkl"
        self.session_documents = self._load_sessions()

        logger.info("DocumentStore v2 initialized — BGE-large + Cross-Encoder Re-Ranker")

    # ── Session Persistence ───────────────────────────────────────────────────

    def _load_sessions(self) -> Dict[str, List[Dict[str, Any]]]:
        """Load session documents from file"""
        try:
            if os.path.exists(self.session_file):
                with open(self.session_file, 'rb') as f:
                    sessions = pickle.load(f)
                logger.info(f"📂 Loaded {len(sessions)} sessions from persistent storage")
                return sessions
        except Exception as e:
            logger.error(f"❌ Could not load sessions: {e}")
        logger.info("📂 Starting with empty session storage")
        return {}

    def _save_sessions(self):
        """Save session documents to file"""
        try:
            os.makedirs(os.path.dirname(self.session_file), exist_ok=True)
            with open(self.session_file, 'wb') as f:
                pickle.dump(self.session_documents, f)
            logger.info(f"💾 Sessions saved: {len(self.session_documents)} sessions")
        except Exception as e:
            logger.error(f"❌ Could not save sessions: {e}")

    def reload_sessions(self):
        """Reload sessions from persistent storage"""
        self.session_documents = self._load_sessions()

    # ── Document Storage ──────────────────────────────────────────────────────

    def store_document_chunks(self, chunks: List[Any], document_metadata: Dict[str, Any]) -> int:
        """Store document chunks with BGE-large embeddings in ChromaDB"""
        logger.info(f"Storing {len(chunks)} chunks for document {document_metadata.get('document_id')}")

        chunk_texts = [chunk.content for chunk in chunks]
        chunk_ids = [chunk.chunk_id for chunk in chunks]

        # BGE models require a special query prefix for best retrieval accuracy.
        # For *passages* (documents being stored) no prefix is needed.
        logger.info("Generating BGE embeddings...")
        start_time = time.time()
        embeddings = self.embedding_model.encode(
            chunk_texts,
            normalize_embeddings=True,   # Important for cosine similarity
            show_progress_bar=False
        ).tolist()
        logger.info(f"Generated {len(embeddings)} embeddings in {time.time() - start_time:.2f}s")

        # Prepare metadata
        metadatas = []
        for chunk in chunks:
            metadatas.append({
                "document_id": chunk.document_id,
                "page_number": chunk.page_number,
                "chunk_index": chunk.chunk_index,
                "token_count": chunk.token_count,
                "filename": document_metadata.get("filename", "unknown"),
                "session_id": document_metadata.get("session_id", ""),
            })

        # Store in ChromaDB
        self.collection.add(
            embeddings=embeddings,
            documents=chunk_texts,
            metadatas=metadatas,
            ids=chunk_ids
        )

        logger.info(f"✅ Stored {len(chunks)} chunks in ChromaDB")
        return len(chunks)

    # ── Two-Stage Retrieval ───────────────────────────────────────────────────

    def search_documents(self, query: str, session_id: str, max_results: int = RERANKER_FINAL_K) -> List[Dict[str, Any]]:
        """
        Two-stage retrieval:
          Stage 1: Dense embedding search — retrieve top RETRIEVAL_TOP_K chunks.
          Stage 2: Cross-encoder re-ranking — score all candidates against the
                   query and return the best max_results chunks.
        """
        logger.info(f"🔍 Two-stage search for session {session_id}: '{query[:60]}'")

        if session_id not in self.session_documents:
            logger.warning(f"No documents found for session {session_id}")
            return []

        try:
            # ── Stage 1: Dense Retrieval ──────────────────────────────────────
            # BGE requires the "Represent this sentence for searching relevant passages:"
            # prefix for QUERY embeddings to maximise recall.
            query_for_embedding = f"Represent this sentence for searching relevant passages: {query}"
            query_embedding = self.embedding_model.encode(
                [query_for_embedding],
                normalize_embeddings=True
            )

            n_retrieve = min(RETRIEVAL_TOP_K, max_results * 4)   # Retrieve 4x final limit
            results = self.collection.query(
                query_embeddings=query_embedding.tolist(),
                n_results=n_retrieve,
                where={"session_id": session_id},
                include=["documents", "metadatas", "distances"]
            )

            candidates = results["documents"][0]
            if not candidates:
                logger.warning(f"No chunks found in ChromaDB for session {session_id}")
                return []

            logger.info(f"Stage 1: Retrieved {len(candidates)} candidate chunks from ChromaDB")

            # ── Stage 2: Cross-Encoder Re-Ranking ─────────────────────────────
            # Build (query, chunk) pairs for the cross-encoder
            pairs = [(query, doc) for doc in candidates]
            reranker_scores = self.reranker.predict(pairs)

            # Zip with metadata and sort by re-rank score descending
            ranked = sorted(
                zip(candidates, results["metadatas"][0], results["distances"][0], reranker_scores),
                key=lambda x: x[3],   # Sort by reranker score
                reverse=True
            )

            logger.info(f"Stage 2: Re-ranker top scores: {[round(float(r[3]), 2) for r in ranked[:5]]}")

            # Filter to only relevant chunks above the threshold, keeping top K
            final_results = []
            for doc, metadata, distance, rerank_score in ranked[:max_results]:
                similarity_score = 1 - distance
                final_results.append({
                    "content": doc,
                    "metadata": metadata,
                    "similarity_score": similarity_score,
                    "distance": distance,
                    "rerank_score": float(rerank_score),
                })

            logger.info(f"✅ Returning {len(final_results)} re-ranked chunks")
            return final_results

        except Exception as e:
            logger.error(f"Error in two-stage search: {e}")
            return []

    # ── Session Management ────────────────────────────────────────────────────

    def add_document_to_session(self, session_id: str, document_id: str, document_info: Dict[str, Any]):
        """Track document for a session — persisted immediately"""
        if session_id not in self.session_documents:
            self.session_documents[session_id] = []
            logger.info(f"📝 Created new session: {session_id}")

        document_info["document_id"] = document_id
        self.session_documents[session_id].append(document_info)
        self._save_sessions()

        logger.info(f"✅ Added document {document_id} to session {session_id}")
        logger.info(f"📊 Session now has {len(self.session_documents[session_id])} documents")

    def get_session_documents(self, session_id: str) -> List[Dict[str, Any]]:
        """Get all documents for a session"""
        documents = self.session_documents.get(session_id, [])
        logger.info(f"Getting documents for session {session_id}: {len(documents)} docs")
        return documents

    def has_documents(self, session_id: str) -> bool:
        """Check if session has any documents — always reloads from disk first."""
        self.reload_sessions()   # ← Critical: ensures we see docs added since last load
        return session_id in self.session_documents and len(self.session_documents[session_id]) > 0

    def get_document_preview(self, session_id: str, max_chunks: int = 8) -> List[Dict[str, Any]]:
        """
        Bypass semantic search and return the first N chunks from the beginning of
        the document. Used for document-summary queries where vector similarity is
        meaningless (e.g. "what is this document about?").

        Chunks are sorted by chunk_index so the LLM sees the document in reading order.
        """
        logger.info(f"📖 get_document_preview: fetching first {max_chunks} chunks for session {session_id}")

        try:
            results = self.collection.get(
                where={"session_id": session_id},
                include=["documents", "metadatas"]
            )

            if not results or not results["documents"]:
                logger.warning(f"⚠️ No chunks found in collection for session {session_id}")
                return []

            # Zip and sort by chunk_index (ascending) so we get the document's opening content
            docs = [
                {"content": doc, "metadata": meta}
                for doc, meta in zip(results["documents"], results["metadatas"])
            ]
            docs.sort(key=lambda x: x["metadata"].get("chunk_index", 0))

            preview = docs[:max_chunks]
            logger.info(f"✅ Returning {len(preview)} preview chunks (chunk_indices: "
                        f"{[d['metadata'].get('chunk_index', '?') for d in preview]})")
            return preview

        except Exception as e:
            logger.error(f"❌ Error in get_document_preview: {e}")
            return []

    # ── Agentic Relevance Evaluation ──────────────────────────────────────────

    def evaluate_document_relevance(self, query: str, session_id: str, relevance_threshold: float = 0.10) -> Dict[str, Any]:
        """
        Evaluate if documents are truly relevant to the query.

        Uses the re-ranker score as the primary signal of true relevance.
        If the best re-ranker score is below RERANKER_SCORE_THRESHOLD, the
        chunks are considered irrelevant and the caller should fall back to
        web search.
        """
        logger.info(f"🎯 Evaluating document relevance for: '{query[:60]}' (session: {session_id})")

        # Always re-read sessions from disk to catch race conditions
        self.reload_sessions()

        logger.info(f"Available sessions: {list(self.session_documents.keys())}")

        # No documents for this session
        if not (session_id in self.session_documents and len(self.session_documents[session_id]) > 0):
            logger.warning(f"❌ No documents in session {session_id}")
            return {
                "should_use_documents": False,
                "relevance_score": 0.0,
                "reason": "No documents found",
                "relevant_chunks": []
            }

        logger.info(f"✅ Session {session_id} has {len(self.session_documents[session_id])} documents")

        try:
            # Retrieve and re-rank
            doc_results = self.search_documents(query, session_id, max_results=RERANKER_FINAL_K)

            if not doc_results:
                return {
                    "should_use_documents": False,
                    "relevance_score": 0.0,
                    "reason": "No relevant chunks found",
                    "relevant_chunks": []
                }

            # Use the top re-ranker score as the relevance signal
            best_rerank_score = doc_results[0].get("rerank_score", -999)
            best_similarity = doc_results[0].get("similarity_score", 0.0)

            # Decision: use docs if the re-ranker thinks the best chunk is relevant
            is_relevant = best_rerank_score >= RERANKER_SCORE_THRESHOLD

            reason = "relevant_documents" if is_relevant else "low_reranker_score"

            logger.info(f"📊 Relevance evaluation:")
            logger.info(f"   Best re-ranker score : {best_rerank_score:.3f} (threshold {RERANKER_SCORE_THRESHOLD})")
            logger.info(f"   Best similarity      : {best_similarity:.3f}")
            logger.info(f"   Decision             : {'USE DOCUMENTS' if is_relevant else 'FALLBACK TO WEB'}")

            return {
                "should_use_documents": is_relevant,
                "relevance_score": best_similarity,
                "rerank_score": best_rerank_score,
                "reason": reason,
                "relevant_chunks": doc_results if is_relevant else []
            }

        except Exception as e:
            logger.error(f"❌ Error in relevance evaluation: {e}")
            return {
                "should_use_documents": False,
                "relevance_score": 0.0,
                "reason": "evaluation_error",
                "relevant_chunks": []
            }
