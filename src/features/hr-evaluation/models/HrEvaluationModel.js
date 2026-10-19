import { apiClient } from '../../../core/api';

/**
 * [근태 및 인사고과] 백엔드 BigQuery 및 Google Drive 연동 Model
 */
export const HrEvaluationModel = {
  /**
   * 서버에 저장된 일별 기록, 월별/연간 평가, 설정값, 소통게시판 사유글 조회
   */
  async fetchHrData(year, month) {
    try {
      const res = await apiClient.get('/api/hr-evaluation/data', { year, month });
      return res?.data || null;
    } catch (err) {
      console.warn('[HrEvaluationModel] fetchHrData 실패 (로컬 캐시 사용):', err.message);
      return null;
    }
  },

  /**
   * 변경된 일별 기록, 월간/연간 평가, 기준 설정을 서버(BigQuery + 서버 캐시)로 일괄 배치 동기화
   */
  async syncHrBatch(payload) {
    try {
      const res = await apiClient.post('/api/hr-evaluation/sync-batch', payload);
      return res?.result || { success: true };
    } catch (err) {
      console.warn('[HrEvaluationModel] syncHrBatch 실패 (로컬 큐 유지):', err.message);
      return { success: false, error: err.message };
    }
  },

  /**
   * 시말서 스캔본 파일을 Google Drive로 업로드
   */
  async uploadApologyScan(payload) {
    try {
      const res = await apiClient.post('/api/hr-evaluation/apology-upload', payload);
      return res?.result || null;
    } catch (err) {
      console.warn('[HrEvaluationModel] uploadApologyScan 실패:', err.message);
      return null;
    }
  },
};
