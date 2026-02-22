"use client"
import React, { useRef, useEffect } from 'react';
import { Paperclip, Send, Mic, FileText, X } from 'lucide-react';
import TextareaAutosize from 'react-textarea-autosize';
import ModelSelector from '../ui/ModelSelector';

interface InputBarProps {
  currentMessage: string;
  setCurrentMessage: (message: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  centered?: boolean;
  sessionId?: string;
  onUploadComplete?: () => void;
  documents?: any[];
  showDocumentsAboveInput?: boolean;
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  // Lifted state — lives in useChat so it survives landing → chat transition
  uploadedDocs?: {
    id: string;
    filename: string;
    status: 'uploading' | 'processing' | 'ready' | 'error';
    progress?: number;
    error?: string;
  }[];
  setUploadedDocs?: React.Dispatch<React.SetStateAction<{
    id: string;
    filename: string;
    status: 'uploading' | 'processing' | 'ready' | 'error';
    progress?: number;
    error?: string;
  }[]>>;
}

const InputBar: React.FC<InputBarProps> = ({
  currentMessage,
  setCurrentMessage,
  onSubmit,
  centered = false,
  sessionId,
  onUploadComplete,
  documents = [],
  showDocumentsAboveInput = false,
  selectedModel = 'auto',
  onModelChange = () => { },
  uploadedDocs = [],
  setUploadedDocs,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 🔧 FIXED: Complete upload function with proper error handling
  const handleFileUploadWithId = async (file: File, uploadId: string) => {
    if (!file || !sessionId) return;

    console.log('Starting upload for:', file.name);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('session_id', sessionId);

    try {
      // Update to processing status
      setUploadedDocs?.(prev => prev.map(doc =>
        doc.id === uploadId ? { ...doc, status: 'processing' as const } : doc
      ));

      const response = await fetch('http://localhost:8000/documents/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Upload successful:', result);
        setUploadedDocs?.(prev => prev.map(doc =>
          doc.id === uploadId ? { ...doc, status: 'ready' as const } : doc
        ));

        if (onUploadComplete) {
          setTimeout(() => {
            onUploadComplete();
          }, 3000);
        }
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      console.error('Upload failed:', error);
      setUploadedDocs?.(prev => prev.map(doc =>
        doc.id === uploadId ? { ...doc, status: 'error' as const } : doc
      ));
    }
  };

  // Auto-focus input when centered
  useEffect(() => {
    if (centered && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [centered]);


  // Handle submit from button click
  const handleSendClick = () => {
    if (currentMessage.trim()) {
      const syntheticEvent = {
        preventDefault: () => { }
      } as React.FormEvent;
      onSubmit(syntheticEvent);
    }
  };

  // Container styles based on mode
  const containerClasses = centered
    ? "w-full"
    : "w-full pb-6 sm:pb-8 z-50 relative pointer-events-none flex justify-center";

  const innerContainerClasses = centered
    ? "w-full"
    : "max-w-3xl w-full px-4 sm:px-6 pointer-events-auto";

  const inputClasses = centered
    ? "w-full px-6 py-4 text-sm"
    : "w-full px-5 py-3.5 text-[15px]";

  // In chat mode, the backend `documents` list is shown; in landing mode uploadedDocs is shown.
  // Never add both together to avoid double-counting the same file.
  const totalDocumentCount = showDocumentsAboveInput
    ? (documents?.length || 0)
    : uploadedDocs.filter(doc => doc.status === 'ready').length;

  return (
    <div className={containerClasses}>
      <div className={innerContainerClasses}>
        {/* 🔥 UPDATED: Show documents from parent state when in chat mode */}
        {/* CHAT MODE: Show documents from parent state */}
        {showDocumentsAboveInput && documents.length > 0 && (
          <div className="mb-3">
            <div className="flex flex-wrap gap-2">
              {documents.map((doc, index) => (
                <div key={`doc-${index}`} className="flex items-center bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm max-w-[300px]">
                  <FileText className="w-4 h-4 text-blue-600 mr-2 flex-shrink-0" />
                  <span className="text-blue-800 truncate mr-2 font-medium">
                    {doc.filename}
                  </span>
                  <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center mr-2">
                    <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PRE-CHAT MODE ONLY: Show uploadedDocs (hide in chat mode to avoid duplicates) */}
        {!showDocumentsAboveInput && uploadedDocs.length > 0 && (
          <div className={`mb-3 ${centered ? 'mb-4' : ''}`}>
            <div className="flex flex-wrap gap-2">
              {uploadedDocs.map((doc) => (
                <div key={doc.id} className="flex items-center bg-blue-50 border border-blue-200 rounded-lg px-2 py-1.5 text-xs max-w-[200px]">
                  <FileText className="w-3 h-3 text-blue-600 mr-1.5 flex-shrink-0" />
                  <span className="text-blue-800 truncate mr-2 font-medium">
                    {doc.filename.length > 20 ? `${doc.filename.substring(0, 20)}...` : doc.filename}
                  </span>
                  <div className="flex items-center mr-1.5">
                    {(doc.status === 'uploading' || doc.status === 'processing') && (
                      <div className="w-3 h-3 border border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    )}
                    {doc.status === 'ready' && (
                      <div className="w-3 h-3 bg-green-500 rounded-full flex items-center justify-center">
                        <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                    {doc.status === 'error' && (
                      <div className="w-3 h-3 bg-red-500 rounded-full flex items-center justify-center">
                        <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setUploadedDocs?.(prev => prev.filter(d => d.id !== doc.id))}
                    className="text-blue-400 hover:text-blue-600 transition-colors flex-shrink-0"
                    title="Remove document"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Input Container */}
        <div className="relative input-focus-glow rounded-2xl border border-gray-300 bg-white transition-all">
          {/* Form */}
          <form onSubmit={onSubmit}>
            <TextareaAutosize
              ref={textareaRef}
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              placeholder={centered ? "Ask anything..." : "Ask anything..."}
              minRows={1}
              maxRows={centered ? 8 : 5}
              className={`w-full ${inputClasses} pb-14 bg-transparent border-0 rounded-2xl resize-none focus:outline-none text-gray-900 transition-all ${centered ? 'shadow-xl' : 'shadow-[0_0_40px_rgba(0,0,0,0.05)]'}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit(e);
                }
              }}
              style={{ lineHeight: '1.5' }}
            />
          </form>

          {/* Bottom Button Bar */}
          <div className="absolute bottom-3 left-3 right-4 flex items-center justify-between">
            {/* Left side: model selector */}
            <ModelSelector selectedModel={selectedModel} onModelChange={onModelChange} />

            {/* Right side: attachments, mic, send */}
            <div className="flex items-center space-x-3">
              {/* Attachment Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="relative w-8 h-8 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center justify-center transition-all duration-200"
                title="Upload document"
              >
                <Paperclip className="w-4 h-4" />
                {/* 🔥 FIXED: Show total document count */}
                {totalDocumentCount > 0 && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 text-white rounded-full flex items-center justify-center text-xs font-medium">
                    {totalDocumentCount}
                  </div>
                )}
              </button>

              {/* Microphone Button */}
              <button
                type="button"
                className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center justify-center transition-all duration-200"
                title="Voice input"
              >
                <Mic className="w-4 h-4" />
              </button>

              {/* Send Button */}
              <button
                type="button"
                onClick={handleSendClick}
                disabled={!currentMessage.trim()}
                className="w-8 h-8 rounded-full bg-gray-900 text-white hover:bg-black disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-200 shadow-sm"
                title="Send message"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                console.log('File selected:', file.name);

                // Show file immediately when selected
                const uploadId = Date.now().toString();
                setUploadedDocs?.(prev => [...prev, {
                  id: uploadId,
                  filename: file.name,
                  status: 'uploading' as const
                }]);

                // Then start the upload process
                handleFileUploadWithId(file, uploadId);
              }

              // Reset file input so same file can be selected again
              e.target.value = '';
            }}
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
};

export default InputBar;
