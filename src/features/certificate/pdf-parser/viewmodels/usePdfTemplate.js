import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'roi_template';

/**
 * PDF ROI 템플릿 관리 Hook
 * localStorage에 템플릿 저장/불러오기
 */
export function usePdfTemplate() {
  const [globalBoxes, setGlobalBoxes] = useState({});
  const [activeField, setActiveField] = useState(null);
  const [showTemplateBoxes, setShowTemplateBoxes] = useState(true);

  // 초기 로드
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setGlobalBoxes(parsed);
        console.log('[usePdfTemplate] 템플릿 로드:', Object.keys(parsed));
      }
    } catch (e) {
      console.error('[usePdfTemplate] 로드 실패:', e);
    }
  }, []);

  /**
   * 템플릿 저장
   */
  const saveTemplate = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(globalBoxes));
      console.log('[usePdfTemplate] 템플릿 저장:', Object.keys(globalBoxes));
      return true;
    } catch (e) {
      console.error('[usePdfTemplate] 저장 실패:', e);
      return false;
    }
  }, [globalBoxes]);

  /**
   * 템플릿 초기화
   */
  const clearTemplate = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setGlobalBoxes({});
      setActiveField(null);
      console.log('[usePdfTemplate] 템플릿 초기화');
      return true;
    } catch (e) {
      console.error('[usePdfTemplate] 초기화 실패:', e);
      return false;
    }
  }, []);

  /**
   * 특정 필드 박스 설정
   */
  const setBox = useCallback((field, box) => {
    setGlobalBoxes(prev => ({
      ...prev,
      [field]: box,
    }));
  }, []);

  /**
   * 특정 필드 박스 제거
   */
  const removeBox = useCallback((field) => {
    setGlobalBoxes(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  /**
   * 박스 토글 (있으면 제거, 없으면 활성화)
   */
  const toggleField = useCallback((field) => {
    setActiveField(prev => prev === field ? null : field);
  }, []);

  /**
   * 템플릿 불러오기 (외부에서 호출)
   */
  const loadTemplate = useCallback(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setGlobalBoxes(parsed);
        return parsed;
      }
      return null;
    } catch (e) {
      console.error('[usePdfTemplate] 수동 로드 실패:', e);
      return null;
    }
  }, []);

  return {
    // State
    globalBoxes,
    activeField,
    showTemplateBoxes,
    
    // Setters
    setGlobalBoxes,
    setActiveField,
    setShowTemplateBoxes,
    
    // Actions
    saveTemplate,
    clearTemplate,
    setBox,
    removeBox,
    toggleField,
    loadTemplate,
    
    // Computed
    hasTemplate: Object.keys(globalBoxes).length > 0,
    fieldCount: Object.keys(globalBoxes).length,
  };
}

export default usePdfTemplate;
