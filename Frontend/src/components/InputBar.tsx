"use client"

import React, { useState, useRef, useEffect } from 'react';
import { Paperclip, Send, Mic } from 'lucide-react';
import TextareaAutosize from 'react-textarea-autosize';
import FileUpload from './FileUpload';
import DocumentManager from './DocumentManager';
import { useFileUpload } from '../hooks/useFileUpload';

interface InputBarProps {
  currentMessage: string;
  setCurrentMessage: (message: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  centered?: boolean;
}

const InputBar: React.FC<InputBarProps> = ({ 
  currentMessage, 
  setCurrentMessage, 
  onSubmit,
  centered = false
}) => {
  const [showFileUpload, setShowFileUpload] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const {
    uploadedDocuments,
    uploadProgress,
    isUploading,
    uploadDocument,
    removeDocument
  } = useFileUpload();

  // Auto-focus input when centered
  useEffect(() => {
    if (centered && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [centered]);

  const handleFileUpload = async (file: File) => {
    const result = await uploadDocument(file);
    if (result.success) {
      console.log('Document uploaded successfully:', result.document);
    } else {
      console.error('Upload failed:', result.error);
    }
  };

  const handleAttachmentClick = () => {
    setShowFileUpload(!showFileUpload);
  };

  // 🔧 NEW: Handle submit from button click
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
    ? "w-full px-6 py-4 text-lg" 
    : "px-4 py-3";

  return (
    <div className={containerClasses}>
      <div className={innerContainerClasses}>
        {/* Document Manager */}
        <DocumentManager 
          documents={uploadedDocuments}
          onRemoveDocument={removeDocument}
        />
        
        {/* File Upload Area */}
        {showFileUpload && (
          <div className="mb-4">
            <FileUpload
              onFileUpload={handleFileUpload}
              uploadProgress={uploadProgress}
              isUploading={isUploading}
            />
          </div>
        )}

        {/* 🔧 NEW: Perplexity-style Input Container */}
        <div className="relative">
          {/* Full Width Textarea - No Send Button on Side */}
          <form onSubmit={onSubmit}>
            <TextareaAutosize
              ref={textareaRef}
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              placeholder={
                centered 
                  ? "Ask anything..." 
                  : uploadedDocuments.length > 0 
                    ? "Ask questions about your documents..." 
                    : "Ask anything or @mention a Space"
              }
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

          {/* 🔧 NEW: Bottom Button Bar (Like Perplexity) */}
          <div className="absolute bottom-3 right-4 flex items-center space-x-3">
            {/* Attachment Button */}
            <button
              type="button"
              onClick={handleAttachmentClick}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 ${
                showFileUpload 
                  ? 'bg-[#5E507F] text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              title="Upload document"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            {/* Microphone Button */}
            <button
              type="button"
              className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center justify-center transition-all duration-200"
              title="Voice input"
            >
              <Mic className="w-4 h-4" />
            </button>

            {/* Send Button (Small & Round) */}
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
        </div>

        {/* Upload Status Indicator */}
        {uploadedDocuments.length > 0 && (
          <div className="mt-2 text-xs text-gray-500 text-center">
            💡 You can now ask questions about your uploaded documents
          </div>
        )}
      </div>
    </div>
  );
};

export default InputBar;
