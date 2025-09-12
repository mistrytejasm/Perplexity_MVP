import spacy
import re
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)

class SmartCitationProcessor:
    def __init__(self):
        """Initialize NLP models for semantic understanding"""
        try:
            self.nlp = spacy.load("en_core_web_sm")
        except OSError:
            logger.warning("Spacy model not found, falling back to basic processing")
            self.nlp = None
            
        try:
            self.sentence_model = SentenceTransformer('all-MiniLM-L6-v2')
        except Exception as e:
            logger.warning(f"Sentence transformer not available: {e}")
            self.sentence_model = None
    
    def process_citations(self, content: str, sources: List[Dict[str, Any]]) -> str:
        """Create ONLY clickable citations in markdown format"""
        if not sources:
            return content
            
        # Clean any existing citations first
        content = re.sub(r'\[\d+\](?!\()', '', content)  # Remove [1] but keep [1](url)
        content = re.sub(r'\[\d+\]\[\d+\]', '', content)  # Remove [1][2] patterns
        content = re.sub(r'\s+', ' ', content)  # Clean extra spaces
            
        # Create source URL mapping
        source_urls = {str(source['id']): source['url'] for source in sources}
        
        # Split content into sentences
        sentences = re.split(r'(?<=[.!?])\s+', content)
        processed_sentences = []
        
        for sentence in sentences:
            if not sentence.strip():
                continue
                
            # Find relevant sources for this sentence
            relevant_source_ids = self._find_relevant_sources(sentence, sources)
            
            # Add ONLY clickable citations
            if relevant_source_ids:
                clickable_citations = []
                for sid in relevant_source_ids[:2]:  # Max 2 citations
                    source_url = source_urls.get(str(sid), '#')
                    # Create clickable markdown link: [1](url)
                    clickable_citations.append(f'[{sid}]({source_url})')
                
                citations = ''.join(clickable_citations)
                sentence = sentence.rstrip() + citations
            
            processed_sentences.append(sentence)
        
        return ' '.join(processed_sentences)


    def _find_relevant_sources(self, sentence: str, sources: List[Dict]) -> List[int]:
        """Find source IDs relevant to a sentence using multiple intelligence methods"""
        
        # Method 1: Semantic Similarity (most powerful)
        semantic_matches = self._semantic_matching(sentence, sources)
        
        # Method 2: Named Entity Matching  
        entity_matches = self._entity_matching(sentence, sources)
        
        # Method 3: Factual Content Detection
        if self._contains_factual_claim(sentence):
            # Combine all matches and score them
            all_matches = {}
            
            # Add semantic similarity scores
            for source_id, score in semantic_matches.items():
                all_matches[source_id] = all_matches.get(source_id, 0) + score * 0.6
            
            # Add entity matching scores
            for source_id, score in entity_matches.items():
                all_matches[source_id] = all_matches.get(source_id, 0) + score * 0.4
            
            # Sort by combined score
            sorted_matches = sorted(all_matches.items(), key=lambda x: x[1], reverse=True)
            
            # Return top source IDs above threshold
            relevant_source_ids = [
                source_id for source_id, score in sorted_matches 
                if score > 0.3  # Relevance threshold
            ][:2]  # Max 2 sources
            
            return relevant_source_ids
        
        return []
    
    def _semantic_matching(self, sentence: str, sources: List[Dict]) -> Dict[int, float]:
        """Use sentence embeddings to find semantically similar sources"""
        matches = {}
        
        if not self.sentence_model:
            return self._keyword_matching(sentence, sources)
            
        try:
            # Get sentence embedding
            sentence_embedding = self.sentence_model.encode([sentence])
            
            # Get source embeddings
            source_texts = []
            source_ids = []
            
            for source in sources:
                content = source.get('content', '')[:500]  # Limit content length
                if content.strip():
                    source_texts.append(content)
                    source_ids.append(source['id'])
            
            if not source_texts:
                return matches
                
            source_embeddings = self.sentence_model.encode(source_texts)
            
            # Calculate similarities
            similarities = cosine_similarity(sentence_embedding, source_embeddings)[0]
            
            # Create matches dict with source IDs as keys
            for i, similarity in enumerate(similarities):
                if similarity > 0.3:  # Similarity threshold
                    matches[source_ids[i]] = float(similarity)
                    
        except Exception as e:
            logger.warning(f"Semantic matching failed: {e}")
            return self._keyword_matching(sentence, sources)
            
        return matches
    
    def _entity_matching(self, sentence: str, sources: List[Dict]) -> Dict[int, float]:
        """Match named entities between sentence and sources"""
        matches = {}
        
        if not self.nlp:
            return self._keyword_matching(sentence, sources)
            
        try:
            # Extract entities from sentence
            doc = self.nlp(sentence)
            sentence_entities = {ent.text.lower().strip() for ent in doc.ents}
            
            if not sentence_entities:
                return matches
            
            # Check entity overlap with sources
            for source in sources:
                content = source.get('content', '')[:800]  # Limit for performance
                source_doc = self.nlp(content)
                source_entities = {ent.text.lower().strip() for ent in source_doc.ents}
                
                # Calculate entity overlap
                overlap = sentence_entities.intersection(source_entities)
                if overlap:
                    overlap_ratio = len(overlap) / len(sentence_entities)
                    if overlap_ratio > 0.2:  # At least 20% entity overlap
                        matches[source['id']] = overlap_ratio  # Use source ID as key
                        
        except Exception as e:
            logger.warning(f"Entity matching failed: {e}")
            return self._keyword_matching(sentence, sources)
            
        return matches
    
    def _keyword_matching(self, sentence: str, sources: List[Dict]) -> Dict[int, float]:
        """Fallback: Simple keyword-based matching"""
        matches = {}
        
        sentence_words = set(sentence.lower().split())
        
        for source in sources:
            content_words = set(source.get('content', '').lower().split())
            
            # Calculate word overlap
            overlap = sentence_words.intersection(content_words)
            if len(overlap) >= 3:  # At least 3 common words
                overlap_ratio = len(overlap) / len(sentence_words) if sentence_words else 0
                if overlap_ratio > 0.15:  # 15% word overlap threshold
                    matches[source['id']] = overlap_ratio  # Use source ID as key
                    
        return matches
    
    def _contains_factual_claim(self, sentence: str) -> bool:
        """Detect if sentence contains factual claims that need citations"""
        sentence_lower = sentence.lower()
        
        # Linguistic patterns that indicate factual claims
        factual_patterns = [
            r'\b\d+(%|percent|million|billion|thousand|hours|minutes|years|days)\b',
            r'\b(is|are|was|were|has|have|will|can|contains|includes|features)\b.*\b(the|a|an)\b',
            r'\b(more|less|better|worse|faster|slower|higher|lower|larger|smaller)\b.*\bthan\b',
            r'\b(according to|research shows|studies indicate|data reveals|announced|released)\b',
            r'\b\d+\s*(gb|mb|ghz|mhz|mp|pixels|inches|hours|minutes)\b',
            r'\b(in \d{4}|since \d{4}|by \d{4}|during|recently|latest|new)\b'
        ]
        
        # Check if sentence matches factual patterns
        for pattern in factual_patterns:
            if re.search(pattern, sentence_lower):
                return True
        
        # Additional heuristic: sentences with specific entities often need citations
        if self.nlp:
            try:
                doc = self.nlp(sentence)
                factual_entity_types = {'PERSON', 'ORG', 'MONEY', 'PERCENT', 'DATE', 'CARDINAL'}
                entity_types = {ent.label_ for ent in doc.ents}
                
                if factual_entity_types.intersection(entity_types):
                    return True
            except:
                pass
        
        return len(sentence.split()) > 5  # Only cite substantial sentences