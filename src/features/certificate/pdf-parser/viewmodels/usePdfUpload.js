import { useState, useCallback } from 'react';
import { getApiBase } from '../../../../core/api/serverConfig';

const adminHeaders = () => ({
  'x-user-role': 'super_admin',
  'x-user-name': 'admin',
});

function parseSampleDateFromPdfName(pdfName) {
  const yearMatch = String(pdfName || '').match(/^(\d{2,4})[-_.](\d{2})[-_.](\d{2})/);
  const parenMatch = String(pdfName || '').match(/\((\d{1,2})\.(\d{1,2})\)/);
  if (!yearMatch || !parenMatch) return null;
  const year = yearMatch[1].length === 2 ? `20${yearMatch[1]}` : yearMatch[1];
  return `${year}-${String(parenMatch[1]).padStart(2, '0')}-${String(parenMatch[2]).padStart(2, '0')}`;
}

function toBase64Utf8(value) {
  const text = String(value ?? '');
  if (!text) return '';
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

/**
 * PDF 업로드 처리 Hook
 * 중앙관리자 앱은 로컬 SQLite 큐를 거치지 않고 서버 API를 통해 BigQuery와 Drive에 직접 전송한다.
 */
export function usePdfUpload() {
  const [uploadStatus, setUploadStatus] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);

  const uploadToDrive = useCallback(async (blob, basename, category = '성적서', reportDate, meta = {}) => {
    try {
      const formData = new FormData();
      const pageNo = Number(meta.pageOrder || 0);
      const tempFileName = `certificate-page-${String(pageNo || 1).padStart(4, '0')}.jpg`;
      formData.append('files', blob, tempFileName);
      formData.append('report_date', reportDate || new Date().toISOString().split('T')[0]);
      formData.append('category', category === 'mlss' ? 'mlss' : 'certificate');
      if (meta.sourcePdfName) formData.append('source_pdf_name_b64', toBase64Utf8(meta.sourcePdfName));
      if (meta.siteName) formData.append('site_name_b64', toBase64Utf8(meta.siteName));
      if (category) formData.append('category_b64', toBase64Utf8(category));
      if (meta.sampleDate) formData.append('sample_date', meta.sampleDate);
      if (meta.pageOrder != null) formData.append('page_order', String(meta.pageOrder));

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
      
      const firstError = Array.isArray(data.errors) && data.errors.length > 0 ? data.errors[0] : null;
      const isDuplicate = firstError && (
        String(firstError.message).includes('이미 전송된 성적서') || 
        String(firstError.code) === 'ALREADY_EXISTS'
      );
      
      if (isDuplicate) {
        return { success: false, alreadyExists: true };
      }

      if (!data.success || data.failed_count > 0 || data.uploaded_count === 0) {
        throw new Error(firstError?.message || 'Drive 업로드 결과가 실패로 반환되었습니다.');
      }

      return { success: true, data };
    } catch (err) {
      console.error('[usePdfUpload] 실제 Drive 업로드 실패:', err.message);
      return { success: false, error: err.message };
    }
  }, []);

  const processUploads = useCallback(async (results, sourcePdfName = '') => {
    setUploading(true);

    const targets = results.filter((result) => result.extracted?.include);
    const total = targets.length;

    setUploadProgress({
      totalItems: total,
      driveDone: 0,
      driveTotal: total,
      completed: false,
      status: 'drive',
      currentFileName: '',
    });

    const stats = {
      imageOk: 0,
      imageFail: 0,
      imageExists: 0,
    };

    try {
      console.log('[usePdfUpload] Drive 업로드 시작');

      for (let index = 0; index < targets.length; index += 1) {
        const result = targets[index];
        const extracted = result.extracted;
        setUploadProgress((prev) => ({
          ...prev,
          currentFileName: `${extracted.basename}.jpg`,
        }));

        try {
          if (!result.imgBlob) {
            throw new Error('업로드할 페이지 이미지가 없습니다.');
          }

          const driveResult = await uploadToDrive(
            result.imgBlob,
            extracted.basename,
            extracted.category || '성적서',
            extracted.record?.report_date,
            {
              sourcePdfName,
              siteName: extracted.record?.site_name,
              sampleDate: extracted.category === 'mlss' ? parseSampleDateFromPdfName(sourcePdfName) : null,
              pageOrder: index + 1,
            }
          );

          if (driveResult.success) {
            stats.imageOk += 1;
            setUploadProgress((prev) => ({ ...prev, imageOk: (prev.imageOk || 0) + 1 }));
          } else if (driveResult.alreadyExists) {
            stats.imageExists += 1;
            setUploadProgress((prev) => ({ ...prev, imageExists: (prev.imageExists || 0) + 1 }));
          } else {
            stats.imageFail += 1;
            setUploadProgress((prev) => ({ ...prev, imageFail: (prev.imageFail || 0) + 1 }));
            console.error('[usePdfUpload] Drive 업로드 실패:', driveResult.error);
          }
        } catch (err) {
          const errText = err.message || '';
          const isAlreadyExists = errText.includes('이미 전송된 성적서') || errText.includes('ALREADY_EXISTS');
          if (isAlreadyExists) {
            stats.imageExists += 1;
            setUploadProgress((prev) => ({ ...prev, imageExists: (prev.imageExists || 0) + 1 }));
          } else {
            stats.imageFail += 1;
            setUploadProgress((prev) => ({ ...prev, imageFail: (prev.imageFail || 0) + 1 }));
            console.error('[usePdfUpload] Drive 업로드 예외:', errText);
          }
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
  }, [uploadToDrive]);

  const resetStatus = useCallback(() => {
    setUploadStatus(null);
    setUploading(false);
    setUploadProgress(null);
  }, []);

  return {
    uploadStatus,
    uploading,
    uploadProgress,
    uploadToDrive,
    processUploads,
    resetStatus,
    setUploadStatus,
    isComplete: uploadStatus?.completed || false,
    hasError: uploadStatus?.error != null,
  };
}

export default usePdfUpload;
