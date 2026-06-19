import { useState, useCallback } from 'react';
import { getApiBase } from '../../../../core/api/serverConfig';

const adminHeaders = () => ({
  'x-user-role': 'super_admin',
  'x-user-name': 'admin',
});

/**
 * PDF 업로드 처리 Hook
 * 중앙관리자 앱은 로컬 SQLite 큐를 거치지 않고 서버 API를 통해 BigQuery와 Drive에 직접 전송한다.
 */
export function usePdfUpload() {
  const [uploadStatus, setUploadStatus] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);

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
        throw new Error(`BigQuery INSERT 실패: ${res.status} ${text.substring(0, 200)}`);
      }

      const data = await res.json().catch(() => ({}));
      if (data.success === false) {
        throw new Error(data.message || 'BigQuery INSERT 결과가 실패로 반환되었습니다.');
      }

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
        throw new Error(`Drive 업로드 실패: ${res.status} ${text.substring(0, 200)}`);
      }

      const data = await res.json();
      if (!data.success || data.failed_count > 0 || data.uploaded_count === 0) {
        const firstError = Array.isArray(data.errors) && data.errors.length > 0
          ? data.errors[0]?.message
          : null;
        throw new Error(firstError || 'Drive 업로드 결과가 실패로 반환되었습니다.');
      }

      return { success: true, data };
    } catch (err) {
      console.error('[usePdfUpload] Drive 업로드 실패:', err);
      return { success: false, error: err.message };
    }
  }, []);

  const processUploads = useCallback(async (results, fileName) => {
    setUploading(true);

    const targets = results.filter((result) => result.extracted?.include);
    const total = targets.length;

    setUploadProgress({
      totalItems: total,
      bqDone: 0,
      bqTotal: total,
      driveDone: 0,
      driveTotal: total,
      completed: false,
      status: 'bq',
    });

    const stats = {
      jsonOk: 0,
      jsonFail: 0,
      imageOk: 0,
      imageFail: 0,
      unmatchedSites: [],
    };

    try {
      console.log('[usePdfUpload] Step 1: BigQuery 전송 시작');
      for (const result of targets) {
        const extracted = result.extracted;
        try {
          const bqResult = await insertToBigQuery(extracted, fileName);
          if (bqResult.success) {
            stats.jsonOk += 1;
            if (bqResult.manualReviewRequired || extracted.record?._site_unresolved) {
              stats.unmatchedSites.push({
                name: bqResult.siteNameRaw || extracted.record?.site_name || '미확인현장',
                unresolved: Boolean(extracted.record?._site_unresolved),
              });
            }
          } else {
            stats.jsonFail += 1;
            console.error('[usePdfUpload] BigQuery 전송 실패:', bqResult.error);
          }
        } catch (err) {
          stats.jsonFail += 1;
          console.error('[usePdfUpload] BigQuery 전송 예외:', err);
        } finally {
          setUploadProgress((prev) => ({
            ...prev,
            bqDone: prev.bqDone + 1,
          }));
        }
      }

      if (stats.jsonOk > 0) {
        await new Promise((resolve) => setTimeout(resolve, 4000));
      }

      console.log('[usePdfUpload] Step 2: Drive 업로드 시작');
      setUploadProgress((prev) => ({ ...prev, status: 'drive' }));

      for (const result of targets) {
        const extracted = result.extracted;
        try {
          if (!result.imgBlob) {
            throw new Error('업로드할 페이지 이미지가 없습니다.');
          }

          const driveResult = await uploadToDrive(
            result.imgBlob,
            extracted.basename,
            extracted.category || '성적서',
            extracted.record?.report_date
          );

          if (driveResult.success) {
            stats.imageOk += 1;
          } else {
            stats.imageFail += 1;
            console.error('[usePdfUpload] Drive 업로드 실패:', driveResult.error);
          }
        } catch (err) {
          stats.imageFail += 1;
          console.error('[usePdfUpload] Drive 업로드 예외:', err);
        } finally {
          setUploadProgress((prev) => ({
            ...prev,
            driveDone: prev.driveDone + 1,
          }));
        }
      }

      const finalStatus = {
        ...stats,
        completed: true,
        status: 'completed',
      };

      setUploadProgress((prev) => ({
        ...prev,
        ...finalStatus,
      }));
      setUploadStatus(finalStatus);
      return stats;
    } catch (err) {
      const errorStatus = {
        ...stats,
        error: err.message,
        completed: false,
        status: 'error',
      };
      console.error('[usePdfUpload] 프로세스 실패:', err);
      setUploadStatus(errorStatus);
      setUploadProgress((prev) => ({
        ...prev,
        ...errorStatus,
      }));
      return stats;
    } finally {
      setUploading(false);
    }
  }, [insertToBigQuery, uploadToDrive]);

  const resetStatus = useCallback(() => {
    setUploadStatus(null);
    setUploading(false);
    setUploadProgress(null);
  }, []);

  return {
    uploadStatus,
    uploading,
    uploadProgress,
    insertToBigQuery,
    uploadToDrive,
    processUploads,
    resetStatus,
    setUploadStatus,
    isComplete: uploadStatus?.completed || false,
    hasError: uploadStatus?.error != null,
  };
}

export default usePdfUpload;
