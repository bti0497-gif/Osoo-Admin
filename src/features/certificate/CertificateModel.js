import { apiClient } from '../../core/api';

export const CertificateModel = {
    async fetchList({ siteName, year, month } = {}, authHeaders = {}) {
        const params = {};
        if (siteName) {
            params.siteName = siteName;
        }
        if (year) {
            params.year = year;
        }
        if (month) {
            params.month = month;
        }
        return apiClient.get('/api/certificates', params, {
            headers: authHeaders,
        });
    },

    async syncCache({ siteName, year, month } = {}, authHeaders = {}) {
        return apiClient.post('/api/certificates/sync-cache', {
            siteName,
            year,
            month,
        }, {
            headers: authHeaders,
        });
    },

    /**
     * AI Studio 등에서 받은 batch_export.zip (all_pages_data.json + pages/ 이미지)
     * 서버: POST /api/certificates/manual-upload-zip (관리자, x-user-role 헤더 필요)
     */
    async uploadBatchZip(file, authHeaders = {}, uploadTaskId = '') {
        const formData = new FormData();
        formData.append('bundleZip', file);
        if (uploadTaskId) {
            formData.append('uploadTaskId', uploadTaskId);
        }
        return apiClient.upload('/api/certificates/manual-upload-zip', formData, {
            headers: authHeaders,
        });
    },

    async fetchZipUploadProgress(taskId, userRole = '') {
        return apiClient.get('/api/certificates/manual-upload-zip-progress', {
            taskId,
            _role: userRole || '',
        });
    },

    async getDownloadInfo(certificateId) {
        return apiClient.get(`/api/certificates/${certificateId}/download`);
    },

    /**
     * 선택된 파일들을 PDF로 병합하여 다운로드 (form 방식)
     * @param {string[]} fileIds - 병합할 파일 ID 목록
     * @param {string} fileName - 다운로드할 파일명
     */
    downloadMergedPdf(fileIds, fileName) {
        // Form을 사용하여 바로 다운로드 (API 서버 8901 포트로)
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = 'http://localhost:8901/api/certificates/merge-download';
        form.target = '_blank';
        
        // fileIds를 JSON으로
        const fileIdsInput = document.createElement('input');
        fileIdsInput.type = 'hidden';
        fileIdsInput.name = 'fileIds';
        fileIdsInput.value = JSON.stringify(fileIds);
        form.appendChild(fileIdsInput);
        
        // fileName
        const fileNameInput = document.createElement('input');
        fileNameInput.type = 'hidden';
        fileNameInput.name = 'fileName';
        fileNameInput.value = fileName || '';
        form.appendChild(fileNameInput);
        
        document.body.appendChild(form);
        form.submit();
        document.body.removeChild(form);
        
        return { success: true };
    },

    /**
     * 병합된 PDF 다운로드 (프로그레스 추적 가능)
     * @param {string[]} fileIds - 다운로드할 파일 ID 목록
     * @param {number} year - 연도
     * @param {Function} onProgress - 프로그레스 콜백 (current, total, percent)
     * @param {object} authHeaders - 인증 헤더
     */
    async downloadMergedPdfWithProgress(fileIds, year, onProgress, authHeaders = {}) {
        const total = fileIds.length;
        
        // 프로그레스 시작
        if (onProgress) onProgress(0, total, 0);
        
        // 먼저 서버에 병합 요청하여 파일 URL 받기
        const response = await apiClient.post('/api/certificates/download-merged-pdf', {
            fileIds,
            year,
            waitForMerge: true
        }, {
            headers: authHeaders,
            responseType: 'blob',
            onDownloadProgress: (progressEvent) => {
                if (progressEvent.total) {
                    const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    if (onProgress) onProgress(1, 1, percent);
                }
            }
        });
        
        // 다운로드 완료
        if (onProgress) onProgress(1, 1, 100);
        
        // Blob으로 다운로드
        const blob = new Blob([response.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `성적서_${year}_${new Date().getMonth() + 1}월.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        return { success: true };
    },

    /**
     * 선택한 성적서 삭제 (Drive + BigQuery)
     * @param {string[]} fileIds - 삭제할 Drive 파일 ID 목록
     * @param {object} authHeaders - 인증 헤더
     */
    async deleteSelected(fileIds, authHeaders = {}) {
        return apiClient.post('/api/certificates/bulk-delete-by-ids', {
            fileIds,
        }, {
            headers: authHeaders,
            timeout: 120000, // 2분 (삭제할 파일이 많을 수 있음)
        });
    },

    /**
     * 특정 년월의 성적서 전체 삭제 (Drive + BigQuery)
     * @param {number} year
     * @param {number} month
     * @param {string} siteName - 'ALL' 또는 특정 현장명
     * @param {object} authHeaders - 인증 헤더
     */
    async deleteByPeriod(year, month, siteName = 'ALL', authHeaders = {}) {
        return apiClient.post('/api/certificates/bulk-delete-by-period', {
            year,
            month,
            siteName,
        }, {
            headers: authHeaders,
        });
    },

    /**
     * 단건 삭제 (프로그레시브 삭제용)
     * @param {string} fileId - 삭제할 Drive 파일 ID
     * @param {number} index - 현재 인덱스
     * @param {number} total - 전체 개수
     * @param {object} authHeaders - 인증 헤더
     */
    async deleteOne(fileId, index, total, authHeaders = {}) {
        return apiClient.post('/api/certificates/delete-one', {
            fileId,
            index,
            total,
        }, {
            headers: authHeaders,
            timeout: 30000,
        });
    },
};