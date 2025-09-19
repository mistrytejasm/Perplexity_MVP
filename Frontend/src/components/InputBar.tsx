"use client"
import React, { useRef, useEffect, useState } from 'react';
import { Paperclip, Send, Mic, FileText, X } from 'lucide-react';
import TextareaAutosize from 'react-textarea-autosize';

interface InputBarProps {
  currentMessage: string;
  setCurrentMessage: (message: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  centered?: boolean;
  sessionId?: string; // 🔥 NEW: Only this prop added
}

const InputBar: React.FC<InputBarProps> = ({ 
  currentMessage, 
  setCurrentMessage, 
  onSubmit,
  centered = false,
  sessionId // 🔥 NEW: Only this added
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null); // 🔥 NEW: Only this added
  const [uploadedDocs, setUploadedDocs] = useState<any[]>([]); // 🔥 NEW: Only this added

  // 🔥 NEW: Only this function added for file upload
  const handleFileUpload = async (file: File) => {
    if (!file || !sessionId) return;
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('session_id', sessionId);

    try {
      const response = await fetch('http://localhost:8000/documents/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        setUploadedDocs(prev => [...prev, result]);
      }
    } catch (error) {
      console.error('Upload failed:', error);
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
        {!centered && uploadedDocs.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {uploadedDocs.map((doc, idx) => (
              <div key={idx} className="flex items-center bg-blue-100 text-blue-700 px-3 py-1 rounded-lg text-xs">
                <FileText className="w-3 h-3 mr-1" />
                <span className="truncate max-w-[120px]">{doc.filename}</span>
                <button
                  onClick={() => setUploadedDocs(prev => prev.filter((_, i) => i !== idx))}
                  className="ml-2 hover:text-blue-900"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Perplexity-style Input Container - UNCHANGED */}
        <div className="relative">
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
              onClick={() => fileInputRef.current?.click()} // 🔥 NEW: Only this line added
              className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center justify-center transition-all duration-200"
              title="Upload document"
            >
              <Paperclip className="w-4 h-4" />
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

          {/* 🔥 NEW: Only this hidden input added */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
            }}
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
};

export default InputBar;
