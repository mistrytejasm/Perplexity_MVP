import React from 'react';
import { File, Trash2, Clock } from 'lucide-react';

const DocumentManager = ({ documents, onRemoveDocument }) => {
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatUploadTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  if (documents.length === 0) {
    return null;
  }

  return (
    <div className="mb-4">
      <h3 className="text-sm font-medium text-gray-700 mb-3">Uploaded Documents</h3>
      <div className="space-y-2">
        {documents.map((doc) => (
          <div key={doc.id} className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-center space-x-3">
              <File className="w-4 h-4 text-green-600" />
              <div>
                <p className="text-sm font-medium text-gray-900">{doc.filename}</p>
                <div className="flex items-center space-x-4 text-xs text-gray-500">
                  <span>{formatFileSize(doc.fileSize)}</span>
                  <span>•</span>
                  <span>{doc.totalChunks} chunks</span>
                  <span>•</span>
                  <span className="flex items-center">
                    <Clock className="w-3 h-3 mr-1" />
                    {formatUploadTime(doc.uploadTime)}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => onRemoveDocument(doc.id)}
              className="p-1 text-gray-400 hover:text-red-500 transition-colors"
              title="Remove document"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DocumentManager;
