import chromadb
from sentence_transformers import SentenceTransformer
from typing import List, Dict, Any
import json
import logging
import time
import os
import pickle

logger = logging.getLogger(__name__)

class DocumentStore:
    def __init__(self):
        # Initialize ChromaDB client
        self.chroma_client = chromadb.PersistentClient(path="./chroma_db")
        
        # Initialize embedding model
        self.embedding_model = SentenceTransformer('all-mpnet-base-v2')
        
        # Get or create collection
        self.collection = self.chroma_client.get_or_create_collection(
            name="document_chunks",
            metadata={"description": "Document chunks for semantic search"}
        )
        
        # ✅ PERSISTENT session tracking using file storage
        self.session_file = "chroma_db/session_documents.pkl"
        self.session_documents = self._load_sessions()
        
        logger.info("DocumentStore initialized with ChromaDB and persistent sessions")
    
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
            logger.info(f"💾 Sessions saved to persistent storage: {len(self.session_documents)} sessions")
            logger.info(f"💾 Session IDs: {list(self.session_documents.keys())}")
        except Exception as e:
            logger.error(f"❌ Could not save sessions: {e}")

    
    def store_document_chunks(self, chunks: List[Any], document_metadata: Dict[str, Any]) -> int:
        """Store document chunks with embeddings in ChromaDB"""
        
        logger.info(f"Storing {len(chunks)} chunks for document {document_metadata.get('document_id')}")
        
        # Prepare data for ChromaDB
        chunk_texts = [chunk.content for chunk in chunks]
        chunk_ids = [chunk.chunk_id for chunk in chunks]
        
        # Generate embeddings
        logger.info("Generating embeddings...")
        start_time = time.time()
        embeddings = self.embedding_model.encode(chunk_texts).tolist()
        embedding_time = time.time() - start_time
        logger.info(f"Generated {len(embeddings)} embeddings in {embedding_time:.2f}s")
        
        # Prepare metadata for each chunk
        metadatas = []
        for chunk in chunks:
            metadata = {
                "document_id": chunk.document_id,
                "page_number": chunk.page_number,
                "chunk_index": chunk.chunk_index,
                "token_count": chunk.token_count,
                "filename": document_metadata.get("filename", "unknown"),
                "session_id": document_metadata.get("session_id", "")
            }
            metadatas.append(metadata)
        
        # Store in ChromaDB
        self.collection.add(
            embeddings=embeddings,
            documents=chunk_texts,
            metadatas=metadatas,
            ids=chunk_ids
        )
        
        logger.info(f"Successfully stored {len(chunks)} chunks in ChromaDB")
        return len(chunks)
    
    def search_documents(self, query: str, session_id: str, max_results: int = 10) -> List[Dict[str, Any]]:
        """Search for relevant documents in the session"""
        logger.info(f"Searching documents for session {session_id}: '{query[:50]}...'")
        
        if session_id not in self.session_documents:
            logger.warning(f"No documents found for session {session_id}")
            return []
        
        try:
            # 🔥 DEBUG: Test the embedding process
            logger.info(f"🔍 DEBUG - Query: '{query}'")
            
            # Generate query embedding
            query_embedding = self.embedding_model.encode([query])
            logger.info(f"🔍 DEBUG - Query embedding shape: {query_embedding.shape}")
            logger.info(f"🔍 DEBUG - Query embedding sample: {query_embedding[0][:5]}")  # First 5 values
            
            # Search ChromaDB
            results = self.collection.query(
                query_embeddings=query_embedding.tolist(),
                n_results=max_results,
                where={"session_id": session_id},
                include=["documents", "metadatas", "distances"]
            )
            
            logger.info(f"🔍 DEBUG - ChromaDB results count: {len(results['documents'][0])}")
            logger.info(f"🔍 DEBUG - ChromaDB distances: {results['distances'][0][:3]}")  # First 3 distances
            
            if not results['documents'][0]:
                logger.warning(f"No documents found in ChromaDB for session {session_id}")
                return []
            
            # Convert to standardized format
            doc_results = []
            for i, (doc, metadata, distance) in enumerate(zip(
                results['documents'][0],
                results['metadatas'][0], 
                results['distances'][0]
            )):
                # 🔥 DEBUG: Check individual results
                similarity_score = 1 - distance  # Convert distance to similarity
                logger.info(f"🔍 DEBUG - Result {i}: distance={distance:.3f}, similarity={similarity_score:.3f}")
                logger.info(f"🔍 DEBUG - Content preview: '{doc[:100]}...'")
                
                doc_results.append({
                    'content': doc,
                    'metadata': metadata,
                    'similarity_score': similarity_score,
                    'distance': distance
                })
            
            logger.info(f"Found {len(doc_results)} relevant chunks")
            return doc_results
            
        except Exception as e:
            logger.error(f"Error searching documents: {e}")
            return []

    
    def add_document_to_session(self, session_id: str, document_id: str, document_info: Dict[str, Any]):
        """Track document for a session - NOW PERSISTENT"""
        if session_id not in self.session_documents:
            self.session_documents[session_id] = []
            logger.info(f"📝 Created new session: {session_id}")
        
        document_info["document_id"] = document_id
        self.session_documents[session_id].append(document_info)
        
        # ✅ SAVE IMMEDIATELY AFTER ADDING
        self._save_sessions()
        
        logger.info(f"✅ Added document {document_id} to session {session_id}")
        logger.info(f"📊 Session now has {len(self.session_documents[session_id])} documents")

    def reload_sessions(self):
        """Reload sessions from persistent storage"""
        self.session_documents = self._load_sessions()
        logger.info(f"🔄 Reloaded sessions: {list(self.session_documents.keys())}")

    
    def get_session_documents(self, session_id: str) -> List[Dict[str, Any]]:
        """Get all documents for a session"""
        documents = self.session_documents.get(session_id, [])
        
        logger.info(f"Getting documents for session {session_id}: found {len(documents)} documents")
        return documents
    
    def has_documents(self, session_id: str) -> bool:
        """Check if session has any documents - SESSION TRACKING ONLY"""
        # 🔥 FIX: Only check session tracking (no ChromaDB queries)
        has_session_docs = session_id in self.session_documents and len(self.session_documents[session_id]) > 0
        
        logger.info(f"Session {session_id} has documents: {has_session_docs}")
        return has_session_docs

    
    def evaluate_document_relevance(self, query: str, session_id: str, relevance_threshold: float = 0.5) -> Dict[str, Any]:
        """
        Evaluate if documents are relevant enough to answer the query
        Returns relevance score and whether to use documents
        """
        logger.info(f"🎯 Evaluating document relevance for: '{query[:50]}...' (threshold: {relevance_threshold})")
        
        # 🔥 FIX: Reload sessions from disk before checking
        self.reload_sessions()
        
        # 🔥 DEBUG: Add extensive logging
        logger.info(f"🔍 DEBUG - Session ID: '{session_id}'")
        logger.info(f"🔍 DEBUG - Available sessions: {list(self.session_documents.keys())}")
        logger.info(f"🔍 DEBUG - Session exists in dict: {session_id in self.session_documents}")
        
        if session_id in self.session_documents:
            logger.info(f"🔍 DEBUG - Documents in session: {len(self.session_documents[session_id])}")
        
        # Check session tracking directly
        if not (session_id in self.session_documents and len(self.session_documents[session_id]) > 0):
            logger.error(f"❌ No documents found in session tracking!")
            return {
                "should_use_documents": False,
                "relevance_score": 0.0,
                "reason": "No documents found",
                "relevant_chunks": []
            }
        
        logger.info("✅ Documents found in session! Proceeding with search...")
        
        # Rest of the method stays the same...
        try:
            doc_results = self.search_documents(query, session_id, max_results=5)
            
            if not doc_results:
                return {
                    "should_use_documents": False,
                    "relevance_score": 0.0,
                    "reason": "No relevant chunks found",
                    "relevant_chunks": []
                }
            
            # Calculate similarity scores
            similarity_scores = [result.get("similarity_score", 0.0) for result in doc_results]
            avg_similarity = sum(similarity_scores) / len(similarity_scores)
            max_similarity = max(similarity_scores)
            
            # Decision logic
            should_use_docs = max_similarity >= relevance_threshold
            
            reason = "relevant_documents" if should_use_docs else "low_relevance"
            
            logger.info(f"📊 Document relevance analysis:")
            logger.info(f"   - Average similarity: {avg_similarity:.3f}")
            logger.info(f"   - Max similarity: {max_similarity:.3f}")
            logger.info(f"   - Threshold: {relevance_threshold}")
            logger.info(f"   - Decision: {'USE DOCUMENTS' if should_use_docs else 'SKIP TO WEB'}")
            
            return {
                "should_use_documents": should_use_docs,
                "relevance_score": max_similarity,
                "average_relevance": avg_similarity,
                "reason": reason,
                "relevant_chunks": doc_results if should_use_docs else []
            }
            
        except Exception as e:
            logger.error(f"❌ Error in relevance evaluation: {e}")
            return {
                "should_use_documents": False,
                "relevance_score": 0.0,
                "reason": "evaluation_error",
                "relevant_chunks": []
            }
        
    # Add this to your document_store.py for testing
    def test_search(self, session_id: str):
        """Test document search manually"""
        # Test with exact content from your document
        test_queries = [
            "Data Acquisition",
            "Feature Engineering", 
            "Natural Language Processing",
            "Text Cleaning"
        ]
        
        for query in test_queries:
            results = self.search_documents(query, session_id, max_results=3)
            print(f"\n🔍 Query: '{query}'")
            for i, result in enumerate(results):
                print(f"  Result {i}: similarity={result['similarity_score']:.3f}")
                print(f"  Content: {result['content'][:100]}...")

