"use client"

import React, { useState, useRef } from 'react';
import { Paperclip, Send } from 'lucide-react';
import FileUpload from './FileUpload';
import DocumentManager from './DocumentManager';
import { useFileUpload } from '../hooks/useFileUpload';

interface InputBarProps {
  currentMessage: string;
  setCurrentMessage: (message: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

const InputBar: React.FC<InputBarProps> = ({ 
  currentMessage, 
  setCurrentMessage, 
  onSubmit 
}) => {
  const [showFileUpload, setShowFileUpload] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const {
    uploadedDocuments,
    uploadProgress,
    isUploading,
    uploadDocument,
    removeDocument
  } = useFileUpload();

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

  return (
    <div className="bg-[#FCFCF8] border-t border-gray-200 backdrop-blur-sm bg-opacity-95 shadow-lg">
      {/* Center the input like Perplexity with max width */}
      <div className="max-w-3xl mx-auto px-4 py-4">
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

        {/* Input Form - PROPERLY ALIGNED */}
        <form onSubmit={onSubmit} className="flex items-center gap-3">
          {/* Textarea Container */}
          <div className="flex-1 flex items-center bg-white border border-gray-300 rounded-xl shadow-sm">
            <textarea
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              placeholder={
                uploadedDocuments.length > 0 
                  ? "Ask questions about your documents..." 
                  : "Ask me anything..."
              }
              className="flex-1 px-4 py-3 bg-transparent resize-none focus:outline-none max-h-32"
              rows={1}
              style={{ 
                minHeight: '48px',
                lineHeight: '1.5'
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit(e);
                }
              }}
            />
            
            {/* Attachment Button - Inside textarea container */}
            <button
              type="button"
              onClick={handleAttachmentClick}
              className={`p-2 m-1 rounded-md transition-colors flex-shrink-0 ${
                showFileUpload 
                  ? 'text-[#5E507F] bg-purple-100' 
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
              title="Upload document"
            >
              <Paperclip className="w-4 h-4" />
            </button>
          </div>

          {/* Send Button - Same height as textarea container */}
          <button
            type="submit"
            disabled={!currentMessage.trim() && uploadedDocuments.length === 0}
            className="h-12 px-6 bg-gradient-to-r from-[#5E507F] to-[#4A3F71] text-white rounded-xl hover:from-[#524670] hover:to-[#3E3566] focus:outline-none focus:ring-2 focus:ring-[#5E507F] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 shadow-md flex-shrink-0"
          >
            <Send className="w-4 h-4" />
            <span>Send</span>
          </button>
        </form>


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
