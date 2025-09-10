import { useState, useCallback } from 'react';

export const useFileUpload = () => {
  const [uploadedDocuments, setUploadedDocuments] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({});
  const [isUploading, setIsUploading] = useState(false);

  const uploadDocument = useCallback(async (file) => {
    const fileId = `temp_${Date.now()}_${file.name}`;
    
    // Add to progress tracking
    setUploadProgress(prev => ({
      ...prev,
      [fileId]: { progress: 0, status: 'uploading', filename: file.name }
    }));
    
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('http://localhost:8000/upload-document', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Upload failed');
      }

      const result = await response.json();
      
      // Update progress to completed
      setUploadProgress(prev => ({
        ...prev,
        [fileId]: { progress: 100, status: 'completed', filename: file.name, result }
      }));

      // Add to uploaded documents
      setUploadedDocuments(prev => [...prev, {
        id: result.document_id,
        filename: result.filename,
        fileSize: result.file_size,
        totalChunks: result.total_chunks,
        uploadTime: result.upload_time,
        status: 'ready'
      }]);

      return { success: true, document: result };

    } catch (error) {
      console.error('Upload error:', error);
      
      // Update progress to failed
      setUploadProgress(prev => ({
        ...prev,
        [fileId]: { progress: 0, status: 'failed', filename: file.name, error: error.message }
      }));

      return { success: false, error: error.message };
    } finally {
      setIsUploading(false);
      
      // Clean up progress after 3 seconds
      setTimeout(() => {
        setUploadProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[fileId];
          return newProgress;
        });
      }, 3000);
    }
  }, []);

  const removeDocument = useCallback((documentId) => {
    setUploadedDocuments(prev => prev.filter(doc => doc.id !== documentId));
  }, []);

  return {
    uploadedDocuments,
    uploadProgress,
    isUploading,
    uploadDocument,
    removeDocument
  };
};
