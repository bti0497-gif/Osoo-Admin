import { useState, useCallback } from 'react';
import { apiClient } from '../../../../core/api';

export function useCertificateUpload() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // BigQuery 업로드
  const uploadToBigQuery = useCallback(async (data) => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await apiClient.post('/api/certificates/water-quality/batch-insert', { rows: data });
      
      if (result.success) {
        return { success: true, inserted: result.inserted || data.length };
      } else {
        setError(result.message || 'BigQuery 업로드 실패');
        return { success: false, error: result.message };
      }
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, []);

  // PDF를 이미지로 변환하여 Drive 업로드
  const uploadPdfToDrive = useCallback(async (file, siteName) => {
    setLoading(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('pdf', file);
      formData.append('siteName', siteName);
      
      const result = await apiClient.upload('/api/certificates/pdf-to-image-upload', formData);
      
      if (result.success) {
        return { 
          success: true, 
          fileId: result.fileId,
          fileName: result.fileName,
          webViewLink: result.webViewLink
        };
      } else {
        setError(result.message || 'Drive 업로드 실패');
        return { success: false, error: result.message };
      }
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    uploadToBigQuery,
    uploadPdfToDrive
  };
}
