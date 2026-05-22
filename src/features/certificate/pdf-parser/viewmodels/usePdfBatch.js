import { useState, useCallback } from 'react';

/**
 * PDF 배치 처리 상태 관리 Hook
 * Gemini API 호출 및 진행 상태 관리
 */
export function usePdfBatch() {
  const [batchProgress, setBatchProgress] = useState({
    active: false,
    current: 0,
    total: 0,
    stage: null, // 'preparing' | 'uploading' | null
    pages: [],   // { pageNum, status: 'pending'|'extracting'|'done'|'error', data? }
  });

  /**
   * 배치 시작
   */
  const startBatch = useCallback((totalPages) => {
    setBatchProgress({
      active: true,
      current: 0,
      total: totalPages,
      stage: 'preparing',
      pages: Array.from({ length: totalPages }, (_, i) => ({
        pageNum: i + 1,
        status: 'pending',
      })),
    });
  }, []);

  /**
   * 특정 페이지 상태 업데이트
   */
  const updatePageStatus = useCallback((pageNum, status, data = null) => {
    setBatchProgress(prev => ({
      ...prev,
      current: status === 'extracting' ? pageNum : prev.current,
      pages: prev.pages.map(p => 
        p.pageNum === pageNum 
          ? { ...p, status, data, ...(data && { extracted: data }) }
          : p
      ),
    }));
  }, []);

  /**
   * 단계 변경
   */
  const setStage = useCallback((stage) => {
    setBatchProgress(prev => ({ ...prev, stage }));
  }, []);

  /**
   * 현재 페이지 증가
   */
  const incrementCurrent = useCallback(() => {
    setBatchProgress(prev => ({ ...prev, current: prev.current + 1 }));
  }, []);

  /**
   * 배치 완료
   */
  const completeBatch = useCallback(() => {
    setBatchProgress(prev => ({
      ...prev,
      active: false,
      stage: null,
    }));
  }, []);

  /**
   * 배치 취소/리셋
   */
  const resetBatch = useCallback(() => {
    setBatchProgress({
      active: false,
      current: 0,
      total: 0,
      stage: null,
      pages: [],
    });
  }, []);

  /**
   * 성공/실패 카운트
   */
  const getStats = useCallback(() => {
    const done = batchProgress.pages.filter(p => p.status === 'done').length;
    const error = batchProgress.pages.filter(p => p.status === 'error').length;
    const extracting = batchProgress.pages.filter(p => p.status === 'extracting').length;
    return { done, error, extracting, pending: batchProgress.total - done - error - extracting };
  }, [batchProgress]);

  return {
    // State
    batchProgress,
    
    // Actions
    startBatch,
    updatePageStatus,
    setStage,
    incrementCurrent,
    completeBatch,
    resetBatch,
    
    // Computed
    getStats,
    isActive: batchProgress.active,
    progressPercent: batchProgress.total > 0 
      ? Math.round((batchProgress.current / batchProgress.total) * 100) 
      : 0,
  };
}

export default usePdfBatch;
