"use client"
import InputBar from '@/components/search/InputBar';
import MessageArea from '@/components/chat/MessageArea';
import React from 'react';
import DocumentList from '@/components/document/DocumentList';
import { FileText, Globe, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChat } from '@/hooks/useChat';
import Suggestions from '@/components/search/Suggestions';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';

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
  const {
    messages,
    currentMessage,
    setCurrentMessage,
    hasStartedChat,
    sessionId,
    documents,
    selectedSourceData,
    setSelectedSourceData,
    loadDocuments,
    handleSubmit,
    submitQuery
  } = useChat();

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      <Sidebar currentSessionId={sessionId} />

      <div className="flex flex-col flex-1 min-w-0 relative h-full">
        <AnimatePresence mode="wait">
          {!hasStartedChat ? (
            <motion.div
              key="landing"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02, filter: 'blur(4px)' }}
              transition={{ duration: 0.35, ease: "easeInOut" }}
              className="flex-1 overflow-y-auto bg-gradient-to-b from-gray-50 to-white flex flex-col items-center justify-center px-6 absolute inset-0 z-10"
            >
              {/* Logo/Title */}
              <div className="mb-8 text-center flex flex-col items-center">
                <div className="w-12 h-12 bg-gray-900 rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-gray-200">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-3xl font-semibold text-gray-800 tracking-tight mb-2 font-sans">
                  Perplexity MVP
                </h1>
                <p className="text-gray-500 font-medium">Where Knowledge Begins</p>
              </div>

              {/* Search Input */}
              <div className="w-full max-w-2xl mx-auto z-10 transition-all">
                <InputBar
                  currentMessage={currentMessage}
                  setCurrentMessage={setCurrentMessage}
                  onSubmit={handleSubmit}
                  centered={true}
                  sessionId={sessionId}
                  onUploadComplete={loadDocuments}
                />
              </div>

              {/* Quick Suggestions */}
              <Suggestions onSuggest={submitQuery} />
            </motion.div>
          ) : (
            <motion.div
              key="chat"
              initial={{ opacity: 0, filter: 'blur(4px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="flex flex-col h-full w-full relative z-20 bg-white"
            >
              <Header />

              {/* Message Area - Add right padding if source is open */}
              <div className={`flex-1 overflow-y-auto pb-36 transition-all duration-300 ${selectedSourceData ? 'pr-80' : ''}`}>
                <MessageArea
                  messages={messages}
                  onSourceClick={(source, allSources) => setSelectedSourceData({ source, allSources })}
                  onSuggestionClick={submitQuery}
                />
              </div>

              {/* Input Bar - Floating at bottom WITH document display above */}
              <div className={`absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-white via-white/95 to-transparent pt-10 pointer-events-none transition-all duration-300 ${selectedSourceData ? 'pr-80' : ''}`}>
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

              {/* Improvement #10: FAB New Thread shortcut */}
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5, type: 'spring', stiffness: 300, damping: 25 }}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => window.location.href = '/'}
                className="fixed bottom-8 right-8 w-12 h-12 bg-gray-900 hover:bg-gray-700 text-white rounded-full shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center z-30"
                title="New Thread"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              </motion.button>

              {/* Right Sidebar for Source Details */}
              <AnimatePresence>
                {selectedSourceData && (
                  <motion.div
                    initial={{ x: '100%', opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: '100%', opacity: 0 }}
                    transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    className="absolute top-0 right-0 bottom-0 w-80 bg-white border-l border-gray-200 shadow-xl z-50 flex flex-col"
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

                            {source.snippet && (
                              <p className="text-xs text-gray-600 line-clamp-3 mb-2.5 leading-relaxed bg-white/50 p-2 rounded border border-gray-100/50">
                                {source.snippet}
                              </p>
                            )}

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

            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

}
export default Home;
