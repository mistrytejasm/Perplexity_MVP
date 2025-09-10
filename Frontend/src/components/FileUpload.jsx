import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, X, CheckCircle, AlertCircle, Loader } from 'lucide-react';

const FileUpload = ({ onFileUpload, uploadProgress, isUploading }) => {
  const onDrop = useCallback((acceptedFiles) => {
    acceptedFiles.forEach(file => {
      onFileUpload(file);
    });
  }, [onFileUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/plain': ['.txt']
    },
    maxSize: 50 * 1024 * 1024, // 50MB
    multiple: false
  });

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-3">
      {/* Upload Progress */}
      {Object.keys(uploadProgress).length > 0 && (
        <div className="space-y-2">
          {Object.entries(uploadProgress).map(([fileId, progress]) => (
            <div key={fileId} className="flex items-center space-x-3 bg-gray-50 rounded-lg p-3 border">
              <div className="flex-shrink-0">
                {progress.status === 'uploading' && (
                  <Loader className="w-4 h-4 animate-spin text-blue-500" />
                )}
                {progress.status === 'completed' && (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                )}
                {progress.status === 'failed' && (
                  <AlertCircle className="w-4 h-4 text-red-500" />
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {progress.filename}
                  </p>
                  <span className="text-xs text-gray-500">
                    {progress.status === 'uploading' && `${progress.progress}%`}
                    {progress.status === 'completed' && 'Ready'}
                    {progress.status === 'failed' && 'Failed'}
                  </span>
                </div>
                
                {progress.status === 'uploading' && (
                  <div className="mt-1 bg-gray-200 rounded-full h-1.5">
                    <div 
                      className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${progress.progress}%` }}
                    ></div>
                  </div>
                )}
                
                {progress.status === 'completed' && progress.result && (
                  <p className="text-xs text-green-600 mt-1">
                    Processed into {progress.result.total_chunks} chunks
                  </p>
                )}
                
                {progress.status === 'failed' && (
                  <p className="text-xs text-red-600 mt-1">
                    {progress.error}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Area */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
          ${isDragActive 
            ? 'border-blue-400 bg-blue-50' 
            : 'border-gray-300 hover:border-gray-400'
          }
          ${isUploading ? 'pointer-events-none opacity-50' : ''}
        `}
      >
        <input {...getInputProps()} />
        
        <Upload className="mx-auto h-8 w-8 text-gray-400 mb-3" />
        
        {isDragActive ? (
          <p className="text-sm text-blue-600">Drop the document here...</p>
        ) : (
          <div>
            <p className="text-sm text-gray-600 mb-1">
              Click to upload or drag and drop
            </p>
            <p className="text-xs text-gray-500">
              PDF, DOCX, PPTX, XLSX, TXT (max 50MB)
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUpload;
