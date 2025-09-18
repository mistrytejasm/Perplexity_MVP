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
                logger.info(f"Loaded {len(sessions)} sessions from persistent storage")
                return sessions
        except Exception as e:
            logger.warning(f"Could not load sessions: {e}")
        
        return {}
    
    def _save_sessions(self):
        """Save session documents to file"""
        try:
            os.makedirs(os.path.dirname(self.session_file), exist_ok=True)
            with open(self.session_file, 'wb') as f:
                pickle.dump(self.session_documents, f)
            logger.info("Sessions saved to persistent storage")
        except Exception as e:
            logger.error(f"Could not save sessions: {e}")
    
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
    
    def search_documents(self, query: str, session_id: str, max_results: int = 5) -> List[Dict[str, Any]]:
        """Search for similar document chunks"""
        
        logger.info(f"Searching documents for session {session_id}: '{query[:50]}...'")
        
        # Generate query embedding
        query_embedding = self.embedding_model.encode([query]).tolist()
        
        # Search ChromaDB
        results = self.collection.query(
            query_embeddings=query_embedding,
            n_results=max_results,
            where={"session_id": session_id} if session_id else None
        )
        
        # Format results
        search_results = []
        for i in range(len(results['documents'][0])):
            result = {
                "content": results['documents'][0][i],
                "metadata": results['metadatas'][0][i],
                "similarity_score": 1 - results['distances'][0][i] if results['distances'][0] else 0.0,
                "chunk_id": results['ids'][0][i]
            }
            search_results.append(result)
        
        logger.info(f"Found {len(search_results)} relevant chunks")
        return search_results
    
    def add_document_to_session(self, session_id: str, document_id: str, document_info: Dict[str, Any]):
        """Track document for a session - NOW PERSISTENT"""
        if session_id not in self.session_documents:
            self.session_documents[session_id] = []
        
        document_info["document_id"] = document_id
        self.session_documents[session_id].append(document_info)
        
        # ✅ SAVE TO PERSISTENT STORAGE
        self._save_sessions()
        
        logger.info(f"Added document {document_id} to session {session_id} (persistent)")
    
    def get_session_documents(self, session_id: str) -> List[Dict[str, Any]]:
        """Get all documents for a session"""
        documents = self.session_documents.get(session_id, [])
        
        logger.info(f"Getting documents for session {session_id}: found {len(documents)} documents")
        return documents
    
    def has_documents(self, session_id: str) -> bool:
        """Check if session has any documents"""
        has_docs = session_id in self.session_documents and len(self.session_documents[session_id]) > 0
        logger.info(f"Session {session_id} has documents: {has_docs}")
        return has_docs
