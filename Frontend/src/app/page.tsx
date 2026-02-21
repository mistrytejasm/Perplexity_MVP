"use client"
import InputBar from '@/components/InputBar';
import MessageArea from '@/components/MessageArea';
import React, { useState, useEffect } from 'react';
import DocumentList from '@/components/document/DocumentList';
import { FileText, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Simple session ID generator
const generateSessionId = () => 'session_' + Date.now();

interface SearchInfo {
  stages: string[];
  query: string;
  source: string;
  subQueries: string[];
  urls: string[];
  sources: string[];
  webSources: any[];
  documentSources: any[];
  error?: string;
}

interface Message {
  id: number;
  content: string;
  isUser: boolean;
  type: string;
  isLoading?: boolean;
  searchInfo?: SearchInfo;
}

const Home = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [checkpointId, setCheckpointId] = useState(null);
  const [hasStartedChat, setHasStartedChat] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [documents, setDocuments] = useState([]); // ← MISSING IN YOUR CODE
  const [showDocuments, setShowDocuments] = useState(false); // ← MISSING IN YOUR CODE
  const [selectedSource, setSelectedSource] = useState<any | null>(null);

  // Add this useEffect to debug document state changes
  useEffect(() => {
    console.log('🔍 DEBUG - Documents state changed:', {
      documentsCount: documents.length,
      documents: documents,
      sessionId: sessionId,
      hasStartedChat: hasStartedChat
    });
  }, [documents, sessionId, hasStartedChat]);

  // In your useEffect where you initialize session:
  useEffect(() => {
    // 🔥 ALWAYS create a new session to avoid document mixing
    const newSession = generateSessionId();
    setSessionId(newSession);
    localStorage.setItem('perplexity_session_id', newSession);

    console.log('🔍 DEBUG - Created new session:', newSession);
  }, []);


  // MISSING FROM YOUR CODE - This is critical!
  const loadDocuments = async () => {
    if (!sessionId) return;

    try {
      const response = await fetch(`http://localhost:8000/documents/session/${sessionId}`);
      const data = await response.json();
      setDocuments(data.documents || []);
    } catch (error) {
      console.error('Error loading documents:', error);
    }
  };


  // MISSING FROM YOUR CODE - This is critical!
  const handleRemoveDocument = async (documentId: string) => {
    try {
      await fetch(`http://localhost:8000/documents/${documentId}?session_id=${sessionId}`, {
        method: 'DELETE'
      });
      loadDocuments(); // Refresh document list
    } catch (error) {
      console.error('Error removing document:', error);
    }
  };

  // Initialize session and load documents
  useEffect(() => {
    const existingSession = localStorage.getItem('perplexity_session_id');
    if (existingSession) {
      setSessionId(existingSession);
    } else {
      const newSession = generateSessionId();
      setSessionId(newSession);
      localStorage.setItem('perplexity_session_id', newSession);
    }
  }, []);

  // MISSING FROM YOUR CODE - Load documents when sessionId changes
  useEffect(() => {
    if (sessionId) {
      loadDocuments();
    }
  }, [sessionId]);

  // Your existing mergeSearchInfo function...
  const mergeSearchInfo = (existing: SearchInfo | undefined, newData: any): SearchInfo => {
    const merged: SearchInfo = {
      stages: [...(existing?.stages || [])],
      query: existing?.query || "",
      source: existing?.source || "",
      subQueries: [...(existing?.subQueries || [])],
      urls: [...(existing?.urls || [])],
      sources: [...(existing?.sources || [])],
      webSources: [...(existing?.webSources || [])],
      documentSources: [...(existing?.documentSources || [])],
      error: existing?.error
    };

    if (newData.type && !merged.stages.includes(newData.type)) {
      if (newData.type === 'search_start') merged.stages.push('searching');
      if (newData.type === 'query_breakdown') merged.stages.push('searching');
      if (newData.type === 'search_results') merged.stages.push('reading');
      if (newData.type === 'end') merged.stages.push('writing');
      if (newData.type === 'search_error') merged.stages.push('error');
    }

    if (newData.query) merged.query = newData.query;
    if (newData.original_query) merged.query = newData.original_query;
    if (newData.source) merged.source = newData.source;

    if (newData.sub_queries) {
      newData.sub_queries.forEach((sq: string) => {
        if (!merged.subQueries.includes(sq)) {
          merged.subQueries.push(sq);
        }
      });
    }

    if (newData.web_sources) {
      newData.web_sources.forEach((ws: any) => {
        if (!merged.webSources.find(existing => existing.url === ws.url)) {
          merged.webSources.push(ws);
        }
      });
    }

    if (newData.document_sources) {
      newData.document_sources.forEach((ds: any) => {
        if (!merged.documentSources.find(existing => existing.filename === ds.filename)) {
          merged.documentSources.push(ds);
        }
      });
    }

    if (newData.urls) {
      const urlsArray = typeof newData.urls === 'string' ? JSON.parse(newData.urls) : newData.urls;
      urlsArray.forEach((url: string) => {
        if (!merged.urls.includes(url)) {
          merged.urls.push(url);
        }
      });

      urlsArray.forEach((url: string) => {
        const domain = url.split('//')[1]?.split('/')[0] || 'unknown';
        if (!merged.webSources.find(ws => ws.url === url)) {
          merged.webSources.push({ url, domain });
        }
      });
    }

    if (newData.sources) {
      newData.sources.forEach((source: string) => {
        if (!merged.sources.includes(source)) {
          merged.sources.push(source);
        }
      });

      newData.sources.forEach((source: string) => {
        if (!merged.documentSources.find(ds => ds.filename === source)) {
          merged.documentSources.push({ filename: source });
        }
      });
    }

    if (newData.error) merged.error = newData.error;

    return merged;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentMessage.trim()) {
      // Mark that chat has started
      if (!hasStartedChat) {
        setHasStartedChat(true);
        // CRITICAL FIX: Force reload documents when starting chat
        setTimeout(() => {
          console.log('🔍 DEBUG - Force loading documents on chat start');
          loadDocuments();
        }, 100);
      }

      // First add the user message to the chat
      const newMessageId = messages.length > 0 ? Math.max(...messages.map(msg => msg.id)) + 1 : 1;
      setMessages(prev => [
        ...prev,
        {
          id: newMessageId,
          content: currentMessage,
          isUser: true,
          type: 'message'
        }
      ]);

      const userInput = currentMessage;
      setCurrentMessage(""); // Clear input field immediately

      try {
        // Create AI response placeholder
        const aiResponseId = newMessageId + 1;
        setMessages(prev => [
          ...prev,
          {
            id: aiResponseId,
            content: "",
            isUser: false,
            type: 'message',
            isLoading: true,
            searchInfo: {
              stages: [],
              query: "",
              source: "",
              subQueries: [],
              urls: [],
              sources: [],
              webSources: [],
              documentSources: []
            }
          }
        ]);

        // HuggingFace backend URL
        let url = `http://localhost:8000/chat_stream?message=${encodeURIComponent(userInput)}&session_id=${sessionId}`;
        if (checkpointId) url += `&checkpoint_id=${encodeURIComponent(checkpointId)}`;

        const eventSource = new EventSource(url);
        let streamedContent = "";

        // ... Your existing EventSource handling code stays exactly the same

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'checkpoint') {
              setCheckpointId(data.checkpoint_id);
            }
            else if (data.type === 'search_start') {
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === aiResponseId
                    ? {
                      ...msg,
                      searchInfo: {
                        stages: ['searching'],
                        query: data.query,
                        source: 'controlled',
                        subQueries: [],
                        urls: [],
                        sources: [],
                        webSources: [],
                        documentSources: []
                      }
                    }
                    : msg
                )
              );
            }
            else if (data.type === 'query_generated') {
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === aiResponseId
                    ? {
                      ...msg,
                      searchInfo: {
                        ...msg.searchInfo!,
                        stages: ['searching'],
                        query: data.query_type === 'original' ? data.query : msg.searchInfo?.query || "",
                        subQueries: data.query_type === 'sub_query'
                          ? [...(msg.searchInfo?.subQueries || []), data.query]
                          : (msg.searchInfo?.subQueries || [])
                      }
                    }
                    : msg
                )
              );
            }
            else if (data.type === 'reading_start') {
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === aiResponseId
                    ? {
                      ...msg,
                      searchInfo: {
                        ...msg.searchInfo!,
                        stages: [...(msg.searchInfo?.stages || []), 'reading']
                      }
                    }
                    : msg
                )
              );
            }
            else if (data.type === 'source_found') {
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === aiResponseId
                    ? {
                      ...msg,
                      searchInfo: {
                        ...msg.searchInfo!,
                        webSources: [
                          ...(msg.searchInfo?.webSources || []),
                          data.source
                        ].filter((source, index, arr) =>
                          arr.findIndex(s => s.url === source.url) === index
                        )
                      }
                    }
                    : msg
                )
              );
            }
            else if (data.type === 'writing_start') {
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === aiResponseId
                    ? {
                      ...msg,
                      searchInfo: {
                        ...msg.searchInfo!,
                        stages: [...(msg.searchInfo?.stages || []), 'writing']
                      }
                    }
                    : msg
                )
              );
            }
            else if (data.type === 'content') {
              streamedContent += data.content;
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === aiResponseId
                    ? { ...msg, content: streamedContent, isLoading: false }
                    : msg
                )
              );
            }
            else if (data.type === 'end') {
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === aiResponseId
                    ? { ...msg, isLoading: false }
                    : msg
                )
              );
              eventSource.close();
            }
          } catch (error) {
            console.error("Error parsing event data:", error);
          }
        };

        // Handle errors
        eventSource.onerror = (error) => {
          console.error("EventSource error:", error);
          eventSource.close();
          if (!streamedContent) {
            setMessages(prev =>
              prev.map(msg =>
                msg.id === aiResponseId
                  ? {
                    ...msg,
                    content: "Sorry, there was an error processing your request.",
                    isLoading: false,
                    searchInfo: mergeSearchInfo(msg.searchInfo, {
                      type: 'search_error',
                      error: "Connection error"
                    })
                  }
                  : msg
              )
            );
          }
        };

      } catch (error) {
        console.error("Error setting up EventSource:", error);
        setMessages(prev => [
          ...prev,
          {
            id: newMessageId + 1,
            content: "Sorry, there was an error connecting to the server.",
            isUser: false,
            type: 'message',
            isLoading: false,
            searchInfo: {
              stages: ['error'],
              query: "",
              source: "",
              subQueries: [],
              urls: [],
              sources: [],
              webSources: [],
              documentSources: [],
              error: "Connection failed"
            }
          }
        ]);
      }
    }
  };

  // PRE-CHAT SCREEN: Clean and simple
  if (!hasStartedChat) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 -mt-16">
        {/* Logo/Title */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-gray-800 mb-1">
            AI Search Engine
          </h1>
          <p className="text-sm text-gray-500">Where Knowledge Begins</p>
        </div>

        {/* Search Input */}
        <div className="w-full max-w-lg mx-8">
          <InputBar
            currentMessage={currentMessage}
            setCurrentMessage={setCurrentMessage}
            onSubmit={handleSubmit}
            centered={true}
            sessionId={sessionId}
            onUploadComplete={loadDocuments} // ← CRITICAL: Pass this callback
          />
        </div>
      </div>
    );
  }

  console.log('🔍 HEADER DEBUG:', {
    'documents': documents,
    'documents.length': documents.length,
    'typeof documents': typeof documents,
    'Array.isArray(documents)': Array.isArray(documents),
    'sessionId': sessionId,
    'hasStartedChat': hasStartedChat
  });

  return (
    <div className="flex flex-col min-h-screen bg-white relative">
      {/* Remove the header completely - we'll show docs above input instead */}

      {/* Message Area - No top padding since no header, add right padding if source is open */}
      <div className={`flex-1 overflow-y-auto pb-24 transition-all duration-300 ${selectedSource ? 'pr-80' : ''}`}>
        <MessageArea messages={messages} onSourceClick={setSelectedSource} />
      </div>

      {/* Input Bar - Fixed at bottom WITH document display above */}
      <div className={`fixed bottom-0 left-0 right-0 z-10 transition-all duration-300 ${selectedSource ? 'pr-80' : ''}`}>
        <InputBar
          currentMessage={currentMessage}
          setCurrentMessage={setCurrentMessage}
          onSubmit={handleSubmit}
          centered={false}
          sessionId={sessionId}
          onUploadComplete={loadDocuments}
          documents={documents}
          showDocumentsAboveInput={true}
        />
      </div>

      {/* Right Sidebar for Source Details */}
      <AnimatePresence>
        {selectedSource && (
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 bottom-0 w-80 bg-white border-l border-gray-200 shadow-xl z-50 flex flex-col"
          >
            {/* Sidebar Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/80">
              <h2 className="text-sm font-semibold text-gray-800 flex items-center">
                <FileText className="w-4 h-4 mr-2 text-indigo-500" /> Source Details
              </h2>
              <button
                onClick={() => setSelectedSource(null)}
                className="p-1.5 rounded-md hover:bg-gray-200 text-gray-500 hover:text-gray-800 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            {/* Sidebar Content */}
            <div className="flex-1 overflow-y-auto p-5">
              <div className="mb-4">
                <span className="inline-flex items-center justify-center min-w-[24px] h-[24px] text-xs bg-indigo-50 text-indigo-700 rounded-full font-bold mb-3 ring-1 ring-indigo-200/50">
                  {selectedSource.index}
                </span>
                <h3 className="text-lg font-bold text-gray-900 leading-snug mb-2">
                  {selectedSource.title || selectedSource.filename || "Source Document"}
                </h3>
                <div className="flex items-center text-sm text-gray-500 mb-6">
                  {selectedSource.type === 'web' ? <Globe className="w-3.5 h-3.5 mr-1.5" /> : <FileText className="w-3.5 h-3.5 mr-1.5" />}
                  <span className="truncate">{selectedSource.domain || (selectedSource.url ? new URL(selectedSource.url).hostname.replace('www.', '') : 'Website')}</span>
                </div>
              </div>

              {selectedSource.url && selectedSource.url.startsWith('http') && (
                <a
                  href={selectedSource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex justify-center items-center w-full py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg transition-colors shadow-sm mb-6"
                >
                  Visit Source <svg className="w-3.5 h-3.5 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                </a>
              )}

              <div className="border-t border-gray-100 pt-5">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Metadata</h4>
                <div className="space-y-3 text-sm">
                  {selectedSource.type && (
                    <div><span className="text-gray-500 block mb-0.5">Type</span><span className="text-gray-800 font-medium capitalize">{selectedSource.type} Source</span></div>
                  )}
                  {selectedSource.score && (
                    <div><span className="text-gray-500 block mb-0.5">Relevance Score</span><span className="text-gray-800 font-medium">{(selectedSource.score * 100).toFixed(1)}%</span></div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

}
export default Home;
