import { useState, useCallback } from 'react';
import { getApiBase } from '../../../../core/api/serverConfig';

const adminHeaders = () => ({
  'x-user-role': 'super_admin',
  'x-user-name': 'admin',
});

/**
 * PDF 업로드 처리 Hook
 * BigQuery INSERT 및 Drive 업로드
 */
export function usePdfUpload() {
  const [uploadStatus, setUploadStatus] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null); // 진행 상태 추적

  /**
   * 단일 페이지 데이터 BigQuery에 INSERT
   */
  const insertToBigQuery = useCallback(async (extractedData, sourcePdfName) => {
    try {
      const res = await fetch(`${getApiBase()}/api/certificates/import-from-ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminHeaders() },
        body: JSON.stringify({
          ...extractedData,
          source_pdf_name: sourcePdfName,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`BigQuery INSERT 실패: ${res.status} ${text.substring(0, 100)}`);
      }

      const data = await res.json().catch(() => ({}));
      return {
        success: true,
        manualReviewRequired: data.manual_review_required || false,
        siteNameRaw: data.site_name_raw,
        siteName: data.site_name,
      };
    } catch (err) {
      console.error('[usePdfUpload] BigQuery INSERT 실패:', err);
      return { success: false, error: err.message };
    }
  }, []);

  /**
   * 이미지를 Google Drive에 업로드
   */
  const uploadToDrive = useCallback(async (blob, basename, category = '성적서', reportDate) => {
    try {
      const formData = new FormData();
      formData.append('files', blob, `${basename}.jpg`);
      formData.append('report_date', reportDate || new Date().toISOString().split('T')[0]);
      formData.append('category', category);

      const res = await fetch(`${getApiBase()}/api/certificates/manual-upload-file`, {
        method: 'POST',
        headers: adminHeaders(),
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Drive 업로드 실패: ${res.status} ${text.substring(0, 100)}`);
      }

      const data = await res.json();
      return { success: true, data };
    } catch (err) {
      console.error('[usePdfUpload] Drive 업로드 실패:', err);
      return { success: false, error: err.message };
    }
  }, []);

  /**
   * 전체 업로드 프로세스 실행
   */
  const processUploads = useCallback(async (results, fileName) => {
    setUploading(true);
    
    // 업로드 대상 계산
    const bqTargets = results.filter(r => r.extracted?.include);
    const driveTargets = results.filter(r => r.extracted?.include && r.imgBlob);
    
    setUploadProgress({
      bqDone: 0,
      bqTotal: bqTargets.length,
      driveDone: 0,
      driveTotal: driveTargets.length,
      totalItems: bqTargets.length + driveTargets.length,
    });
    
    const stats = {
      imageOk: 0,
      imageFail: 0,
      jsonOk: 0,
      jsonFail: 0,
      unmatchedSites: [],
    };

    try {
      // 1단계: BigQuery INSERT
      for (const result of results) {
        if (!result.extracted?.include) continue;

        const bqResult = await insertToBigQuery(result.extracted, fileName);
        
        if (bqResult.success) {
          stats.jsonOk++;
          if (bqResult.manualReviewRequired) {
            stats.unmatchedSites.push({
              name: bqResult.siteNameRaw || '알 수 없음',
              unresolved: false,
            });
          }
        } else {
          stats.jsonFail++;
        }
        
        // 진행 상태 업데이트
        setUploadProgress(prev => ({
          ...prev,
          bqDone: prev.bqDone + 1,
        }));
      }

      // DML 반영 대기
      if (stats.jsonOk > 0) {
        await new Promise(r => setTimeout(r, 4000));
      }

      // 2단계: Drive 업로드
      for (const result of results) {
        if (!result.extracted?.include || !result.imgBlob) continue;

        const basename = result.extracted.basename || `page_${results.indexOf(result) + 1}`;

        const driveResult = await uploadToDrive(
          result.imgBlob,
          basename,
          result.extracted.record?.category || '성적서',
          result.extracted.record?.report_date
        );

        if (driveResult.success) {
          stats.imageOk++;
        } else {
          stats.imageFail++;
        }
        
        // 진행 상태 업데이트
        setUploadProgress(prev => ({
          ...prev,
          driveDone: prev.driveDone + 1,
        }));
      }

      setUploadStatus({
        ...stats,
        completed: true,
      });
      
      setUploadProgress(prev => ({
        ...prev,
        completed: true,
      }));

      return stats;
    } catch (err) {
      console.error('[usePdfUpload] 프로세스 실패:', err);
      setUploadStatus({
        ...stats,
        error: err.message,
        completed: false,
      });
      setUploadProgress(prev => ({
        ...prev,
        error: err.message,
      }));
      return stats;
    } finally {
      setUploading(false);
    }
  }, [insertToBigQuery, uploadToDrive]);

  /**
   * 상태 리셋
   */
  const resetStatus = useCallback(() => {
    setUploadStatus(null);
    setUploading(false);
    setUploadProgress(null);
  }, []);

  return {
    // State
    uploadStatus,
    uploading,
    uploadProgress, // 진행 상태 추가
    
    // Actions
    insertToBigQuery,
    uploadToDrive,
    processUploads,
    resetStatus,
    setUploadStatus,
    
    // Computed
    isComplete: uploadStatus?.completed || false,
    hasError: uploadStatus?.error != null,
  };
}

export default usePdfUpload;
