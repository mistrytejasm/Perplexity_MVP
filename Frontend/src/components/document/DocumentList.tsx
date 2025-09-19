import React from 'react';
import { FileText, X, Clock } from 'lucide-react';

interface Document {
  document_id: string;
  filename: string;
  upload_time: string;
  total_chunks: number;
  file_size: number;
}

interface DocumentListProps {
  documents: Document[];
  onRemoveDocument: (documentId: string) => void;
}

const DocumentList: React.FC<DocumentListProps> = ({ documents, onRemoveDocument }) => {
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatTime = (timeString: string) => {
    try {
      const date = new Date(timeString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return timeString;
    }
  };

  if (documents.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p>No documents uploaded yet</p>
        <p className="text-sm">Upload a PDF to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {documents.map((doc) => (
        <div key={doc.document_id} className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3 flex-1 min-w-0">
              <FileText className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-gray-900 truncate">
                  {doc.filename}
                </h3>
                <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
                  <span>{doc.total_chunks} chunks</span>
                  <span>{formatFileSize(doc.file_size)}</span>
                  <div className="flex items-center space-x-1">
                    <Clock className="w-3 h-3" />
                    <span>{formatTime(doc.upload_time)}</span>
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={() => onRemoveDocument(doc.document_id)}
              className="text-gray-400 hover:text-red-500 transition-colors p-1"
              title="Remove document"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default DocumentList;
