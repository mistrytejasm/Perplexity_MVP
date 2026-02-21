import React from 'react';

const CitationRenderer = ({ content, sources = [] }) => {
  // Function to parse and render citations
  const renderContentWithCitations = (text) => {
    if (!text || !sources.length) return text;

    // Enhanced regex to match both [number](url) and [number] patterns
    const citationRegex = /\[(\d+)\](?:\(([^)]+)\))?/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = citationRegex.exec(text)) !== null) {
      const [fullMatch, citationNumber, url] = match;
      const startIndex = match.index;

      // Add text before citation
      if (startIndex > lastIndex) {
        parts.push(text.slice(lastIndex, startIndex));
      }

      // Find the source for this citation
      const source = sources.find(s => s.id === parseInt(citationNumber));
      
      if (source || url) {
        const citationUrl = url || source?.url || '#';
        const citationTitle = source?.title || source?.domain || 'Source';
        
        parts.push(
          <a
            key={`citation-${citationNumber}-${startIndex}`}
            href={citationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="citation-link"
            title={citationTitle}
            onClick={(e) => handleCitationClick(e, citationNumber, source)}
          >
            [{citationNumber}]
          </a>
        );
      } else {
        // Fallback for citations without sources
        parts.push(
          <span key={`citation-${citationNumber}-${startIndex}`} className="citation-plain">
            [{citationNumber}]
          </span>
        );
      }

      lastIndex = citationRegex.lastIndex;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  // Handle citation click events
  const handleCitationClick = (e, citationNumber, source) => {
    // Analytics or custom handling
    console.log(`Citation ${citationNumber} clicked:`, source);
    
    // You can add custom logic here like:
    // - Opening in a modal
    // - Tracking analytics
    // - Custom navigation
  };

  return (
    <div className="content-with-citations">
      {renderContentWithCitations(content)}
    </div>
  );
};

export default CitationRenderer;
