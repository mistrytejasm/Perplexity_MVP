"use client"
import InputBar from '@/components/InputBar';
import MessageArea from '@/components/MessageArea';
import React, { useState, useEffect } from 'react'; // 🔥 Add useEffect

// 🔥 NEW: Simple session ID generator (add this one function)
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

  // 🔥 NEW: Initialize session (add this one useEffect)
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

  // Helper function to merge search info incrementally
  const mergeSearchInfo = (existing: SearchInfo | undefined, newData: any): SearchInfo => {
    // ... keep your existing mergeSearchInfo function exactly as is
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

    // Merge stages uniquely
    if (newData.type && !merged.stages.includes(newData.type)) {
      if (newData.type === 'search_start') merged.stages.push('searching');
      if (newData.type === 'query_breakdown') merged.stages.push('searching');
      if (newData.type === 'search_results') merged.stages.push('reading');
      if (newData.type === 'end') merged.stages.push('writing');
      if (newData.type === 'search_error') merged.stages.push('error');
    }

    // Update query
    if (newData.query) merged.query = newData.query;
    if (newData.original_query) merged.query = newData.original_query;

    // Update source
    if (newData.source) merged.source = newData.source;

    // Merge sub-queries uniquely
    if (newData.sub_queries) {
      newData.sub_queries.forEach((sq: string) => {
        if (!merged.subQueries.includes(sq)) {
          merged.subQueries.push(sq);
        }
      });
    }

    // Merge web sources uniquely (by URL)
    if (newData.web_sources) {
      newData.web_sources.forEach((ws: any) => {
        if (!merged.webSources.find(existing => existing.url === ws.url)) {
          merged.webSources.push(ws);
        }
      });
    }

    // Merge document sources uniquely (by filename)
    if (newData.document_sources) {
      newData.document_sources.forEach((ds: any) => {
        if (!merged.documentSources.find(existing => existing.filename === ds.filename)) {
          merged.documentSources.push(ds);
        }
      });
    }

    // Merge URLs uniquely
    if (newData.urls) {
      const urlsArray = typeof newData.urls === 'string' ? JSON.parse(newData.urls) : newData.urls;
      urlsArray.forEach((url: string) => {
        if (!merged.urls.includes(url)) {
          merged.urls.push(url);
        }
      });
      
      // Also add to webSources for display
      urlsArray.forEach((url: string) => {
        const domain = url.split('//')[1]?.split('/')[0] || 'unknown';
        if (!merged.webSources.find(ws => ws.url === url)) {
          merged.webSources.push({ url, domain });
        }
      });
    }

    // Merge sources uniquely
    if (newData.sources) {
      newData.sources.forEach((source: string) => {
        if (!merged.sources.includes(source)) {
          merged.sources.push(source);
        }
      });
      
      // Also add to documentSources for display
      newData.sources.forEach((source: string) => {
        if (!merged.documentSources.find(ds => ds.filename === source)) {
          merged.documentSources.push({ filename: source });
        }
      });
    }

    // Update error
    if (newData.error) merged.error = newData.error;

    return merged;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (currentMessage.trim()) {
      // 🔥 NEW: Mark that chat has started
      if (!hasStartedChat) {
        setHasStartedChat(true);
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

        // 🔥 UPDATED: Add session_id to URL (change this one line)
        let url = `http://localhost:8000/chat_stream?message=${encodeURIComponent(userInput)}&session_id=${sessionId}`;
        if (checkpointId) url += `&checkpoint_id=${encodeURIComponent(checkpointId)}`;

        // ... keep the rest of your handleSubmit function exactly as is
        const eventSource = new EventSource(url);
        let streamedContent = "";

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
                          ...msg.searchInfo,
                          stages: ['searching'],
                          query: data.query_type === 'original' ? data.query : msg.searchInfo?.query,
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
                          ...msg.searchInfo,
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
                          ...msg.searchInfo,
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
                          ...msg.searchInfo,
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

  // 🔥 NEW: Render different layouts based on chat state
  if (!hasStartedChat) {
    return (
      <div className="min-h-screen bg-[#FCFCF8] flex flex-col items-center justify-center px-6 -mt-16">
        {/* Compact Logo/Title */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-gray-800 mb-1">
            AI Search Engine
          </h1>
          <p className="text-sm text-gray-500">Where Knowledge Begins</p>
        </div>
        {/* Compact Input - Choose your preferred width */}
        <div className="w-full max-w-lg mx-8"> 
          <InputBar 
            currentMessage={currentMessage} 
            setCurrentMessage={setCurrentMessage} 
            onSubmit={handleSubmit}
            centered={true}
            sessionId={sessionId} // 🔥 NEW: Pass session ID
          />
        </div>
      </div>
    );
  }

  // Chat interface with input at bottom
  return (
    <div className="flex flex-col min-h-screen bg-[#FCFCF8] relative">
      {/* Message Area - Full height with bottom padding for fixed input */}
      <div className="flex-1 overflow-y-auto pb-24">
        <MessageArea messages={messages} />
      </div>
      
      {/* Input Bar - Fixed at bottom of viewport */}
      <div className="fixed bottom-0 left-0 right-0 z-10">
        <InputBar 
          currentMessage={currentMessage} 
          setCurrentMessage={setCurrentMessage} 
          onSubmit={handleSubmit} 
          centered={false}
          sessionId={sessionId} // 🔥 NEW: Pass session ID
        />
      </div>
    </div>
  );
};

export default Home;
