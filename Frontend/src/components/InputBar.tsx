"use client"
import React, { useRef, useEffect, useState } from 'react';
import { Paperclip, Send, Mic, FileText, X } from 'lucide-react';
import TextareaAutosize from 'react-textarea-autosize';

interface InputBarProps {
  currentMessage: string;
  setCurrentMessage: (message: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  centered?: boolean;
  sessionId?: string;
  onUploadComplete?: () => void;
}

const InputBar: React.FC<InputBarProps> = ({ 
  currentMessage, 
  setCurrentMessage, 
  onSubmit,
  centered = false,
  sessionId,
  onUploadComplete
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null); // 🔥 NEW: Only this added
  const [uploadedDocs, setUploadedDocs] = useState<{
  id: string;
  filename: string;
  status: 'uploading' | 'processing' | 'ready' | 'error';
  progress?: number;
  error?: string;
  }[]>([]);

  const handleFileUploadWithId = async (file: File, uploadId: string) => {
    if (!file || !sessionId) return;

    console.log('Starting upload for:', file.name);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('session_id', sessionId);

    try {
      // Update to processing status
      setUploadedDocs(prev => prev.map(doc => 
        doc.id === uploadId ? { ...doc, status: 'processing' } : doc
      ));

      const response = await fetch('https://mistrytejasm-perplexity-mvp.hf.space/documents/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Upload successful:', result);
        setUploadedDocs(prev => prev.map(doc => 
          doc.id === uploadId ? { ...doc, status: 'ready' } : doc
        ));
        
        // 🔧 FIX: Call the callback to refresh document list
        if (onUploadComplete) {
          onUploadComplete();
        }
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      console.error('Upload failed:', error);
      setUploadedDocs(prev => prev.map(doc => 
        doc.id === uploadId ? { ...doc, status: 'error' } : doc
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
        preventDefault: () => {}
      } as React.FormEvent;
      onSubmit(syntheticEvent);
    }
  };

  // Container styles based on mode
  const containerClasses = centered 
    ? "w-full" 
    : "bg-[#FCFCF8] border-t border-gray-200 backdrop-blur-sm bg-opacity-95 shadow-lg";

  const innerContainerClasses = centered
    ? "w-full"  
    : "max-w-3xl mx-auto px-4 py-4";

  const inputClasses = centered
    ? "w-full px-6 py-4 text-sm" 
    : "px-4 py-3";

  return (
    <div className={containerClasses}>
      <div className={innerContainerClasses}>
        {/* 🔥 NEW: Only this section added - show uploaded docs above input when not centered */}
        {/* 📄 Compact Document Chips */}
        {uploadedDocs.length > 0 && (
          <div className={`mb-3 ${centered ? 'mb-4' : ''}`}>
            <div className="flex flex-wrap gap-2">
              {uploadedDocs.map((doc) => (
                <div key={doc.id} className="flex items-center bg-blue-50 border border-blue-200 rounded-lg px-2 py-1.5 text-xs max-w-[200px]">
                  {/* Document Icon - Smaller */}
                  <FileText className="w-3 h-3 text-blue-600 mr-1.5 flex-shrink-0" />
                  
                  {/* Document Name - Truncated */}
                  <span className="text-blue-800 truncate mr-2 font-medium">
                    {doc.filename.length > 20 ? `${doc.filename.substring(0, 20)}...` : doc.filename}
                  </span>
                  
                  {/* Status Indicator - Compact */}
                  <div className="flex items-center mr-1.5">
                    {/* Loading Animation */}
                    {(doc.status === 'uploading' || doc.status === 'processing') && (
                      <div className="w-3 h-3 border border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    )}
                    
                    {/* Success Checkmark */}
                    {doc.status === 'ready' && (
                      <div className="w-3 h-3 bg-green-500 rounded-full flex items-center justify-center">
                        <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                    
                    {/* Error X */}
                    {doc.status === 'error' && (
                      <div className="w-3 h-3 bg-red-500 rounded-full flex items-center justify-center">
                        <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>
                  
                  {/* Remove Button - Compact */}
                  <button
                    onClick={() => setUploadedDocs(prev => prev.filter(d => d.id !== doc.id))}
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

        {/* Perplexity-style Input Container - UNCHANGED */}
        <div className="relative">

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                const uploadId = Date.now().toString();
                setUploadedDocs(prev => [...prev, {
                  id: uploadId,
                  filename: file.name,
                  status: 'uploading'
                }]);
                handleFileUploadWithId(file, uploadId);
              }
            }}
            className="hidden"
          />
          {/* Full Width Textarea - No Send Button on Side - UNCHANGED */}
          <form onSubmit={onSubmit}>
            <TextareaAutosize
              ref={textareaRef}
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              placeholder={centered ? "Ask anything..." : "Ask anything..."}
              minRows={1}
              maxRows={centered ? 8 : 5}
              className={`w-full ${inputClasses} pb-14 bg-white border border-gray-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-[#5E507F] focus:border-transparent shadow-sm`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit(e);
                }
              }}
              style={{
                lineHeight: '1.5'
              }}
            />
          </form>

          {/* Bottom Button Bar (Like Perplexity) - UNCHANGED except onclick */}
          <div className="absolute bottom-3 right-4 flex items-center space-x-3">
            {/* Attachment Button - 🔥 NEW: Only added onClick functionality */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="relative w-8 h-8 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center justify-center transition-all duration-200"
              title="Upload document"
            >
              <Paperclip className="w-4 h-4" />
              {uploadedDocs.filter(doc => doc.status === 'ready').length > 0 && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 text-white rounded-full flex items-center justify-center text-xs font-medium">
                  {uploadedDocs.filter(doc => doc.status === 'ready').length}
                </div>
              )}
            </button>


            {/* Microphone Button - UNCHANGED */}
            <button
              type="button"
              className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center justify-center transition-all duration-200"
              title="Voice input"
            >
              <Mic className="w-4 h-4" />
            </button>

            {/* Send Button (Small & Round) - UNCHANGED */}
            <button
              type="button"
              onClick={handleSendClick}
              disabled={!currentMessage.trim()}
              className="w-8 h-8 rounded-full bg-gradient-to-r from-[#5E507F] to-[#4A3F71] text-white hover:from-[#524670] hover:to-[#3E3566] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-200 shadow-sm"
              title="Send message"
            >
              <Send className="w-3 h-3" />
            </button>
          </div>

          {/* 🔥 UPDATED: Show file immediately when selected */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                console.log('File selected:', file.name); // 🔥 DEBUG: Add this line
                
                // Show file immediately when selected
                const uploadId = Date.now().toString();
                setUploadedDocs(prev => [...prev, {
                  id: uploadId,
                  filename: file.name,
                  status: 'uploading'
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
