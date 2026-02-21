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
  const [selectedSourceData, setSelectedSourceData] = useState<{ source?: any, allSources: any[] } | null>(null);

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
      <div className={`flex-1 overflow-y-auto pb-24 transition-all duration-300 ${selectedSourceData ? 'pr-80' : ''}`}>
        <MessageArea messages={messages} onSourceClick={(source, allSources) => setSelectedSourceData({ source, allSources })} />
      </div>

      {/* Input Bar - Fixed at bottom WITH document display above */}
      <div className={`fixed bottom-0 left-0 right-0 z-10 transition-all duration-300 ${selectedSourceData ? 'pr-80' : ''}`}>
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
        {selectedSourceData && (
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 bottom-0 w-80 bg-white border-l border-gray-200 shadow-xl z-50 flex flex-col"
          >
            {/* Sidebar Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/80 shrink-0">
              <h2 className="text-sm font-semibold text-gray-800 flex items-center">
                <FileText className="w-4 h-4 mr-2 text-indigo-500" /> Source Details
              </h2>
              <button
                onClick={() => setSelectedSourceData(null)}
                className="p-1.5 rounded-md hover:bg-gray-200 text-gray-500 hover:text-gray-800 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            {/* Sidebar Content List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {selectedSourceData.allSources.map((source: any, idx: number) => {
                const isSelected = selectedSourceData.source?.index === source.index || selectedSourceData.source?.url === source.url;

                return (
                  <div
                    key={`sidebar-src-${idx}`}
                    onClick={() => setSelectedSourceData({ source, allSources: selectedSourceData.allSources })}
                    className={`p-3 rounded-lg border transition-all cursor-pointer group ${isSelected ? 'border-indigo-300 bg-indigo-50/50 shadow-sm' : 'border-gray-100 bg-gray-50/30 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className={`inline-flex items-center justify-center min-w-[20px] h-[20px] text-[10px] rounded-full font-bold transition-colors ${isSelected ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-200/80 text-gray-600 group-hover:bg-gray-300'
                        }`}>
                        {source.index || idx + 1}
                      </span>
                      <div className="flex items-center text-[10px] text-gray-500 bg-white px-1.5 py-0.5 rounded shadow-sm border border-gray-100 uppercase font-semibold tracking-wider">
                        {source.type === 'web' ? <Globe className="w-3 h-3 mr-1 text-blue-400" /> : <FileText className="w-3 h-3 mr-1 text-teal-500" />}
                        <span>{source.type}</span>
                      </div>
                    </div>

                    <h3 className={`text-[13px] font-bold leading-snug mb-1.5 ${isSelected ? 'text-indigo-950' : 'text-gray-800 group-hover:text-indigo-700 transition-colors'}`}>
                      {source.title || source.filename || "Source Document"}
                    </h3>

                    <div className="text-[11px] text-gray-500 truncate mb-3 flex items-center">
                      <svg className="w-3 h-3 mr-1 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
                      {source.domain || (source.url && source.url.startsWith('http') ? new URL(source.url).hostname.replace('www.', '') : 'Website')}
                    </div>

                    {isSelected && source.url && source.url.startsWith('http') && (
                      <motion.a
                        initial={{ opacity: 0, height: 0, marginTop: 0 }}
                        animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex justify-center items-center w-full py-2 bg-gray-900 hover:bg-gray-800 text-white text-[11px] font-semibold rounded-md transition-colors shadow-sm"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Visit Source <svg className="w-3 h-3 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                      </motion.a>
                    )}

                    {isSelected && source.score && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="mt-3 text-[10px] text-gray-400 font-medium"
                      >
                        Relevance match: {(source.score * 100).toFixed(1)}%
                      </motion.div>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

}
export default Home;
